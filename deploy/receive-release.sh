#!/usr/bin/env bash
set -euo pipefail
umask 077

die() { printf 'computing-lab-receive: %s\n' "$*" >&2; exit 1; }

[[ "$EUID" == 0 && $# == 0 ]] || die 'expected a release stream on stdin'
IFS= read -r -t 10 -n 106 header || die 'missing release header'
[[ "$header" =~ ^([0-9a-f]{40})\ ([0-9a-f]{64})$ ]] || die 'invalid release header'
sha="${BASH_REMATCH[1]}"
expected="${BASH_REMATCH[2]}"

exec 8>/run/lock/computing-lab-upload.lock
flock -n 8 || die 'another release is being received or published'

stage="$(mktemp -d /var/lib/computing-lab-release/.upload.XXXXXXXX)"
trap 'rm -rf -- "$stage"' EXIT
archive="$stage/source.tar.gz"
limit=268435456
timeout 180 head -c "$((limit + 1))" >"$archive" || die 'upload timed out'
size="$(stat -c %s "$archive")"
((size > 0 && size <= limit)) || die 'invalid archive size'
digest="$(sha256sum <"$archive")"
[[ "${digest%% *}" == "$expected" ]] || die 'archive checksum mismatch'
printf 'Accepted %s bytes for %s\n' "$size" "$sha"
unit="computing-lab-push-$sha.service"

trap - EXIT
systemd-run --unit="$unit" --wait --collect -p RuntimeMaxSec=45min \
  -p Type=exec -p StandardOutput=journal -p StandardError=journal \
  -p "ExecStopPost=/usr/bin/rm -rf -- $stage" \
  /usr/local/libexec/computing-lab/release.sh "$sha" "$archive" "$expected" </dev/null || {
  if ! systemctl is-active --quiet "$unit"; then rm -rf -- "$stage"; fi
  printf 'Release failed; inspect %s on the host\n' "$unit" >&2
  exit 1
}
