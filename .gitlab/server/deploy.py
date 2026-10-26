#!/usr/bin/env python3
"""Restricted SSH deployment entry point; install root-owned, never from an artifact."""

import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import signal
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
from urllib.request import urlopen
from uuid import uuid4

CONFIG = Path("/opt/kaiming-cicd/config.json")
MAX_ARCHIVE_BYTES = 512 * 1024 * 1024
MAX_EXTRACTED_BYTES = 1024 * 1024 * 1024
MAX_FILES = 30000
RUNTIME_DOCKERFILE = '''FROM debian:bookworm-slim@sha256:f06537653ac770703bc45b4b113475bd402f451e85223f0f2837acbf89ab020a
RUN apt-get update \\
    && apt-get install -y --no-install-recommends ca-certificates tzdata libasan8 wget \\
    && rm -rf /var/lib/apt/lists/* \\
    && update-ca-certificates
COPY ai-gateway /
COPY LICENSE NOTICE THIRD-PARTY-LICENSES.md /licenses/
EXPOSE 3000
WORKDIR /data
ENTRYPOINT ["/ai-gateway"]
'''


class DeploymentError(Exception):
    pass


def parse_command(command):
    if command == "status":
        return "status", None, None
    match = re.fullmatch(r"deploy (docs|gateway) ([0-9a-f]{40})", command)
    if match:
        return "deploy", match[1], match[2]
    match = re.fullmatch(r"rollback (docs|gateway)", command)
    if match:
        return "rollback", match[1], None
    raise DeploymentError("Unsupported deployment command")


def load_config(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o077:
        raise DeploymentError("Configuration must be a root-owned 0600 regular file")
    config = json.loads(path.read_text())
    for key in ("docs_site_root", "gateway_compose_file", "release_root"):
        value = config[key]
        if not isinstance(value, str) or not value.startswith("/") or ".." in Path(value).parts:
            raise DeploymentError("Configuration paths must be absolute")
    for key in ("gateway_project", "gateway_service", "gateway_container"):
        if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.-]*", config[key]):
            raise DeploymentError("Invalid Docker resource name")
    if not config["docs_status_url"].startswith("https://"):
        raise DeploymentError("The documentation health URL must use HTTPS")
    if not config["gateway_status_url"].startswith(("https://", "http://127.0.0.1:")):
        raise DeploymentError("Invalid gateway health URL")
    return config


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as output:
        temporary = Path(output.name)
        os.fchmod(output.fileno(), 0o600)
        json.dump(value, output, indent=2, ensure_ascii=False)
        output.write("\n")
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, path)


def extract_artifact(stream, destination):
    """Extract only plain files/directories into a fresh directory with bounded IO."""
    destination.mkdir(mode=0o755)
    with tempfile.TemporaryFile() as archive:
        compressed = 0
        while chunk := stream.read(1024 * 1024):
            compressed += len(chunk)
            if compressed > MAX_ARCHIVE_BYTES:
                raise DeploymentError("Archive exceeds size limit")
            archive.write(chunk)
        archive.seek(0)
        seen = set()
        total = 0
        with tarfile.open(fileobj=archive, mode="r|gz") as source:
            for index, member in enumerate(source):
                if index >= MAX_FILES:
                    raise DeploymentError("Archive contains too many entries")
                name = PurePosixPath(member.name)
                if name.is_absolute() or ".." in name.parts or "\\" in member.name:
                    raise DeploymentError("Unsafe archive path")
                if not (member.isfile() or member.isdir()):
                    raise DeploymentError("Archive links and special files are forbidden")
                if name.as_posix() == "." and member.isdir():
                    continue
                if name in seen:
                    raise DeploymentError("Duplicate archive path")
                seen.add(name)
                total += member.size
                if member.size < 0 or total > MAX_EXTRACTED_BYTES:
                    raise DeploymentError("Extracted archive exceeds size limit")
                target = destination.joinpath(*name.parts)
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True, mode=0o755)
                    continue
                target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
                with source.extractfile(member) as incoming, target.open("xb") as output:
                    shutil.copyfileobj(incoming, output, length=1024 * 1024)
                target.chmod(0o644)


