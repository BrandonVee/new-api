#!/usr/bin/env bash
set -euo pipefail
# The server key can only invoke the fixed deployment dispatcher.
action=${1:-}
component=${2:-}
if [[ "$action" != deploy && "$action" != rollback ]] || [[ "$component" != docs && "$component" != gateway ]]; then
  echo 'Usage: deploy.sh deploy|rollback docs|gateway' >&2
  exit 2
fi
: "${DEPLOY_HOST:?Set DEPLOY_HOST}"
: "${DEPLOY_USER:?Set DEPLOY_USER}"
: "${SSH_PRIVATE_KEY:?Set SSH_PRIVATE_KEY as a protected file variable}"
: "${SSH_KNOWN_HOSTS:?Set SSH_KNOWN_HOSTS as a protected file variable}"
DEPLOY_PORT=${DEPLOY_PORT:-22}
[[ "$DEPLOY_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || exit 2
[[ "$DEPLOY_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || exit 2
[[ "$DEPLOY_PORT" =~ ^[0-9]+$ ]] && (( DEPLOY_PORT > 0 && DEPLOY_PORT <= 65535 )) || exit 2
[[ -s "$SSH_PRIVATE_KEY" && -s "$SSH_KNOWN_HOSTS" ]] || { echo 'SSH file variables are empty or missing' >&2; exit 2; }
workdir=$(mktemp -d)
trap 'rm -rf -- "$workdir"' EXIT
umask 077
cp -- "$SSH_PRIVATE_KEY" "$workdir/key"
cp -- "$SSH_KNOWN_HOSTS" "$workdir/known_hosts"
chmod 600 "$workdir/key" "$workdir/known_hosts"
ssh_args=(-F /dev/null -i "$workdir/key" -p "$DEPLOY_PORT" -l "$DEPLOY_USER"
  -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes
  -o "UserKnownHostsFile=$workdir/known_hosts" -o ConnectTimeout=15
  -o ServerAliveInterval=15 -o ServerAliveCountMax=4 -o LogLevel=ERROR)
if [[ "$action" == rollback ]]; then
  ssh "${ssh_args[@]}" "$DEPLOY_HOST" "rollback $component"
  exit
fi
: "${CI_COMMIT_SHA:?Missing CI_COMMIT_SHA}"
[[ "$CI_COMMIT_SHA" =~ ^[a-f0-9]{40}$ ]] || exit 2
artifact="dist/$component.tar.gz"
[[ -s "$artifact" ]] || { echo "Missing $artifact" >&2; exit 2; }
ssh "${ssh_args[@]}" "$DEPLOY_HOST" "deploy $component $CI_COMMIT_SHA" < "$artifact"
