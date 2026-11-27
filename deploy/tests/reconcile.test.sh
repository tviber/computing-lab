#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/deploy/reconcile.sh"
FLOCK_HELPER="$ROOT/deploy/tests/flock-helper.py"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin" "$TMP/host"
chmod 750 "$TMP/host"
chmod +x "$FLOCK_HELPER"

SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
SHA2=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
SHA3=cccccccccccccccccccccccccccccccccccccccc
SHA4=dddddddddddddddddddddddddddddddddddddddd
LEGACY=1111111111111111111111111111111111111111
CODELOAD=2222222222222222222222222222222222222222
BAD=eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee

pass() { printf 'ok - %s\n' "$1"; }
fail() { printf 'not ok - %s\n' "$1" >&2; exit 1; }
expect_fail() { if "$@" >/dev/null 2>&1; then return 1; fi; }

sha_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}
sha_stdin() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum | cut -d' ' -f1
  else
    shasum -a 256 | cut -d' ' -f1
  fi
}

cat >"$TMP/bin/bun" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == --version ]]; then echo 1.2.17; exit; fi
if [[ "${1:-}" == install ]]; then mkdir -p node_modules; exit; fi
if [[ "${1:-}" == run && "${2:-}" == build:classroom && "${3:-}" == --outDir && "${4:-}" == dist ]]; then
  mkdir -p dist/assets
  printf '<main>fixture</main>\n' >dist/index.html
  printf 'fixture\n' >dist/assets/app.js
  exit
fi
if [[ "${1:-}" == *.mjs ]]; then exit 0; fi
exit 1
EOF
chmod +x "$TMP/bin/bun"

make_archive() {
  local sha="$1" output="$2" marker="${3:-fixture}"
  local archive="$TMP/archive-$sha"
  rm -rf "$archive"
  mkdir -p "$archive/computing-lab-$sha/deploy"
  printf '{"name":"fixture"}\n' >"$archive/computing-lab-$sha/package.json"
  printf 'fixture lock %s\n' "$marker" >"$archive/computing-lab-$sha/bun.lock"
  cp "$ROOT/deploy/smoke.mjs" "$archive/computing-lab-$sha/deploy/smoke.mjs"
  tar -czf "$output" -C "$archive" "computing-lab-$sha"
}

make_archive "$SHA" "$TMP/sha.tar.gz" one
make_archive "$SHA2" "$TMP/sha2.tar.gz" two
make_archive "$SHA3" "$TMP/sha3.tar.gz" three
make_archive "$SHA4" "$TMP/sha4.tar.gz" four
make_archive "$SHA2" "$TMP/wrong-root.tar.gz" wrong-root

python3 - "$TMP/traversal.tar.gz" <<'PY'
import io
import sys
import tarfile

with tarfile.open(sys.argv[1], "w:gz") as archive:
    info = tarfile.TarInfo("../evil")
    info.size = 4
    archive.addfile(info, io.BytesIO(b"evil"))
PY

python3 - "$TMP/symlink.tar.gz" "$SHA" <<'PY'
import sys
import tarfile

path, sha = sys.argv[1:]
with tarfile.open(path, "w:gz") as archive:
    info = tarfile.TarInfo(f"computing-lab-{sha}/link")
    info.type = tarfile.SYMTYPE
    info.linkname = "/etc/passwd"
    archive.addfile(info)
PY

PYTHON_BIN="$(python3 -c 'import os, sys; print(os.path.realpath(sys.executable))')"
cat >"$TMP/config.env" <<EOF
DEPLOY_TEST_MODE=1
DEPLOY_ROOT=$TMP/host
BUN_BIN=$TMP/bin/bun
PYTHON_BIN=$PYTHON_BIN
FLOCK_BIN=$FLOCK_HELPER
KEEP_RELEASES=3
VITE_BASE_PATH=/
EOF
chmod 600 "$TMP/config.env"

run() { DEPLOY_TEST_MODE=1 DEPLOY_CONFIG="$TMP/config.env" "$SCRIPT" "$@"; }

run status >"$TMP/status"
grep -qx 'current=none' "$TMP/status" || fail 'empty root must report no current release'
grep -qx 'previous=none' "$TMP/status" || fail 'empty root must report no previous release'
grep -qx 'hold=no' "$TMP/status" || fail 'empty root must not be held'
grep -qx 'lock=free' "$TMP/status" || fail 'empty root must report a free lock'
pass 'empty deployment reports status'

