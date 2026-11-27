#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RELEASE="$ROOT/deploy/release.sh"
RECONCILER="$ROOT/deploy/reconcile.sh"

fail() { printf 'not ok - %s\n' "$1" >&2; exit 1; }

[[ -x "$RECONCILER" ]] || fail 'deploy/reconcile.sh is not executable'

for phase in prepare activate; do
  grep -Fq "static $phase \"\$sha\"" "$RELEASE" \
    || fail "release.sh no longer drives static $phase"
done

grep -Fq 'prepare|activate) coordinated_release "$@" ;;' "$RECONCILER" \
  || fail 'reconcile.sh does not dispatch prepare/activate'
grep -Fq 'usage: reconcile.sh {prepare|activate|status|hold|resume|cleanup}' "$RECONCILER" \
  || fail 'reconcile.sh usage drifted from the joint-release contract'

if grep -Eq '^[[:space:]]*(reconcile|rollback)\)' "$RECONCILER"; then
  fail 'retired standalone reconcile/rollback commands are back'
fi

if [[ -e "$ROOT/deploy/systemd/computing-lab-reconcile.service" || -e "$ROOT/deploy/systemd/computing-lab-reconcile.timer" ]]; then
  fail 'retired reconcile systemd units are back'
fi

if grep -Eq '"(deploy|deploy:rollback)": "bash deploy/reconcile.sh (reconcile|rollback)"' "$ROOT/package.json"; then
  fail 'package.json exposes retired reconcile/rollback commands'
fi
grep -Fq '"deploy:status": "bash deploy/reconcile.sh status"' "$ROOT/package.json" \
  || fail 'package.json no longer exposes deploy:status'

printf 'ok - release.sh and reconcile.sh share the joint-release contract\n'
