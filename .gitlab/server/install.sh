#!/usr/bin/env bash
set -euo pipefail
[[ $(id -u) == 0 ]] || { echo 'Run as root using sudo' >&2; exit 1; }
cd "$(dirname "${BASH_SOURCE[0]}")"
: "${1:?Usage: install.sh deployment-public-key-file [existing-ssh-user]}"
deploy_user=${2:-ubuntu}
[[ "$deploy_user" =~ ^[a-z_][a-z0-9_-]*$ ]] || exit 2
public_key=$(cat "$1")
[[ "$public_key" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+(\ .*)?$ ]] || { echo 'Expected an Ed25519 public key' >&2; exit 2; }
[[ "$public_key" != *$'\n'* ]] || exit 2
user_home=$(getent passwd "$deploy_user" | cut -d: -f6)
[[ -d "$user_home" ]] || exit 2
install -d -o root -g root -m 0755 /opt/kaiming-cicd
install -o root -g root -m 0755 deploy.py /opt/kaiming-cicd/deploy.py
if [[ ! -e /opt/kaiming-cicd/config.json ]]; then
  install -o root -g root -m 0600 config.example.json /opt/kaiming-cicd/config.json
fi
SSH_ORIGINAL_COMMAND=status /usr/bin/python3 -I /opt/kaiming-cicd/deploy.py
# Reuse the existing user's sudo authorization without changing sudoers/sshd.
sudo -u "$deploy_user" sudo -n /usr/bin/true
install -d -o "$deploy_user" -g "$(id -gn "$deploy_user")" -m 0700 "$user_home/.ssh"
authorized="$user_home/.ssh/authorized_keys"
[[ ! -L "$authorized" ]] || { echo 'Refusing a symlinked authorized_keys' >&2; exit 1; }
forced='restrict,command="sudo -n --preserve-env=SSH_ORIGINAL_COMMAND /usr/bin/python3 -I /opt/kaiming-cicd/deploy.py" '
entry="$forced$public_key"
if ! grep -Fxq "$entry" "$authorized" 2>/dev/null; then
  if [[ -f "$authorized" ]]; then
    cp -p "$authorized" "$authorized.before-cicd-$(date -u +%Y%m%dT%H%M%SZ)"
  fi
  printf '\n%s\n' "$entry" >> "$authorized"
fi
chown "$deploy_user:$(id -gn "$deploy_user")" "$authorized"
chmod 0600 "$authorized"
printf 'Restricted deployment key installed for %s\n' "$deploy_user"