def read_manifest(release, component, commit=None):
    manifest = release / "release.json"
    if not manifest.is_file() or manifest.stat().st_size > 4096:
        raise DeploymentError("Release manifest missing or too large")
    value = json.loads(manifest.read_text())
    if value.get("component") != component or not re.fullmatch(r"[0-9a-f]{40}", value.get("commit", "")):
        raise DeploymentError("Invalid release manifest")
    if commit is not None and value["commit"] != commit:
        raise DeploymentError("Artifact commit does not match requested commit")
    return value


def receive_release(config, component, commit, stream):
    if component == "docs":
        releases = Path(config["docs_site_root"]).parent / "releases"
    else:
        releases = Path(config["release_root"]) / "gateway"
    releases.mkdir(parents=True, exist_ok=True, mode=0o755)
    staging = releases / (".incoming-" + uuid4().hex)
    try:
        extract_artifact(stream, staging)
        read_manifest(staging, component, commit)
        if component == "docs":
            if not (staging / "index.html").is_file() or not (staging / "assets").is_dir():
                raise DeploymentError("Documentation artifact is missing index.html or assets")
        else:
            required = {"ai-gateway", "Dockerfile", "LICENSE", "NOTICE", "THIRD-PARTY-LICENSES.md", "release.json"}
            files = {p.name for p in staging.iterdir()}
            if not required.issubset(files) or files - required - {"checksums.sha256"} or not all(p.is_file() for p in staging.iterdir()):
                raise DeploymentError("Gateway artifact has unexpected files")
            if "checksums.sha256" in files:
                checksum_lines = (staging / "checksums.sha256").read_text().splitlines()
                checked = set()
                for line in checksum_lines:
                    match = re.fullmatch(r"([a-f0-9]{64})  (?:\./)?([^/]+)", line)
                    if not match or match[2] not in required or match[2] in checked:
                        raise DeploymentError("Invalid gateway checksum manifest")
                    if hashlib.sha256((staging / match[2]).read_bytes()).hexdigest() != match[1]:
                        raise DeploymentError("Gateway checksum validation failed")
                    checked.add(match[2])
                if checked != required:
                    raise DeploymentError("Gateway checksum manifest is incomplete")
                # Keep only the validated runtime context; the checksum describes
                # the incoming Dockerfile, which is intentionally replaced below.
                (staging / "checksums.sha256").unlink()
            with (staging / "ai-gateway").open("rb") as binary:
                header = binary.read(20)
            if len(header) != 20 or header[:6] != b"\x7fELF\x02\x01" or header[18:20] != b"\x3e\x00":
                raise DeploymentError("Gateway binary must be ELF linux/amd64")
            (staging / "ai-gateway").chmod(0o755)
            # Uploaded build instructions are never executed on the host.
            (staging / "Dockerfile").write_text(RUNTIME_DOCKERFILE)
        release = releases / commit
        if release.exists():
            existing_files = sorted(p.relative_to(release) for p in release.rglob("*") if p.is_file())
            incoming_files = sorted(p.relative_to(staging) for p in staging.rglob("*") if p.is_file())
            if existing_files != incoming_files:
                raise DeploymentError("An immutable release already exists with different files")
            for relative in existing_files:
                if relative.as_posix() == "release.json":
                    existing_manifest = json.loads((release / relative).read_text())
                    incoming_manifest = json.loads((staging / relative).read_text())
                    for field in ("built_at", "pipeline_id"):
                        existing_manifest.pop(field, None)
                        incoming_manifest.pop(field, None)
                    if existing_manifest != incoming_manifest:
                        raise DeploymentError("An immutable release already exists with a different manifest")
                    continue
                if hashlib.sha256((release / relative).read_bytes()).digest() != hashlib.sha256((staging / relative).read_bytes()).digest():
                    raise DeploymentError("An immutable release already exists with different content")
            return release
        os.replace(staging, release)
        return release
    finally:
        if staging.exists():
            shutil.rmtree(staging)


