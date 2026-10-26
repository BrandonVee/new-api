#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

: "${CI_COMMIT_SHA:?CI_COMMIT_SHA must identify the source commit}"
: "${CI_COMMIT_REF_SLUG:?CI_COMMIT_REF_SLUG is required}"
: "${CI_PIPELINE_ID:?CI_PIPELINE_ID is required}"
[[ "$CI_COMMIT_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "Invalid commit SHA" >&2; exit 1; }
[[ "$CI_PIPELINE_ID" =~ ^[0-9]+$ ]] || { echo "Invalid pipeline ID" >&2; exit 1; }
version="${CI_COMMIT_TAG:-${CI_COMMIT_REF_SLUG}-${CI_COMMIT_SHORT_SHA:-${CI_COMMIT_SHA:0:8}}}"
[[ "$version" =~ ^[A-Za-z0-9._+-]+$ ]] || { echo "Invalid release version" >&2; exit 1; }
[[ -s web/dist/index.html ]] || { echo "Frontend build artifact is missing" >&2; exit 1; }

mkdir -p dist
package_dir=$(mktemp -d "$PWD/dist/gateway-package.XXXXXX")
trap 'rm -rf "$package_dir"' EXIT

# Keep the production image identical to the existing runtime stage. The Runner
# compiles the application; production Docker only installs runtime libraries.
awk '
  /^FROM / { stage = "" }
  { stage = stage $0 "\n" }
  END { printf "%s", stage }
' Dockerfile > "$package_dir/Dockerfile"
runtime_copy='COPY --from=builder2 /build/ai-gateway /'
[[ $(grep -Fxc "$runtime_copy" "$package_dir/Dockerfile") == 1 ]] || {
  echo "The Dockerfile runtime copy changed; review the release packaging" >&2
  exit 1
}
sed 's|^COPY --from=builder2 /build/ai-gateway /$|COPY ai-gateway /ai-gateway|' \
  "$package_dir/Dockerfile" > "$package_dir/Dockerfile.tmp"
mv "$package_dir/Dockerfile.tmp" "$package_dir/Dockerfile"
if grep -q -- '--from=' "$package_dir/Dockerfile"; then
  echo "The runtime stage still requires another build stage" >&2
  exit 1
fi

pgo_dir=$(GOWORK=off go list -m -f '{{.Dir}}' github.com/Calcium-Ion/moejs)
[[ -s "$pgo_dir/default.pgo" ]] || { echo "The expected PGO profile is missing" >&2; exit 1; }
GOWORK=off CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GOEXPERIMENT=greenteagc \
  go build -pgo="$pgo_dir/default.pgo" \
  -ldflags "-s -w -X 'github.com/BrandonVee/ai-gateway/common.Version=$version'" \
  -o "$package_dir/ai-gateway" .
cp LICENSE NOTICE THIRD-PARTY-LICENSES.md "$package_dir/"

printf '{"component":"gateway","commit":"%s","version":"%s","pipeline_id":"%s","built_at":"%s","platform":"linux/amd64"}\n' \
  "$CI_COMMIT_SHA" "$version" "$CI_PIPELINE_ID" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  > "$package_dir/release.json"
(
  cd "$package_dir"
  sha256sum ai-gateway Dockerfile LICENSE NOTICE THIRD-PARTY-LICENSES.md release.json > checksums.sha256
)
tar -czf dist/gateway.tar.gz -C "$package_dir" .
printf 'Prepared gateway artifact for %s (%s)\n' "$version" "$CI_COMMIT_SHA"
