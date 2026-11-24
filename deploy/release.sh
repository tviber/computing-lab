#!/usr/bin/env bash
set -euo pipefail
umask 027

sha="${1:-}"
static_root=/srv/computing-lab
api_root=/srv/computing-lab-api
reconciler=/usr/local/libexec/computing-lab/reconcile.sh
api_deployer=/usr/local/libexec/computing-lab-api/api-release.sh
work_root=/var/lib/computing-lab-release

log() { printf 'computing-lab-release: %s\n' "$*"; }
die() { log "$*" >&2; exit 1; }
timed() {
  local phase=$1 started=$SECONDS
  shift
  log "starting $phase"
  "$@"
  log "$phase completed in $((SECONDS - started))s"
}
static() {
  systemd-run --quiet --wait --pipe --collect --uid=computing-lab --gid=computing-lab \
    -p NoNewPrivileges=yes -p PrivateTmp=yes -p ProtectHome=yes -p ProtectSystem=strict \
    -p "ReadWritePaths=$static_root" --setenv=DEPLOY_CONFIG=/etc/computing-lab/deploy.env \
    "$reconciler" "$@"
}
compare() {
  curl --fail --silent --show-error --proto '=https' --connect-timeout 8 --max-time 20 \
    --max-filesize 4194304 "https://api.github.com/repos/tviber/computing-lab/compare/$1...$2?per_page=1" \
    | /usr/bin/python3 -c 'import json,sys; print(json.load(sys.stdin)["status"])'
}
require_forward_release() {
  local current="$1" comparison
  [[ "$current" == "$sha" ]] && return 0
  [[ "$current" =~ ^[0-9a-f]{40}$ ]] || die 'active SHA is invalid'
  comparison="$(compare "$current" "$sha")"
  [[ "$comparison" == ahead ]] || die "requested SHA $sha does not advance active release $current ($comparison)"
}

[[ "$EUID" == 0 && "$sha" =~ ^[0-9a-f]{40}$ && "$sha" != 0000000000000000000000000000000000000000 ]] \
  || die 'expected a full release SHA'
if (($# != 1)); then
  [[ $# == 3 && -f "$2" && ! -L "$2" && "$3" =~ ^[0-9a-f]{64}$ ]] \
    || die 'expected a staged archive and SHA-256'
fi
exec 9>/run/lock/computing-lab-release.lock
timed release-lock flock -w 900 9

static_sha="$(cat "$static_root/state/current.sha")"
api_sha="$(cat "$api_root/state/deployed.sha")"
if [[ "$static_sha" == "$sha" && "$api_sha" == "$sha" ]]; then
  [[ "$(cat "$api_root/source/.release-sha")" == "$sha" ]] || die 'API source SHA does not match release marker'
  curl -fsS --max-time 5 http://127.0.0.1:8788/api/health | grep -q '"ok":true' || die 'active API is unhealthy'
  log "frontend and API already serve $sha"
  exit 0
fi
comparison="$(compare "$sha" main)"
[[ "$comparison" == ahead || "$comparison" == identical ]] || die "requested SHA $sha is outside GitHub main"
require_forward_release "$static_sha"
if [[ "$api_sha" != "$static_sha" ]]; then require_forward_release "$api_sha"; fi

install -d -o root -g computing-lab -m 0750 "$work_root"
stage="$(mktemp -d "$work_root/.release.XXXXXXXX")"
trap 'rm -rf -- "$stage"' EXIT
chgrp computing-lab "$stage"
chmod 0750 "$stage"
archive="$stage/source.tar.gz"
if (($# == 3)); then
  install -m 0600 -- "$2" "$archive"
else
  log "downloading GitHub archive for $sha"
  curl --fail --silent --show-error --proto '=https' --connect-timeout 8 --max-time 240 \
    --retry 2 --max-filesize 268435456 -o "$archive" "https://codeload.github.com/tviber/computing-lab/tar.gz/$sha"
fi
chgrp computing-lab "$archive"
chmod 0640 "$archive"
digest="$(sha256sum <"$archive")"
digest="${digest%% *}"
[[ "$digest" == "${3:-$digest}" ]] || die 'archive checksum mismatch'

timed static-prepare static prepare "$sha" "$archive" "$digest"
timed api-release "$api_deployer" "$sha" "$archive" "$digest"
[[ "$(cat "$api_root/state/deployed.sha")" == "$sha" ]] || die 'API did not reach the requested SHA'
timed static-activate static activate "$sha"
[[ "$(cat "$static_root/state/current.sha")" == "$sha" ]] || die 'frontend did not reach the requested SHA'
log "frontend and API published $sha"