def switch_docs(site_root, release):
    """Return the old target; preserve the original directory on first migration."""
    if site_root.is_symlink():
        previous = site_root.resolve(strict=True)
    elif site_root.is_dir():
        previous = site_root.parent / ("index-before-cicd-" + str(time.time_ns()))
        os.rename(site_root, previous)
    else:
        raise DeploymentError("The existing documentation root is missing")
    link = site_root.parent / (".index-" + uuid4().hex)
    try:
        # Relative targets resolve correctly inside OpenResty's bind mount.
        link.symlink_to(os.path.relpath(release, site_root.parent), target_is_directory=True)
        os.replace(link, site_root)
    except BaseException:
        if not site_root.exists() and not site_root.is_symlink():
            os.rename(previous, site_root)
        raise
    finally:
        link.unlink(missing_ok=True)
    return previous


def check_docs(config, commit):
    url = config["docs_status_url"].rstrip("/") + "/release.json?commit=" + commit
    with urlopen(url, timeout=10) as response:
        manifest = json.loads(response.read(4097))
    if manifest.get("component") != "docs" or manifest.get("commit") != commit:
        raise DeploymentError("Published documentation does not match the release")


def deploy_docs(config, release, state_path):
    commit = read_manifest(release, "docs")["commit"]
    site_root = Path(config["docs_site_root"])
    old = site_root.resolve()
    if old == release:
        check_docs(config, commit)
        return
    previous = switch_docs(site_root, release)
    try:
        check_docs(config, commit)
        write_json(state_path, {"current": str(release), "previous": str(previous), "commit": commit})
    except Exception:
        switch_docs(site_root, previous)
        raise DeploymentError("Documentation validation failed; previous release restored") from None


def run_docker(arguments, capture=False):
    result = subprocess.run(["docker", *arguments], check=False, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=600)
    if result.returncode:
        # Compose diagnostics can expand credentials. Do not forward raw output.
        raise DeploymentError("Docker command failed: " + arguments[0])
    return result.stdout if capture else None


def gateway_compose(config):
    path = Path(config["gateway_compose_file"])
    if path.is_symlink() or not path.is_file():
        raise DeploymentError("Gateway Compose configuration must be a regular JSON file")
    original = json.loads(path.read_text())
    if original.get("name", config["gateway_project"]) != config["gateway_project"]:
        raise DeploymentError("Compose project does not match configured project")
    service = original["services"][config["gateway_service"]]
    if not isinstance(service.get("image"), str):
        raise DeploymentError("Gateway service has no existing image")
    return path, original


def restart_gateway(config):
    compose = Path(config["gateway_compose_file"])
    run_docker(["compose", "--project-directory", str(compose.parent), "-p", config["gateway_project"], "-f", str(compose), "up", "-d", "--no-deps", "--no-build", "--pull", "never", config["gateway_service"]])


def verify_gateway(config, image, expected_id=None):
    tagged_id = run_docker(["image", "inspect", "--format", "{{.Id}}", image], capture=True).strip()
    if expected_id is not None and tagged_id != expected_id:
        raise DeploymentError("Gateway image tag moved; refusing to use a different image")
    expected_id = tagged_id
    for _ in range(30):
        output = run_docker(["inspect", "--format", '{{json .}}', config["gateway_container"]], capture=True)
        container = json.loads(output)
        state = container["State"]
        if container["Image"] != expected_id:
            raise DeploymentError("Running gateway image does not match release")
        if image.startswith("ai-gateway:ci-") and container["Config"].get("Labels", {}).get("org.opencontainers.image.revision") != image.removeprefix("ai-gateway:ci-"):
            raise DeploymentError("Running gateway revision label does not match release")
        if state.get("Running") and state.get("Health", {}).get("Status") == "healthy":
            try:
                with urlopen(config["gateway_status_url"], timeout=5) as response:
                    body = json.loads(response.read(128 * 1024))
                if body.get("success") is True:
                    return
            except (OSError, ValueError):
                pass
        if state.get("Status") in ("exited", "dead"):
            break
        time.sleep(5)
    raise DeploymentError("Gateway health check failed")