GOOD_DIGEST="$(sha_file "$TMP/sha.tar.gz")"
expect_fail run prepare "$SHA" "$TMP/sha.tar.gz" "$(printf bad | sha_stdin)" \
  || fail 'prepare accepted a mismatched digest'
[[ ! -e "$TMP/host/releases/$SHA" ]] || fail 'mismatched digest created a release'
pass 'prepare rejects a mismatched digest'

expect_fail run prepare "$SHA" "$TMP/wrong-root.tar.gz" "$(sha_file "$TMP/wrong-root.tar.gz")" \
  || fail 'prepare accepted an archive for another SHA'
pass 'prepare rejects an archive top-level SHA mismatch'

expect_fail run prepare "$SHA" "$TMP/traversal.tar.gz" "$(sha_file "$TMP/traversal.tar.gz")" \
  || fail 'prepare accepted an archive traversal entry'
pass 'prepare rejects archive traversal'

expect_fail run prepare "$SHA" "$TMP/symlink.tar.gz" "$(sha_file "$TMP/symlink.tar.gz")" \
  || fail 'prepare accepted a symlink in the archive'
pass 'prepare rejects symlinks in the archive'

run prepare "$SHA" "$TMP/sha.tar.gz" "$GOOD_DIGEST"
RELEASE="$TMP/host/releases/$SHA"
[[ -f "$RELEASE/release.env" && -d "$RELEASE/dist" ]] || fail 'prepare did not register a release'
grep -qx "SOURCE_SHA=$SHA" "$RELEASE/release.env" || fail 'release SOURCE_SHA is wrong'
grep -qx 'SOURCE_KIND=ssh' "$RELEASE/release.env" || fail 'release SOURCE_KIND is wrong'
grep -qx 'SOURCE_REF=main' "$RELEASE/release.env" || fail 'release SOURCE_REF is wrong'
grep -qx 'SOURCE_REPO=tviber/computing-lab' "$RELEASE/release.env" || fail 'release SOURCE_REPO is wrong'
grep -qx "ARCHIVE_SHA256=$GOOD_DIGEST" "$RELEASE/release.env" || fail 'release archive digest is wrong'
grep -qx 'BUN_VERSION=1.2.17' "$RELEASE/release.env" || fail 'release Bun version is wrong'
[[ ! -e "$TMP/host/current" ]] || fail 'prepare must not activate the release'
pass 'prepare builds and validates a staged release without activating it'

output="$(run prepare "$SHA" "$TMP/sha.tar.gz" "$GOOD_DIGEST" 2>&1)"
grep -Fq 'already prepared' <<<"$output" || fail 'repeated prepare was not a no-op'
expect_fail run prepare "$SHA" "$TMP/sha.tar.gz" "$(sha_file "$TMP/sha2.tar.gz")" \
  || fail 'prepare replaced an existing release with a different digest'
pass 'prepare is idempotent per SHA and archive digest'

run activate "$SHA"
[[ "$(readlink "$TMP/host/current")" == "$TMP/host/releases/$SHA" ]] || fail 'activate did not switch current'
[[ "$(cat "$TMP/host/state/current.sha")" == "$SHA" ]] || fail 'activate did not write the current marker'
[[ ! -e "$TMP/host/previous" && ! -e "$TMP/host/state/previous.sha" ]] || fail 'first activation created a previous release'
pass 'activate switches current and writes the marker'

run prepare "$SHA2" "$TMP/sha2.tar.gz" "$(sha_file "$TMP/sha2.tar.gz")"
run activate "$SHA2"
[[ "$(readlink "$TMP/host/current")" == "$TMP/host/releases/$SHA2" ]] || fail 'second activation did not switch current'
[[ "$(readlink "$TMP/host/previous")" == "$TMP/host/releases/$SHA" ]] || fail 'second activation did not rotate previous'
[[ "$(cat "$TMP/host/state/current.sha")" == "$SHA2" ]] || fail 'second activation wrote the wrong current marker'
[[ "$(cat "$TMP/host/state/previous.sha")" == "$SHA" ]] || fail 'second activation wrote the wrong previous marker'
pass 'activation rotates the previous release'

run hold
expect_fail run prepare "$SHA3" "$TMP/sha3.tar.gz" "$(sha_file "$TMP/sha3.tar.gz")" \
  || fail 'hold did not block prepare'
expect_fail run activate "$SHA2" || fail 'hold did not block activate'
pass 'hold blocks prepare and activate'

run resume
run prepare "$SHA3" "$TMP/sha3.tar.gz" "$(sha_file "$TMP/sha3.tar.gz")"
run activate "$SHA3"
[[ "$(readlink "$TMP/host/current")" == "$TMP/host/releases/$SHA3" ]] || fail 'resume did not allow the next release'
pass 'resume allows the next joint release'

