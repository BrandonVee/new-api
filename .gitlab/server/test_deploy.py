import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location("deploy", Path(__file__).with_name("deploy.py"))
deploy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(deploy)
SHA = "a" * 40
OLD_IMAGE_ID = "sha256:" + "b" * 64
NEW_IMAGE_ID = "sha256:" + "c" * 64


def artifact(entries):
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode="w:gz") as archive:
        for name, value in entries:
            member = tarfile.TarInfo(name)
            if isinstance(value, bytes):
                member.size = len(value)
                archive.addfile(member, io.BytesIO(value))
            else:
                member.type = value[0]
                member.linkname = "../../outside"
                archive.addfile(member)
    stream.seek(0)
    return stream


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.config = {
            "docs_site_root": str(self.root / "site" / "index"),
            "docs_status_url": "https://docs.example.test/",
            "release_root": str(self.root / "releases"),
            "gateway_compose_file": str(self.root / "compose.json"),
            "gateway_project": "ai-gateway",
            "gateway_service": "ai-gateway",
            "gateway_container": "ai-gateway-ai-gateway-1",
            "gateway_status_url": "http://127.0.0.1:3000/api/status",
        }

    def make_docs_release(self):
        old = Path(self.config["docs_site_root"])
        old.mkdir(parents=True)
        (old / "index.html").write_text("existing website")
        release = old.parent / "releases" / SHA
        release.mkdir(parents=True)
        (release / "index.html").write_text("new website")
        (release / "release.json").write_text(json.dumps({"component": "docs", "commit": SHA}))
        return old, release

    def make_gateway(self):
        original = {
            "name": "ai-gateway",
            "services": {
                "ai-gateway": {
                    "image": "ai-gateway:previous",
                    "environment": {"SESSION_SECRET": "${SESSION_SECRET}", "SQL_DSN": "${SQL_DSN}"},
                    "volumes": ["/opt/ai-gateway/data:/data"],
                    "ports": ["127.0.0.1:3000:3000"],
                },
                "postgres": {"image": "postgres:15", "volumes": ["pg_data:/var/lib/postgresql/data"]},
            },
            "volumes": {"pg_data": {}},
        }
        Path(self.config["gateway_compose_file"]).write_text(json.dumps(original))
        release = self.root / "gateway" / SHA
        release.mkdir(parents=True)
        (release / "release.json").write_text(json.dumps({"component": "gateway", "commit": SHA}))
        container = {"Image": OLD_IMAGE_ID, "Config": {"Image": "ai-gateway:previous", "Labels": {"com.docker.compose.project": "ai-gateway", "com.docker.compose.service": "ai-gateway"}}}
        self.gateway_container = container
        return original, release, container

    def gateway_docker(self, arguments, capture=False):
        if arguments[0] == "inspect":
            return json.dumps(self.gateway_container)
        if arguments[:2] == ["image", "ls"]:
            return ""
        if arguments[:2] == ["image", "inspect"]:
            if "revision" in arguments[3]:
                return SHA
            return OLD_IMAGE_ID if arguments[-1] == "ai-gateway:previous" or ":rollback-" in arguments[-1] else NEW_IMAGE_ID
        return None

    def test_only_exact_supported_ssh_commands_are_accepted(self):
        self.assertEqual(deploy.parse_command("deploy docs " + SHA), ("deploy", "docs", SHA))
        self.assertEqual(deploy.parse_command("rollback gateway"), ("rollback", "gateway", None))
        self.assertEqual(deploy.parse_command("status"), ("status", None, None))
        for command in ("status; id", "deploy docs ../abc", "deploy docs " + SHA + "\n", "rollback docs --force", "sh", "deploy gateway " + "a" * 39):
            with self.subTest(command=command), self.assertRaises(deploy.DeploymentError):
                deploy.parse_command(command)

    def test_archive_rejects_escape_paths_and_special_files(self):
        cases = [("../outside", b"bad"), ("/tmp/outside", b"bad"), ("nested/../../outside", b"bad"), ("link", (tarfile.SYMTYPE,)), ("link", (tarfile.LNKTYPE,)), ("device", (tarfile.CHRTYPE,))]
        for number, entry in enumerate(cases):
            with self.subTest(entry=entry), self.assertRaises(deploy.DeploymentError):
                deploy.extract_artifact(artifact([entry]), self.root / str(number))
        self.assertFalse((self.root / "outside").exists())

    def test_archive_accepts_tar_root_prefix_and_normalizes_permissions(self):
        stream = artifact([(".", (tarfile.DIRTYPE,)), ("./assets", (tarfile.DIRTYPE,)), ("./assets/app.js", b"hello")])
        destination = self.root / "unpacked"
        deploy.extract_artifact(stream, destination)
        self.assertEqual((destination / "assets/app.js").read_text(), "hello")
        self.assertEqual((destination / "assets/app.js").stat().st_mode & 0o777, 0o644)

    def test_archive_size_and_duplicate_limits(self):
        with patch.object(deploy, "MAX_EXTRACTED_BYTES", 4), self.assertRaises(deploy.DeploymentError):
            deploy.extract_artifact(artifact([("large", b"12345")]), self.root / "large")
        with self.assertRaises(deploy.DeploymentError):
            deploy.extract_artifact(artifact([("index.html", b"first"), ("./index.html", b"second")]), self.root / "duplicate")

    def test_manifest_rejects_wrong_component_or_commit(self):
        (self.root / "release.json").write_text(json.dumps({"component": "docs", "commit": SHA}))
        self.assertEqual(deploy.read_manifest(self.root, "docs", SHA)["commit"], SHA)
        with self.assertRaises(deploy.DeploymentError):
            deploy.read_manifest(self.root, "gateway", SHA)
        with self.assertRaises(deploy.DeploymentError):
            deploy.read_manifest(self.root, "docs", "b" * 40)

    def test_gateway_artifact_cannot_supply_executable_build_instructions(self):
        entries = [("ai-gateway", b"\x7fELF\x02\x01" + b"\0" * 12 + b"\x3e\x00")]
        entries += [(name, b"license") for name in ("LICENSE", "NOTICE", "THIRD-PARTY-LICENSES.md")]
        entries += [("Dockerfile", b"FROM alpine\nRUN malicious-command"), ("release.json", json.dumps({"component": "gateway", "commit": SHA}).encode())]
        release = deploy.receive_release(self.config, "gateway", SHA, artifact(entries))
        self.assertEqual((release / "Dockerfile").read_text(), deploy.RUNTIME_DOCKERFILE)
        self.assertEqual((release / "ai-gateway").stat().st_mode & 0o777, 0o755)

    def test_same_commit_rebuild_reuses_payload_despite_pipeline_metadata(self):
        entries = [("index.html", b"docs"), ("assets", (tarfile.DIRTYPE,))]
        first = {"component": "docs", "commit": SHA, "built_at": "first", "pipeline_id": "1"}
        release = deploy.receive_release(self.config, "docs", SHA, artifact(entries + [("release.json", json.dumps(first).encode())]))
        second = dict(first, built_at="second", pipeline_id="2")
        repeated = deploy.receive_release(self.config, "docs", SHA, artifact(entries + [("release.json", json.dumps(second).encode())]))
        self.assertEqual(repeated, release)
        self.assertEqual(json.loads((release / "release.json").read_text()), first)
        with self.assertRaises(deploy.DeploymentError):
            deploy.receive_release(self.config, "docs", SHA, artifact([("index.html", b"different"), ("assets", (tarfile.DIRTYPE,)), ("release.json", json.dumps(second).encode())]))

    def test_docs_publish_preserves_original_directory_and_supports_rollback(self):
        site, release = self.make_docs_release()
        state_path = self.root / "state/docs.json"
        with patch.object(deploy, "check_docs"):
            deploy.deploy_docs(self.config, release, state_path)
        state = json.loads(state_path.read_text())
        self.assertEqual(site.resolve(), release)
        self.assertEqual(Path(state["previous"]).joinpath("index.html").read_text(), "existing website")
        self.assertFalse(Path(site.readlink()).is_absolute())
        with patch.object(deploy, "urlopen") as request:
            request.return_value.__enter__.return_value.status = 200
            deploy.rollback(self.config, "docs", state_path)
        self.assertEqual(site.joinpath("index.html").read_text(), "existing website")
        self.assertTrue(release.exists())

    def test_docs_health_failure_restores_previous_site(self):
        site, release = self.make_docs_release()
        state_path = self.root / "state/docs.json"
        with patch.object(deploy, "check_docs", side_effect=OSError("unreachable")), self.assertRaises(deploy.DeploymentError):
            deploy.deploy_docs(self.config, release, state_path)
        self.assertEqual((site / "index.html").read_text(), "existing website")
        self.assertFalse(state_path.exists())

    def test_gateway_updates_only_image_and_preserves_database_configuration(self):
        original, release, container = self.make_gateway()
        state_path = self.root / "state/gateway.json"
        with patch.object(deploy, "run_docker", side_effect=self.gateway_docker) as docker, patch.object(deploy, "verify_gateway"):
            deploy.deploy_gateway(self.config, release, state_path)
        updated = json.loads(Path(self.config["gateway_compose_file"]).read_text())
        self.assertEqual(updated["services"]["ai-gateway"]["image"], "ai-gateway:ci-" + SHA)
        updated["services"]["ai-gateway"]["image"] = original["services"]["ai-gateway"]["image"]
        self.assertEqual(updated, original)
        calls = [call.args[0] for call in docker.call_args_list]
        compose = next(args for args in calls if args[0] == "compose")
        self.assertEqual(compose[-7:], ["up", "-d", "--no-deps", "--no-build", "--pull", "never", "ai-gateway"])
        backup = Path(json.loads(state_path.read_text())["compose_backup"])
        self.assertEqual(json.loads(backup.read_text()), original)
        self.assertEqual(backup.stat().st_mode & 0o777, 0o600)
        self.assertEqual(json.loads(state_path.read_text())["previous"], "ai-gateway:rollback-" + "b" * 64)

    def test_gateway_failed_health_check_restores_previous_compose_and_image(self):
        original, release, container = self.make_gateway()
        state_path = self.root / "state/gateway.json"
        with patch.object(deploy, "run_docker", side_effect=self.gateway_docker), patch.object(deploy, "verify_gateway", side_effect=[deploy.DeploymentError("failed"), None]) as health, self.assertRaises(deploy.DeploymentError):
            deploy.deploy_gateway(self.config, release, state_path)
        self.assertEqual(json.loads(Path(self.config["gateway_compose_file"]).read_text()), original)
        self.assertEqual(health.call_args.args[1], "ai-gateway:previous")
        self.assertFalse(state_path.exists())

    def test_gateway_reuses_existing_revision_image_without_rebuilding(self):
        _, release, _ = self.make_gateway()
        def existing_image(arguments, capture=False):
            if arguments[:2] == ["image", "ls"] and arguments[-1] == "ai-gateway:ci-" + SHA:
                return NEW_IMAGE_ID
            return self.gateway_docker(arguments, capture)
        with patch.object(deploy, "run_docker", side_effect=existing_image) as docker, patch.object(deploy, "verify_gateway"):
            deploy.deploy_gateway(self.config, release, self.root / "state/gateway.json")
        self.assertFalse(any(call.args[0][0] == "build" for call in docker.call_args_list))

    def test_gateway_rejects_current_tag_drift_before_replacing_container(self):
        original, release, _ = self.make_gateway()
        self.gateway_container["Image"] = "sha256:" + "d" * 64
        with patch.object(deploy, "run_docker", side_effect=self.gateway_docker) as docker, self.assertRaises(deploy.DeploymentError):
            deploy.deploy_gateway(self.config, release, self.root / "state/gateway.json")
        self.assertEqual(json.loads(Path(self.config["gateway_compose_file"]).read_text()), original)
        self.assertFalse(any(call.args[0][0] in ("build", "compose") for call in docker.call_args_list))

    def test_gateway_rollback_refuses_current_image_drift_before_compose_change(self):
        original, _, _ = self.make_gateway()
        state_path = self.root / "state/gateway.json"
        deploy.write_json(state_path, {"current": "ai-gateway:previous", "current_id": OLD_IMAGE_ID, "previous": "ai-gateway:rollback-" + "d" * 64, "previous_id": "sha256:" + "d" * 64})
        self.gateway_container["Image"] = NEW_IMAGE_ID
        with patch.object(deploy, "run_docker", side_effect=self.gateway_docker) as docker, self.assertRaises(deploy.DeploymentError):
            deploy.rollback(self.config, "gateway", state_path)
        self.assertEqual(json.loads(Path(self.config["gateway_compose_file"]).read_text()), original)
        self.assertFalse(any(call.args[0][0] == "compose" for call in docker.call_args_list))


if __name__ == "__main__":
    unittest.main()