def deploy_gateway(config, release, state_path):
    commit = read_manifest(release, "gateway")["commit"]
    image = "ai-gateway:ci-" + commit
    compose_path, original = gateway_compose(config)
    previous_image = original["services"][config["gateway_service"]]["image"]
    container = json.loads(run_docker(["inspect", "--format", '{{json .}}', config["gateway_container"]], capture=True))
    labels = container["Config"].get("Labels", {})
    if labels.get("com.docker.compose.project") != config["gateway_project"] or labels.get("com.docker.compose.service") != config["gateway_service"]:
        raise DeploymentError("Running container does not belong to the configured service")
    if container["Config"].get("Image") != previous_image:
        raise DeploymentError("Running gateway and Compose image differ; reconcile before deployment")
    previous_id = container["Image"]
    if run_docker(["image", "inspect", "--format", "{{.Id}}", previous_image], capture=True).strip() != previous_id:
        raise DeploymentError("Current image tag moved; reconcile before deployment")
    # Pin the exact running image before changing any mutable configuration.
    previous_tag = "ai-gateway:rollback-" + previous_id.removeprefix("sha256:")
    previous_tag_id = run_docker(["image", "ls", "--quiet", "--no-trunc", previous_tag], capture=True).strip()
    if previous_tag_id and previous_tag_id != previous_id:
        raise DeploymentError("Rollback image tag does not match the running image")
    if not previous_tag_id:
        run_docker(["tag", previous_id, previous_tag])
    existing_id = run_docker(["image", "ls", "--quiet", "--no-trunc", image], capture=True).strip()
    if not existing_id:
        run_docker(["build", "--platform", "linux/amd64", "--label", "org.opencontainers.image.revision=" + commit, "-t", image, str(release)])
    revision = run_docker(["image", "inspect", "--format", '{{index .Config.Labels "org.opencontainers.image.revision"}}', image], capture=True).strip()
    if revision != commit:
        raise DeploymentError("Existing release image has a different revision label")
    image_id = run_docker(["image", "inspect", "--format", "{{.Id}}", image], capture=True).strip()
    if image == previous_image:
        verify_gateway(config, image, image_id)
        return
    backup = state_path.parent / ("compose-before-" + str(time.time_ns()) + ".json")
    write_json(backup, original)
    updated = json.loads(json.dumps(original))
    updated["services"][config["gateway_service"]]["image"] = image
    write_json(compose_path, updated)
    try:
        restart_gateway(config)
        verify_gateway(config, image, image_id)
        write_json(state_path, {"current": image, "previous": previous_tag, "current_id": image_id, "previous_id": previous_id, "commit": commit, "compose_backup": str(backup)})
    except Exception:
        if run_docker(["image", "inspect", "--format", "{{.Id}}", previous_image], capture=True).strip() != previous_id:
            raise DeploymentError("Previous image tag changed during deployment; automatic restoration refused") from None
        write_json(compose_path, original)
        restart_gateway(config)
        verify_gateway(config, previous_image, previous_id)
        raise DeploymentError("Gateway validation failed; previous image restored") from None


