#!/usr/bin/env bash
set -euo pipefail
umask 077

die() { printf 'computing-lab-receive: %s\n' "$*" >&2; exit 1; }

publish() {
  local sha=$1 stage=$2 expected=$3 unit="computing-lab-push-$1.service" status
  systemd-run --unit="$unit" --wait --collect -p RuntimeMaxSec=45min \
    -p Type=exec -p StandardOutput=journal -p StandardError=journal \
    -p "ExecStopPost=/usr/bin/rm -rf -- $stage" \
    /usr/local/libexec/computing-lab/release.sh "$sha" "$stage/source.tar.gz" "$expected" </dev/null || {
    status=$?
    if ! systemctl is-active --quiet "$unit"; then rm -rf -- "$stage"; fi
    printf 'Release failed (systemd-run status %s); inspect %s on the host\n' "$status" "$unit" >&2
    return 1 # The sender must never interpret a publication status as a cache failure.
  }
}

[[ ${BASH_SOURCE[0]} == "$0" ]] || return 0
[[ "$EUID" == 0 && $# == 0 ]] || die 'expected a release stream on stdin'
cache_helper=/usr/local/libexec/computing-lab/bundle-cache.sh
cache() { runuser -u computing-lab-git -- "$cache_helper" "$@"; }
IFS= read -r -t 10 -n 116 header || die 'missing release header'
if [[ "$header" == base-v1 ]]; then
  cache base
  exit
fi
mode=archive
if [[ "$header" == 'bundle-v1 '* ]]; then mode=bundle; header=${header#bundle-v1 }; fi
[[ "$header" =~ ^([0-9a-f]{40})\ ([0-9a-f]{64})$ ]] || die 'invalid release header'
sha="${BASH_REMATCH[1]}"
expected="${BASH_REMATCH[2]}"

exec 8>/run/lock/computing-lab-upload.lock
flock -n 8 || die 'another release is being received or published'

stage="$(mktemp -d /var/lib/computing-lab-release/.upload.XXXXXXXX)"
trap 'rm -rf -- "$stage"' EXIT
archive="$stage/source.tar.gz"
payload="$stage/upload"
limit=268435456
timeout 1200 head -c "$((limit + 1))" >"$payload" || die 'upload timed out'
size="$(stat -c %s "$payload")"
((size > 0 && size <= limit)) || die 'invalid archive size'
digest="$(sha256sum <"$payload")"
[[ "${digest%% *}" == "$expected" ]] || die 'archive checksum mismatch'
printf 'Accepted %s bytes for %s\n' "$size" "$sha"
if [[ "$mode" == bundle ]]; then
  # Status 42 is reserved for cache reconstruction failure BEFORE publication.
  (ulimit -f 262144; timeout 120 runuser -u computing-lab-git -- "$cache_helper" unpack "$sha") \
    <"$payload" >"$archive" || exit 42
  digest=$(sha256sum <"$archive"); expected=${digest%% *}
else
  mv -- "$payload" "$archive"
fi
trap - EXIT
publish "$sha" "$stage" "$expected"
