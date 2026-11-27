#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/deploy/reconcile.sh"
FLOCK_HELPER="$ROOT/deploy/tests/flock-helper.py"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin" "$TMP/host" "$TMP/archive/computing-lab-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/deploy" "$TMP/api"
chmod +x "$FLOCK_HELPER"

pass() { printf 'ok - %s\n' "$1"; }
fail() { printf 'not ok - %s\n' "$1" >&2; exit 1; }
expect_fail() { if "$@" >/dev/null 2>&1; then return 1; fi; }

cat >"$TMP/bin/bun" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == --version ]]; then echo 1.2.17; exit; fi
if [[ "${1:-}" == install ]]; then mkdir -p node_modules; exit; fi
if [[ "${1:-}" == run && "${2:-}" == build:classroom && "${3:-}" == --outDir && "${4:-}" == dist ]]; then
  mkdir -p dist/assets
  echo '<main>fixture</main>' >dist/index.html
  echo fixture >dist/assets/app.js
  exit
fi
if [[ "${1:-}" == *.mjs ]]; then exit 0; fi
exit 1
EOF
cat >"$TMP/bin/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
out=''
url="${@: -1}"
while (($#)); do [[ "$1" == -o ]] && { out="$2"; shift 2; continue; }; shift; done
if [[ "$url" == */commits/main ]]; then
  [[ "${API_FAIL:-0}" == 1 ]] && exit 22
  printf '{"sha":"%s"}\n' "${API_SHA:-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa}" >"$out"
  echo 200
else
  cp "$ARCHIVE_FIXTURE" "$out"
fi
EOF
chmod +x "$TMP/bin/bun" "$TMP/bin/curl"
printf '{"name":"fixture"}\n' >"$TMP/archive/computing-lab-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/package.json"
printf 'fixture lock\n' >"$TMP/archive/computing-lab-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/bun.lock"
printf 'marker\n' >"$TMP/archive/computing-lab-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/release-marker"
cp "$ROOT/deploy/smoke.mjs" "$TMP/archive/computing-lab-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/deploy/smoke.mjs"
tar -czf "$TMP/good.tar.gz" -C "$TMP/archive" computing-lab-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
mkdir -p "$TMP/wrong/computing-lab-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
tar -czf "$TMP/wrong.tar.gz" -C "$TMP/wrong" computing-lab-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
mkdir -p "$TMP/traversal/computing-lab-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
echo evil >"$TMP/traversal/evil"
tar -czf "$TMP/traversal.tar.gz" -C "$TMP/traversal" computing-lab-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
python3 - "$TMP/traversal.tar.gz" <<'PY'
import sys, tarfile
with tarfile.open(sys.argv[1], "w:gz") as archive:
    info = tarfile.TarInfo("../evil")
    info.size = 4
    archive.addfile(info, __import__("io").BytesIO(b"evil"))
PY

cat >"$TMP/config.env" <<EOF
DEPLOY_TEST_MODE=1
DEPLOY_ROOT=$TMP/host
SOURCE_KIND=codeload
SOURCE_REPO=tviber/computing-lab
SOURCE_REF=main
ARCHIVE_BASE_URLS=https://codeload.github.com
GITHUB_API_BASE=https://api.github.com
GITHUB_TOKEN_FILE=$TMP/no-token
BUN_BIN=$TMP/bin/bun
PYTHON_BIN=$(python3 -c 'import os,sys; print(os.path.realpath(sys.executable))')
FLOCK_BIN=$FLOCK_HELPER
CURL_BIN=$TMP/bin/curl
KEEP_RELEASES=3
VITE_BASE_PATH=/
EOF
export PATH="$TMP/bin:$PATH" ARCHIVE_FIXTURE="$TMP/good.tar.gz"
run() { DEPLOY_TEST_MODE=1 DEPLOY_CONFIG="$TMP/config.env" "$SCRIPT" "$@"; }

API_FAIL=1 run reconcile
[[ ! -e "$TMP/host/current" ]] || fail 'invalid target created a release'
pass 'unavailable anonymous API is a successful no-op'

printf '%s\n' invalid >"$TMP/host/state/target.sha"
expect_fail run reconcile || fail 'invalid webhook SHA accepted'
printf '%s\n' aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa >"$TMP/host/state/target.sha"
API_SHA=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb run reconcile
[[ "$(readlink "$TMP/host/current")" == "$TMP/host/releases/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" ]] || fail 'webhook target was not deployed'
[[ ! -e "$TMP/host/state/target.sha" ]] || fail 'successful publish retained target SHA'
pass 'webhook target takes precedence and successful publish clears it'

printf '%s\n' aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa >"$TMP/host/state/target.sha"
before="$(find "$TMP/host/releases" -mindepth 1 -maxdepth 1 -type d | wc -l)"
run reconcile
after="$(find "$TMP/host/releases" -mindepth 1 -maxdepth 1 -type d | wc -l)"
[[ "$before" == "$after" ]] || fail 'current-equals-target did work'
pass 'current target is a strict no-op'

wrong_sha=cccccccccccccccccccccccccccccccccccccccc
printf '%s\n' "$wrong_sha" >"$TMP/host/state/target.sha"
ARCHIVE_FIXTURE="$TMP/wrong.tar.gz" expect_fail run reconcile || fail 'mismatched archive root accepted'
pass 'archive top-level SHA mismatch rejected'

printf '%s\n' "$wrong_sha" >"$TMP/host/state/target.sha"
ARCHIVE_FIXTURE="$TMP/traversal.tar.gz" expect_fail run reconcile || fail 'traversal archive accepted'
pass 'archive traversal rejected'

legacy_sha=dddddddddddddddddddddddddddddddddddddddd
mkdir -p "$TMP/host/releases/$legacy_sha/dist/assets"
printf '<main>legacy</main>\n' >"$TMP/host/releases/$legacy_sha/dist/index.html"
printf 'legacy\n' >"$TMP/host/releases/$legacy_sha/dist/assets/app.js"
manifest="$(while IFS= read -r -d '' file; do rel="${file#"$TMP/host/releases/$legacy_sha/dist"/}"; printf '%s  %s\n' "$(sha256sum "$file" | cut -d' ' -f1)" "$rel"; done < <(find "$TMP/host/releases/$legacy_sha/dist" -type f -print0 | LC_ALL=C sort -z) | sha256sum | cut -d' ' -f1)"
cat >"$TMP/host/releases/$legacy_sha/release.env" <<EOF
SOURCE_SHA=$legacy_sha
GITEE_REF=main
VITE_BASE_PATH=/
BUN_VERSION=1.2.17
LOCKFILE_SHA256=$(printf legacy | sha256sum | cut -d' ' -f1)
DIST_MANIFEST_SHA256=$manifest
SMOKE=pass
EOF
ln -s "$TMP/host/releases/$legacy_sha" "$TMP/host/previous"
printf '%s\n' "$legacy_sha" >"$TMP/host/state/previous.sha"
run status >/dev/null || fail 'legacy release metadata was rejected'
pass 'legacy GITEE_REF release remains valid for rollback'