def rollback(config, component, state_path):
    state = json.loads(state_path.read_text())
    if component == "docs":
        site_root = Path(config["docs_site_root"])
        if str(site_root.resolve()) != state["current"]:
            raise DeploymentError("Documentation changed outside CI; reconcile before rollback")
        previous = Path(state["previous"])
        if not previous.is_dir() or not (previous / "index.html").is_file():
            raise DeploymentError("Previous documentation release is missing")
        current = switch_docs(site_root, previous)
        try:
            if (previous / "release.json").is_file():
                check_docs(config, read_manifest(previous, "docs")["commit"])
            else:
                with urlopen(config["docs_status_url"], timeout=10) as response:
                    if response.status != 200:
                        raise DeploymentError("Previous documentation health check failed")
        except Exception:
            switch_docs(site_root, current)
            raise DeploymentError("Rollback validation failed; current documentation restored") from None
    else:
        compose_path, current = gateway_compose(config)
        if current["services"][config["gateway_service"]]["image"] != state["current"]:
            raise DeploymentError("Gateway changed outside CI; reconcile before rollback")
        container = json.loads(run_docker(["inspect", "--format", '{{json .}}', config["gateway_container"]], capture=True))
        labels = container["Config"].get("Labels", {})
        if labels.get("com.docker.compose.project") != config["gateway_project"] or labels.get("com.docker.compose.service") != config["gateway_service"] or container["Image"] != state["current_id"]:
            raise DeploymentError("Running gateway changed outside CI; reconcile before rollback")
        current_id = run_docker(["image", "inspect", "--format", "{{.Id}}", state["current"]], capture=True).strip()
        if current_id != state["current_id"]:
            raise DeploymentError("Current gateway image tag changed; rollback refused")
        previous_id = run_docker(["image", "inspect", "--format", "{{.Id}}", state["previous"]], capture=True).strip()
        if previous_id != state["previous_id"]:
            raise DeploymentError("Previous gateway image tag changed; rollback refused")
        updated = json.loads(json.dumps(current))
        updated["services"][config["gateway_service"]]["image"] = state["previous"]
        write_json(compose_path, updated)
        try:
            restart_gateway(config)
            verify_gateway(config, state["previous"], state["previous_id"])
        except Exception:
            if run_docker(["image", "inspect", "--format", "{{.Id}}", state["current"]], capture=True).strip() != state["current_id"]:
                raise DeploymentError("Current image tag changed during rollback; automatic restoration refused") from None
            write_json(compose_path, current)
            restart_gateway(config)
            verify_gateway(config, state["current"], state["current_id"])
            raise DeploymentError("Rollback validation failed; current gateway restored") from None
    state["current"], state["previous"] = state["previous"], state["current"]
    if component == "gateway":
        state["current_id"], state["previous_id"] = state["previous_id"], state["current_id"]
    state.pop("commit", None)
    write_json(state_path, state)


def deployment_timeout(signum, frame):
    raise DeploymentError("Deployment exceeded time limit")


def main():
    signal.signal(signal.SIGALRM, deployment_timeout)
    signal.alarm(1800)
    action, component, commit = parse_command(os.environ.get("SSH_ORIGINAL_COMMAND", ""))
    config = load_config(CONFIG)
    state_dir = CONFIG.parent / "state"
    state_dir.mkdir(mode=0o700, exist_ok=True)
    with (state_dir / ((component or "status") + ".lock")).open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise DeploymentError("Another deployment is running") from None
        if action == "status":
            result = {"status": "ready", "docs_site_root": config["docs_site_root"], "gateway_project": config["gateway_project"], "gateway_service": config["gateway_service"]}
            for name in ("docs", "gateway"):
                path = state_dir / (name + ".json")
                if path.is_file():
                    state = json.loads(path.read_text())
                    result[name] = {key: state[key] for key in ("current", "previous", "commit") if key in state}
            print(json.dumps(result))
            return
        state_path = state_dir / (component + ".json")
        if action == "rollback":
            rollback(config, component, state_path)
        else:
            release = receive_release(config, component, commit, sys.stdin.buffer)
            if component == "docs":
                deploy_docs(config, release, state_path)
            else:
                deploy_gateway(config, release, state_path)
        print(json.dumps({"status": "success", "action": action, "component": component, "commit": commit}))


if __name__ == "__main__":
    try:
        main()
    except (DeploymentError, OSError, ValueError, KeyError, tarfile.TarError, subprocess.TimeoutExpired) as error:
        # Never emit configuration, process output, or archive contents on failure.
        message = str(error) if isinstance(error, DeploymentError) else type(error).__name__
        print(json.dumps({"status": "error", "message": message}), file=sys.stderr)
        sys.exit(1)