run prepare "$SHA4" "$TMP/sha4.tar.gz" "$(sha_file "$TMP/sha4.tar.gz")"
set +e
(
  export DEPLOY_TEST_FAIL_PHASE=after-current
  run activate "$SHA4"
) >/dev/null 2>&1
killed=$?
set -e
[[ "$killed" != 0 ]] || fail 'failure injection did not interrupt activation'
[[ -e "$TMP/host/state/transaction" ]] || fail 'interrupted activation left no transaction'
[[ "$(readlink "$TMP/host/current")" == "$TMP/host/releases/$SHA4" ]] || fail 'interrupted activation did not switch current'
run hold >/dev/null
[[ "$(readlink "$TMP/host/previous")" == "$TMP/host/releases/$SHA3" ]] || fail 'recovery did not restore previous'
[[ "$(cat "$TMP/host/state/current.sha")" == "$SHA4" ]] || fail 'recovery wrote the wrong current marker'
[[ "$(cat "$TMP/host/state/previous.sha")" == "$SHA3" ]] || fail 'recovery wrote the wrong previous marker'
[[ ! -e "$TMP/host/state/transaction" ]] || fail 'recovery retained the transaction'
run resume
pass 'interrupted activation is recovered by the next operation'

mkdir -p "$TMP/host/releases/$BAD/dist"
printf 'bad\n' >"$TMP/host/releases/$BAD/dist/index.html"
printf 'SOURCE_SHA=%s\n' "$BAD" >"$TMP/host/releases/$BAD/release.env"
run cleanup
[[ ! -e "$TMP/host/releases/$BAD" ]] || fail 'cleanup retained an invalid release'
find "$TMP/host/quarantine" -mindepth 1 -maxdepth 1 -name "$BAD.*" -print -quit | grep -q . \
  || fail 'cleanup did not quarantine the invalid release'
pass 'cleanup quarantines invalid releases'

cp -a "$TMP/host/releases/$SHA2" "$TMP/host/releases/$LEGACY"
python3 - "$TMP/host/releases/$LEGACY/release.env" "$LEGACY" <<'PY'
import sys

path, sha = sys.argv[1:]
dropped = {"SOURCE_KIND", "SOURCE_REF", "ARCHIVE_SHA256", "SOURCE_REPO"}
lines = []
for line in open(path, encoding="utf-8"):
    key = line.split("=", 1)[0]
    if key in dropped:
        continue
    lines.append(f"SOURCE_SHA={sha}\n" if key == "SOURCE_SHA" else line)
lines.append("GITEE_REF=main\n")
open(path, "w", encoding="utf-8").writelines(lines)
PY
ln -sfn "$TMP/host/releases/$LEGACY" "$TMP/host/previous"
printf '%s\n' "$LEGACY" >"$TMP/host/state/previous.sha"
run hold
run resume
pass 'legacy GITEE_REF release metadata remains valid'

cp -a "$TMP/host/releases/$SHA2" "$TMP/host/releases/$CODELOAD"
python3 - "$TMP/host/releases/$CODELOAD/release.env" "$CODELOAD" <<'PY'
import sys

path, sha = sys.argv[1:]
lines = []
for line in open(path, encoding="utf-8"):
    if line.startswith("SOURCE_SHA="):
        line = f"SOURCE_SHA={sha}\n"
    elif line.startswith("SOURCE_KIND="):
        line = "SOURCE_KIND=codeload\n"
    lines.append(line)
open(path, "w", encoding="utf-8").writelines(lines)
PY
ln -sfn "$TMP/host/releases/$CODELOAD" "$TMP/host/previous"
printf '%s\n' "$CODELOAD" >"$TMP/host/state/previous.sha"
run hold
run resume
pass 'codeload release metadata remains valid'

expect_fail run reconcile || fail 'retired reconcile command is still accepted'
expect_fail run rollback || fail 'retired rollback command is still accepted'
pass 'standalone reconcile and rollback entrypoints stay retired'

run status >"$TMP/status-final"
grep -qx "current=$SHA4" "$TMP/status-final" || fail 'final current marker is wrong'
grep -qx "previous=$CODELOAD" "$TMP/status-final" || fail 'final previous marker is wrong'
grep -qx 'hold=no' "$TMP/status-final" || fail 'final hold state is wrong'
grep -qx 'lock=free' "$TMP/status-final" || fail 'final lock state is wrong'
pass 'status reports the final joint-release state'
