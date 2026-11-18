#!/usr/bin/env bash
set -Eeuo pipefail

# Computing Lab host-side static reconciler.
# This script is intentionally Bash-only and has no application runtime.
umask 027

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_CONFIG="${DEPLOY_CONFIG:-/etc/computing-lab/deploy.env}"
REQUESTED_TEST_MODE="${DEPLOY_TEST_MODE:-0}"
if [[ -f "$DEPLOY_CONFIG" ]]; then
  /usr/bin/python3 - "$DEPLOY_CONFIG" "$REQUESTED_TEST_MODE" <<'PY'
import os
import stat
import sys

path, test_mode = sys.argv[1:]
try:
    info = os.lstat(path)
    parent = os.lstat(os.path.dirname(os.path.abspath(path)))
except OSError as error:
    raise SystemExit(f"DEPLOY_CONFIG cannot be inspected: {error}")
if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
    raise SystemExit("DEPLOY_CONFIG must be a regular non-symlink file")
if test_mode != "1" and info.st_uid != 0:
    raise SystemExit("DEPLOY_CONFIG must be root-owned")
if stat.S_IMODE(info.st_mode) & 0o022:
    raise SystemExit("DEPLOY_CONFIG has unsafe permissions")
if stat.S_ISLNK(parent.st_mode) or not stat.S_ISDIR(parent.st_mode):
    raise SystemExit("DEPLOY_CONFIG parent must be a real directory")
if test_mode != "1" and parent.st_uid != 0:
    raise SystemExit("DEPLOY_CONFIG parent must be root-owned")
if stat.S_IMODE(parent.st_mode) & 0o022:
    raise SystemExit("DEPLOY_CONFIG parent is unsafe")
PY
  # shellcheck disable=SC1090
  source "$DEPLOY_CONFIG"
fi
DEPLOY_TEST_MODE="$REQUESTED_TEST_MODE"

DEPLOY_ROOT="${DEPLOY_ROOT:-/srv/computing-lab}"
SOURCE_KIND="${SOURCE_KIND:-codeload}"
SOURCE_REPO="${SOURCE_REPO:-tviber/computing-lab}"
SOURCE_REF="${SOURCE_REF:-main}"
ARCHIVE_BASE_URLS="${ARCHIVE_BASE_URLS:-https://codeload.github.com}"
GITHUB_API_BASE="${GITHUB_API_BASE:-https://api.github.com}"
GITHUB_TOKEN_FILE="${GITHUB_TOKEN_FILE:-/etc/computing-lab/github.token}"
CURL_BIN="${CURL_BIN:-/usr/bin/curl}"
BUN_BIN="${BUN_BIN:-}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
FLOCK_BIN="${FLOCK_BIN:-flock}"
KEEP_RELEASES="${KEEP_RELEASES:-3}"
VITE_BASE_PATH="${VITE_BASE_PATH:-/}"
BUILD_PATH='/usr/bin:/bin'
RELEASES_DIR="$DEPLOY_ROOT/releases"
STATE_DIR="$DEPLOY_ROOT/state"
WORK_DIR="$DEPLOY_ROOT/work"
QUARANTINE_DIR="$DEPLOY_ROOT/quarantine"
CURRENT_LINK="$DEPLOY_ROOT/current"
PREVIOUS_LINK="$DEPLOY_ROOT/previous"
LOCK_FILE="$STATE_DIR/deploy.lock"
TX_FILE="$STATE_DIR/transaction"
HOLD_FILE="$STATE_DIR/hold"
CURRENT_MARKER="$STATE_DIR/current.sha"
PREVIOUS_MARKER="$STATE_DIR/previous.sha"
TARGET_FILE="$STATE_DIR/target.sha"
TARGET_FAILED_FILE="$STATE_DIR/target.failed"
API_ETAG_FILE="$STATE_DIR/github-main.etag"
API_SHA_FILE="$STATE_DIR/github-main.sha"
ARCHIVE_SHA256=''
TARGET_FROM_WEBHOOK=0
ARCHIVE_FILE=''
UNPACK_DIR=''

LOCK_FD=''
LOCK_HELD=0
STAGING_DIR=''
RELEASE_CREATED=''
TARGET_SHA=''

log() { printf 'computing-lab-deploy: %s\n' "$*"; }
die() { printf 'computing-lab-deploy: %s\n' "$*" >&2; exit 1; }

is_sha() { [[ "$1" =~ ^[0-9a-f]{40}$ ]]; }

validate_trusted_file() {
  local path="$1" label="$2" kind="$3" owner_policy="$4"
  /usr/bin/python3 - "$path" "$label" "$kind" "$owner_policy" "$DEPLOY_TEST_MODE" <<'PY'
import os
import stat
import sys

path, label, kind, owner_policy, test_mode = sys.argv[1:]
try:
    info = os.lstat(path)
    parent_info = os.lstat(os.path.dirname(os.path.abspath(path)))
except OSError as error:
    raise SystemExit(f"{label} cannot be inspected: {error}")

if not os.path.isabs(path) or stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
    raise SystemExit(f"{label} must be a regular non-symlink file")
if owner_policy == "root" and info.st_uid != 0 and test_mode != "1":
    raise SystemExit(f"{label} must be root-owned")
if owner_policy == "self" and info.st_uid not in (0, os.geteuid()):
    raise SystemExit(f"{label} has an unexpected owner")
if stat.S_IMODE(info.st_mode) & 0o022:
    raise SystemExit(f"{label} has unsafe permissions")
if kind == "binary" and not (stat.S_IMODE(info.st_mode) & 0o100):
    raise SystemExit(f"{label} is not owner-executable")
if kind == "key" and stat.S_IMODE(info.st_mode) != 0o600:
    raise SystemExit(f"{label} private key must be mode 0600")
if stat.S_ISLNK(parent_info.st_mode) or not stat.S_ISDIR(parent_info.st_mode):
    raise SystemExit(f"{label} parent must be a real directory")
if test_mode != "1" and parent_info.st_uid != 0:
    raise SystemExit(f"{label} parent directory must be root-owned")
if stat.S_IMODE(parent_info.st_mode) & 0o022:
    raise SystemExit(f"{label} parent directory is unsafe")
PY
}

validate_tooling_dir() {
  /usr/bin/python3 - "$SCRIPT_DIR" "$DEPLOY_TEST_MODE" <<'PY'
import os
import stat
import sys

path, test_mode = sys.argv[1:]
info = os.lstat(path)
parent = os.lstat(os.path.dirname(os.path.abspath(path)))
if not os.path.isabs(path) or stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
    raise SystemExit("deployment tooling directory must be a real absolute directory")
if test_mode != "1" and info.st_uid != 0:
    raise SystemExit("deployment tooling directory must be root-owned")
if stat.S_IMODE(info.st_mode) & 0o022:
    raise SystemExit("deployment tooling directory is writable by group/other")
if stat.S_ISLNK(parent.st_mode) or not stat.S_ISDIR(parent.st_mode):
    raise SystemExit("deployment tooling parent must be a real directory")
if test_mode != "1" and parent.st_uid != 0:
    raise SystemExit("deployment tooling parent must be root-owned")
if stat.S_IMODE(parent.st_mode) & 0o022:
    raise SystemExit("deployment tooling parent is writable by group/other")
PY
}

validate_deploy_root() {
  /usr/bin/python3 - "$DEPLOY_ROOT" "$DEPLOY_TEST_MODE" <<'PY'
import os
import stat
import sys

path, test_mode = sys.argv[1:]
info = os.lstat(path)
parent = os.lstat(os.path.dirname(os.path.abspath(path)))
if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
    raise SystemExit("DEPLOY_ROOT must be a real non-symlink directory")
if info.st_uid != os.geteuid():
    raise SystemExit("DEPLOY_ROOT must be owned by deployment identity")
mode = stat.S_IMODE(info.st_mode)
if not (mode & 0o200) or mode & 0o022:
    raise SystemExit("DEPLOY_ROOT must be owner-writable and not group/world-writable")
if stat.S_ISLNK(parent.st_mode) or not stat.S_ISDIR(parent.st_mode):
    raise SystemExit("DEPLOY_ROOT parent must be a real directory")
if test_mode != "1" and parent.st_uid != 0:
    raise SystemExit("DEPLOY_ROOT parent must be root-owned")
if stat.S_IMODE(parent.st_mode) & 0o022:
    raise SystemExit("DEPLOY_ROOT parent is writable by group/other")
PY
}

validate_base() {
  local value="$1"
  [[ "$value" == "/" || "$value" =~ ^/[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*/?$ ]] \
    || die "VITE_BASE_PATH is unsafe: $value"
}

validate_config() {
  [[ "$DEPLOY_ROOT" == /* && "$DEPLOY_ROOT" != "/" && "$DEPLOY_ROOT" != */..* ]] \
    || die 'DEPLOY_ROOT must be an absolute non-root path'
  [[ "$SOURCE_KIND" == codeload && "$SOURCE_REPO" == tviber/computing-lab && "$SOURCE_REF" == main ]] || die 'source must be tviber/computing-lab main via codeload'
  [[ "$VITE_BASE_PATH" == "/" ]] || die 'production reconciler requires VITE_BASE_PATH=/'
  [[ "$DEPLOY_TEST_MODE" == 0 || "$DEPLOY_TEST_MODE" == 1 ]] || die 'DEPLOY_TEST_MODE must be 0 or 1'
  [[ "$DEPLOY_CONFIG" == /* && -f "$DEPLOY_CONFIG" && ! -L "$DEPLOY_CONFIG" ]] \
    || die 'DEPLOY_CONFIG must be an existing regular non-symlink file'
  [[ "$PYTHON_BIN" == /* && -x "$PYTHON_BIN" && ! -L "$PYTHON_BIN" ]] \
    || die 'PYTHON_BIN must be an absolute executable non-symlink path'
  [[ "$FLOCK_BIN" == /* && -x "$FLOCK_BIN" && ! -L "$FLOCK_BIN" ]] \
    || die 'FLOCK_BIN must be an absolute executable non-symlink path'
  [[ "$GITHUB_API_BASE" == https://* ]] || die 'GITHUB_API_BASE must use HTTPS'
  [[ "$CURL_BIN" == /* && -x "$CURL_BIN" && ! -L "$CURL_BIN" ]] || die 'CURL_BIN must be an absolute executable'
  [[ -n "$BUN_BIN" && "$BUN_BIN" == /* && -x "$BUN_BIN" && ! -L "$BUN_BIN" ]] \
    || die 'BUN_BIN must be an absolute, executable, non-symlink path'
  [[ "$KEEP_RELEASES" =~ ^[1-9][0-9]*$ ]] || die 'KEEP_RELEASES must be positive'
  validate_base "$VITE_BASE_PATH"
  validate_tooling_dir
  validate_trusted_file "$SCRIPT_DIR/reconcile.sh" RECONCILE_SCRIPT script root
  validate_trusted_file "$SCRIPT_DIR/fsync.py" FSYNC_TOOL script root
  validate_trusted_file "$DEPLOY_CONFIG" DEPLOY_CONFIG config root
  validate_trusted_file "$PYTHON_BIN" PYTHON_BIN binary root
  validate_trusted_file "$FLOCK_BIN" FLOCK_BIN binary root
  validate_trusted_file "$CURL_BIN" CURL_BIN binary root
}

ensure_root_safety() {
  [[ -e "$DEPLOY_ROOT" && ! -L "$DEPLOY_ROOT" && -d "$DEPLOY_ROOT" ]] \
    || die 'DEPLOY_ROOT must already exist as a non-symlink directory; bootstrap it first'
  validate_deploy_root
  [[ -w "$DEPLOY_ROOT" ]] || die 'DEPLOY_ROOT is not writable by deployment identity'
}

sha256_stdin() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print $1}'
  else
    shasum -a 256 | awk '{print $1}'
  fi
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

fsync_path() {
  "$PYTHON_BIN" "$SCRIPT_DIR/fsync.py" "$@"
}

atomic_write() {
  local path="$1" value="$2" dir tmp
  dir="$(dirname "$path")"
  tmp="$dir/.$(basename "$path").tmp.$$"
  printf '%s\n' "$value" >"$tmp"
  fsync_path "$tmp"
  mv -f "$tmp" "$path"
  fsync_path "$dir"
}

atomic_link() {
  "$PYTHON_BIN" "$SCRIPT_DIR/fsync.py" --replace-symlink "$1" "$2"
}

remove_link() {
  local link="$1" dir
  dir="$(dirname "$link")"
  rm -f "$link"
  fsync_path "$dir"
}

remove_file() {
  local path="$1" dir
  dir="$(dirname "$path")"
  rm -f "$path"
  fsync_path "$dir"
}

init_layout() {
  ensure_root_safety
  local directory
  for directory in "$RELEASES_DIR" "$STATE_DIR" "$WORK_DIR" "$QUARANTINE_DIR"; do
    if [[ -L "$directory" || ( -e "$directory" && ! -d "$directory" ) ]]; then
      die "deployment child is unsafe: $directory"
    fi
    [[ -e "$directory" ]] || mkdir "$directory"
    chmod 0750 "$directory"
  done
  fsync_path "$DEPLOY_ROOT"
}

release_lock() {
  if [[ "$LOCK_HELD" == 1 ]]; then
    "$FLOCK_BIN" -u "$LOCK_FD" >/dev/null 2>&1 || true
    eval "exec ${LOCK_FD}>&-" || true
    LOCK_HELD=0
  fi
}

validate_lock_path() {
  [[ ! -L "$LOCK_FILE" && ( ! -e "$LOCK_FILE" || -f "$LOCK_FILE" ) ]] \
    || die 'deployment lock path is unsafe'
}

on_exit() {
  local status=$?
  if [[ "$status" != 0 && -n "$TARGET_SHA" && -f "$TARGET_FILE" && "$(<"$TARGET_FILE")" == "$TARGET_SHA" ]]; then
    local attempts=0
    [[ -f "$TARGET_FAILED_FILE" ]] && attempts="$(awk -F= -v sha="$TARGET_SHA" '$1==sha {print $2}' "$TARGET_FAILED_FILE")"
    [[ "$attempts" =~ ^[0-9]+$ ]] || attempts=0
    attempts=$((attempts + 1))
    if (( attempts >= 2 )); then
      atomic_write "$TARGET_FAILED_FILE" "$TARGET_SHA"
      log "target $TARGET_SHA failed twice; automatic retries stopped"
    else
      atomic_write "$TARGET_FAILED_FILE" "$TARGET_SHA=$attempts"
    fi
  fi
  if [[ -n "$STAGING_DIR" && -d "$STAGING_DIR" ]]; then
    rm -rf "$STAGING_DIR"
  fi
  [[ -z "$ARCHIVE_FILE" ]] || rm -f "$ARCHIVE_FILE"
  [[ -z "$UNPACK_DIR" ]] || rm -rf "$UNPACK_DIR"
  release_lock
  exit "$status"
}

acquire_lock() {
  validate_lock_path
  eval "exec {LOCK_FD}>>\"$LOCK_FILE\""
  chmod 0640 "$LOCK_FILE"
  if ! "$FLOCK_BIN" -n "$LOCK_FD"; then
    eval "exec ${LOCK_FD}>&-"
    die 'another deployment operation is running'
  fi
  LOCK_HELD=1
  trap on_exit EXIT
}

read_link_sha() {
  local link="$1" target sha
  [[ ! -e "$link" && ! -L "$link" ]] && return 0
  [[ -L "$link" ]] || die "$link exists but is not a symlink"
  target="$(readlink "$link")"
  [[ "$target" == "$RELEASES_DIR/"* ]] || die "$link points outside releases"
  sha="${target##*/}"
  is_sha "$sha" || die "$link points to invalid release"
  [[ "$target" == "$RELEASES_DIR/$sha" ]] || die "$link target is not canonical"
  printf '%s' "$sha"
}

read_marker() {
  local path="$1" value=''
  [[ -f "$path" && ! -L "$path" ]] || return 0
  value="$(<"$path")"
  is_sha "$value" && printf '%s' "$value"
}

validate_markers() {
  local current previous current_marker previous_marker
  current="$(read_link_sha "$CURRENT_LINK")"
  previous="$(read_link_sha "$PREVIOUS_LINK")"
  current_marker="$(read_marker "$CURRENT_MARKER")"
  previous_marker="$(read_marker "$PREVIOUS_MARKER")"
  if [[ -n "$current" ]]; then
    [[ "$current_marker" == "$current" ]] || die 'current marker disagrees with current symlink'
  else
    [[ ! -e "$CURRENT_MARKER" && ! -L "$CURRENT_MARKER" ]] || die 'orphan current marker'
  fi
  if [[ -n "$previous" ]]; then
    [[ "$previous_marker" == "$previous" ]] || die 'previous marker disagrees with previous symlink'
  else
    [[ ! -e "$PREVIOUS_MARKER" && ! -L "$PREVIOUS_MARKER" ]] || die 'orphan previous marker'
  fi
}

validate_active_releases() {
  local current previous
  current="$(read_link_sha "$CURRENT_LINK")"
  previous="$(read_link_sha "$PREVIOUS_LINK")"
  if [[ -n "$current" ]]; then
    validate_release "$current" || die 'current release is invalid'
  fi
  if [[ -n "$previous" ]]; then
    validate_release "$previous" || die 'previous release is invalid'
  fi
}

meta_value() {
  local file="$1" key="$2" value count
  count=0
  while IFS= read -r line; do
    [[ "$line" == "$key="* ]] || continue
    value="${line#*=}"
    count=$((count + 1))
  done <"$file"
  [[ "$count" == 1 ]] || return 1
  printf '%s' "$value"
}

dist_manifest_digest() {
  local dist="$1" file relative
  while IFS= read -r -d '' file; do
    relative="${file#"$dist"/}"
    printf '%s  %s\n' "$(sha256_file "$file")" "$relative"
  done < <(find "$dist" -type f -print0 | LC_ALL=C sort -z) | sha256_stdin
}

validate_static_tree() {
  local dist="$1"
  "$PYTHON_BIN" - "$dist" <<'PY'
import os
import stat
import sys

root = os.path.abspath(sys.argv[1])
if not os.path.isdir(root) or os.path.islink(root):
    raise SystemExit("dist must be a real directory")
for current, dirs, files in os.walk(root, followlinks=False):
    for name in dirs + files:
        path = os.path.join(current, name)
        relative = os.path.relpath(path, root)
        if relative.startswith("..") or os.path.isabs(relative):
            raise SystemExit("dist path escapes root")
        info = os.lstat(path)
        if stat.S_ISLNK(info.st_mode):
            raise SystemExit("dist contains symlink: " + relative)
        if not (stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)):
            raise SystemExit("dist contains special file: " + relative)
        if stat.S_ISREG(info.st_mode) and info.st_nlink > 1:
            raise SystemExit("dist contains hard-linked file: " + relative)
PY
  [[ -f "$dist/index.html" ]] || die 'dist/index.html is missing'
  local asset
  asset="$(find "$dist" -type f ! -name index.html -print -quit)"
  [[ -n "$asset" ]] || die 'dist has no static asset besides index.html'
}

validate_release() {
  local sha="$1" release meta dist expected
  release="$RELEASES_DIR/$sha"
  is_sha "$sha" || return 1
  [[ -d "$release" && ! -L "$release" ]] || return 1
  meta="$release/release.env"
  dist="$release/dist"
  [[ -f "$meta" && ! -L "$meta" && -d "$dist" && ! -L "$dist" ]] || return 1
  "$PYTHON_BIN" - "$meta" "$sha" "$VITE_BASE_PATH" <<'PY' || return 1
import sys

path, expected_sha, expected_base = sys.argv[1:]
expected = {
    "SOURCE_SHA": expected_sha,
    "VITE_BASE_PATH": expected_base,
    "BUN_VERSION": "1.2.17",
    "SMOKE": "pass",
}
values = {}
with open(path, encoding="utf-8") as handle:
    lines = [line.rstrip("\n") for line in handle]
for line in lines:
    key, separator, value = line.partition("=")
    if not separator or key in values:
        raise SystemExit(1)
    values[key] = value
for key, value in expected.items():
    if values.get(key) != value:
        raise SystemExit(1)
if values.get("SOURCE_KIND") is None:
    if values.get("GITEE_REF") != "main":
        raise SystemExit(1)
else:
    if values.get("SOURCE_KIND") != "codeload" or values.get("SOURCE_REF") != "main":
        raise SystemExit(1)
    if values.get("SOURCE_REPO") != "tviber/computing-lab":
        raise SystemExit(1)
    if len(values.get("ARCHIVE_SHA256", "")) != 64 or any(c not in "0123456789abcdef" for c in values["ARCHIVE_SHA256"]):
        raise SystemExit(1)
allowed = set(expected) | {"LOCKFILE_SHA256", "DIST_MANIFEST_SHA256", "GITEE_REF"}
allowed |= {"SOURCE_KIND", "SOURCE_REF", "ARCHIVE_SHA256", "SOURCE_REPO"}
if set(values) - allowed:
    raise SystemExit(1)
PY
  expected="$(meta_value "$meta" LOCKFILE_SHA256)"; [[ "$expected" =~ ^[0-9a-f]{64}$ ]] || return 1
  expected="$(meta_value "$meta" DIST_MANIFEST_SHA256)"; [[ "$expected" =~ ^[0-9a-f]{64}$ ]] || return 1
  validate_static_tree "$dist" >/dev/null 2>&1 || return 1
  [[ "$(dist_manifest_digest "$dist")" == "$(meta_value "$meta" DIST_MANIFEST_SHA256)" ]] || return 1
  if [[ -d "$DEPLOY_ROOT/source.git/objects" ]] && git --git-dir="$DEPLOY_ROOT/source.git" cat-file -e "$sha^{commit}" 2>/dev/null; then
    [[ "$(git --git-dir="$DEPLOY_ROOT/source.git" show "$sha:bun.lock" | sha256_stdin)" == "$(meta_value "$meta" LOCKFILE_SHA256)" ]] || return 1
  else
    log "source object unavailable for $sha; skipped lockfile cross-check"
  fi
}

protected_release() {
  local sha="$1" current previous
  current="$(read_link_sha "$CURRENT_LINK")"
  previous="$(read_link_sha "$PREVIOUS_LINK")"
  [[ "$sha" == "$current" || "$sha" == "$previous" ]]
}

quarantine_release() {
  local sha="$1" release="$RELEASES_DIR/$sha" destination
  [[ -e "$release" ]] || return 0
  protected_release "$sha" && die "protected release $sha is invalid"
  destination="$QUARANTINE_DIR/${sha}.$$.${RANDOM}"
  mv "$release" "$destination"
  fsync_path "$QUARANTINE_DIR" "$RELEASES_DIR"
  log "quarantined invalid release $sha"
}

write_transaction() {
  local op="$1" phase="$2" old_current="$3" old_previous="$4" new_current="$5" new_previous="$6"
  local value
  value=$(printf 'OP=%s\nPHASE=%s\nOLD_CURRENT=%s\nOLD_PREVIOUS=%s\nNEW_CURRENT=%s\nNEW_PREVIOUS=%s' \
    "$op" "$phase" "$old_current" "$old_previous" "$new_current" "$new_previous")
  atomic_write "$TX_FILE" "$value"
}

tx_value() { meta_value "$TX_FILE" "$1"; }

clear_transaction() {
  [[ -e "$TX_FILE" ]] || return 0
  rm -f "$TX_FILE"
  fsync_path "$STATE_DIR"
}

recover_transaction() {
  [[ -e "$TX_FILE" ]] || return 0
  [[ -f "$TX_FILE" ]] || die 'deployment transaction is not a regular file'
  local old_current old_previous new_current new_previous current previous
  old_current="$(tx_value OLD_CURRENT)" || die 'transaction is malformed'
  old_previous="$(tx_value OLD_PREVIOUS)" || die 'transaction is malformed'
  new_current="$(tx_value NEW_CURRENT)" || die 'transaction is malformed'
  new_previous="$(tx_value NEW_PREVIOUS)" || die 'transaction is malformed'
  [[ -z "$old_current" || $(is_sha "$old_current"; echo $?) == 0 ]] || die 'transaction old current invalid'
  [[ -z "$old_previous" || $(is_sha "$old_previous"; echo $?) == 0 ]] || die 'transaction old previous invalid'
  is_sha "$new_current" || die 'transaction new current invalid'
  [[ -z "$new_previous" || $(is_sha "$new_previous"; echo $?) == 0 ]] || die 'transaction new previous invalid'
  if [[ -n "$old_current" ]]; then
    validate_release "$old_current" || die 'transaction old current release invalid'
  fi
  if [[ -n "$old_previous" ]]; then
    validate_release "$old_previous" || die 'transaction old previous release invalid'
  fi
  validate_release "$new_current" || die 'transaction new current release invalid'
  if [[ -n "$new_previous" ]]; then
    validate_release "$new_previous" || die 'transaction new previous release invalid'
  fi
  current="$(read_link_sha "$CURRENT_LINK")"
  previous="$(read_link_sha "$PREVIOUS_LINK")"
  if [[ "$current" == "$new_current" ]]; then
    if [[ -n "$new_previous" ]]; then atomic_link "$RELEASES_DIR/$new_previous" "$PREVIOUS_LINK"; else remove_link "$PREVIOUS_LINK"; fi
    atomic_write "$CURRENT_MARKER" "$new_current"
    if [[ -n "$new_previous" ]]; then atomic_write "$PREVIOUS_MARKER" "$new_previous"; else remove_file "$PREVIOUS_MARKER"; fi
    clear_transaction
    log 'recovered completed current switch'
  elif [[ "$current" == "$old_current" ]]; then
    if [[ -n "$old_previous" ]]; then atomic_link "$RELEASES_DIR/$old_previous" "$PREVIOUS_LINK"; else remove_link "$PREVIOUS_LINK"; fi
    if [[ -n "$old_current" ]]; then atomic_write "$CURRENT_MARKER" "$old_current"; else remove_file "$CURRENT_MARKER"; fi
    if [[ -n "$old_previous" ]]; then atomic_write "$PREVIOUS_MARKER" "$old_previous"; else remove_file "$PREVIOUS_MARKER"; fi
    clear_transaction
    log 'discarded incomplete switch and restored old pointers'
  else
    die 'transaction and current pointer disagree; manual recovery required'
  fi
  [[ "$previous" == "$new_previous" || "$previous" == "$old_previous" || -z "$previous" ]] || true
}

test_fail_phase() {
  [[ -n "${DEPLOY_TEST_FAIL_PHASE:-}" && "${DEPLOY_TEST_FAIL_PHASE}" == "$1" ]] || return 0
  kill -KILL "$$"
}

validate_target_file() {
  [[ -e "$TARGET_FILE" || -L "$TARGET_FILE" ]] || return 0
  "$PYTHON_BIN" - "$TARGET_FILE" "$DEPLOY_TEST_MODE" <<'PY'
import os, stat, sys
p, test = sys.argv[1:]
i = os.lstat(p)
if stat.S_ISLNK(i.st_mode) or not stat.S_ISREG(i.st_mode): raise SystemExit("state/target.sha must be a regular non-symlink file")
if test != "1" and (i.st_uid, i.st_gid) != (os.geteuid(), os.getegid()): raise SystemExit("state/target.sha must be owned by computing-lab")
if stat.S_IMODE(i.st_mode) & 0o022: raise SystemExit("state/target.sha has unsafe permissions")
PY
}

api_main_sha() {
  local headers="$WORK_DIR/api.headers" body="$WORK_DIR/api.json" code token
  mkdir -p "$WORK_DIR"
  local args=(--fail --silent --show-error --proto '=https' --tlsv1.2 -m 30 -D "$headers" -o "$body" -w '%{http_code}')
  if [[ -f "$API_ETAG_FILE" ]]; then args+=(-H "If-None-Match: $(<"$API_ETAG_FILE")"); fi
  if [[ -f "$GITHUB_TOKEN_FILE" ]]; then
    validate_trusted_file "$GITHUB_TOKEN_FILE" GITHUB_TOKEN_FILE token root
    token="$(<"$GITHUB_TOKEN_FILE")"
    args+=(-H "Authorization: Bearer $token")
  fi
  code="$("$CURL_BIN" "${args[@]}" "$GITHUB_API_BASE/repos/$SOURCE_REPO/commits/main" 2>/dev/null)" || code=000
  if [[ "$code" == 304 ]]; then
    [[ -f "$API_SHA_FILE" ]] && cat "$API_SHA_FILE" || return 1
    return
  fi
  [[ "$code" == 200 ]] || return 1
  local sha etag
  sha="$("$PYTHON_BIN" -c 'import json,sys; print(json.load(open(sys.argv[1])).get("sha", ""))' "$body" 2>/dev/null)" || return 1
  is_sha "$sha" || return 1
  etag="$(awk 'BEGIN{IGNORECASE=1} /^ETag:/{sub(/\r$/, ""); sub(/^[^:]*:[[:space:]]*/, ""); print; exit}' "$headers")"
  [[ -z "$etag" ]] || { atomic_write "$API_ETAG_FILE" "$etag"; atomic_write "$API_SHA_FILE" "$sha"; }
  printf '%s' "$sha"
}

resolve_target_sha() {
  validate_target_file
  if [[ -e "$TARGET_FILE" ]]; then
    TARGET_FROM_WEBHOOK=1
    TARGET_SHA="$(<"$TARGET_FILE")"
    is_sha "$TARGET_SHA" || die 'state/target.sha must contain a full lowercase SHA'
    return
  fi
  TARGET_FROM_WEBHOOK=0
  TARGET_SHA="$(api_main_sha 2>/dev/null || true)"
  if ! is_sha "$TARGET_SHA"; then TARGET_SHA=''; log 'GitHub API unavailable and no webhook target; reconcile is a no-op'; return 1; fi
}

fetch_archive() {
  local sha="$1" destination="$2" base
  local -a bases
  IFS=' ' read -r -a bases <<<"$ARCHIVE_BASE_URLS"
  for base in "${bases[@]}"; do
    [[ "$base" == https://* ]] || continue
    if "$CURL_BIN" --fail --proto '=https' --tlsv1.2 --retry 3 --retry-delay 5 -m 600 -o "$destination" "$base/$SOURCE_REPO/tar.gz/$sha"; then
      [[ -s "$destination" ]] || continue
      (( $(stat -c %s "$destination") <= 268435456 )) || die 'source archive exceeds 256MB limit'
      ARCHIVE_SHA256="$(sha256_file "$destination")"
      log "downloaded archive sha256=$ARCHIVE_SHA256"
      return 0
    fi
  done
  die "all codeload archive bases failed for $sha"
}

extract_archive() {
  local archive="$1" destination="$2" sha="$3"
  tar -tzf "$archive" >/dev/null || die 'source archive listing failed'
  "$PYTHON_BIN" - "$archive" "$sha" <<'PY'
import pathlib, subprocess, sys, tarfile
path, sha = sys.argv[1:]
with tarfile.open(path, "r:gz") as archive:
    members = archive.getmembers()
    roots = set()
    for member in members:
        name = pathlib.PurePosixPath(member.name)
        if name.is_absolute() or ".." in name.parts or member.isdev(): raise SystemExit("unsafe source archive member")
        roots.add(name.parts[0] if name.parts else "")
    if roots != {"computing-lab-" + sha}: raise SystemExit("archive top-level directory does not match target SHA")
PY
  tar -xzf "$archive" -C "$destination" --no-same-owner --no-same-permissions
  [[ -d "$destination/computing-lab-$sha" && ! -L "$destination/computing-lab-$sha" ]] || die 'archive top-level directory mismatch'
}

build_candidate() {
  local sha="$1" source="$2" build_home lock_digest manifest
  STAGING_DIR="$WORK_DIR/$sha.$$.$RANDOM"
  build_home="$STAGING_DIR/home"
  [[ ! -e "$STAGING_DIR" && ! -L "$STAGING_DIR" ]] || die 'staging path already exists'
  mkdir "$STAGING_DIR"
  mkdir "$build_home"
  [[ -f "$source/package.json" && -f "$source/bun.lock" ]] || die 'exact source lacks package manifests'
  lock_digest="$(sha256_file "$source/bun.lock")"
  log "installing frozen dependencies for $sha"
  (cd "$source" && env -i PATH="$BUILD_PATH" HOME="$build_home" \
    VITE_BASE_PATH="$VITE_BASE_PATH" NODE_ENV=production \
    "$BUN_BIN" install --frozen-lockfile)
  log "building static dist for $sha"
  (cd "$source" && env -i PATH="$BUILD_PATH" HOME="$build_home" \
    VITE_BASE_PATH="$VITE_BASE_PATH" NODE_ENV=production \
    "$BUN_BIN" run build)
  validate_static_tree "$source/dist"
  log "smoking staged dist for $sha"
  (cd "$source" && env -i PATH="$BUILD_PATH" HOME="$build_home" \
    VITE_BASE_PATH="$VITE_BASE_PATH" \
    "$BUN_BIN" "$source/deploy/smoke.mjs" "$source/dist" "$VITE_BASE_PATH")
  validate_static_tree "$source/dist"
  mkdir -p "$STAGING_DIR/release"
  cp -a "$source/dist" "$STAGING_DIR/release/dist"
  validate_static_tree "$STAGING_DIR/release/dist"
  manifest="$(dist_manifest_digest "$STAGING_DIR/release/dist")"
  cat >"$STAGING_DIR/release/release.env" <<EOF
SOURCE_SHA=$sha
SOURCE_KIND=codeload
SOURCE_REF=main
ARCHIVE_SHA256=$ARCHIVE_SHA256
SOURCE_REPO=tviber/computing-lab
VITE_BASE_PATH=$VITE_BASE_PATH
BUN_VERSION=1.2.17
LOCKFILE_SHA256=$lock_digest
DIST_MANIFEST_SHA256=$manifest
SMOKE=pass
EOF
  fsync_path "$STAGING_DIR/release/release.env" "$STAGING_DIR/release/dist" "$STAGING_DIR/release"
}

publish_candidate() {
  local sha="$1" old_current old_previous release="$RELEASES_DIR/$1" candidate="$STAGING_DIR/release"
  old_current="$(read_link_sha "$CURRENT_LINK")"
  old_previous="$(read_link_sha "$PREVIOUS_LINK")"
  if [[ -e "$release" ]]; then
    if ! validate_release "$sha"; then
      quarantine_release "$sha"
    else
      rm -rf "$candidate"
    fi
  fi
  if [[ ! -e "$release" ]]; then
    mv "$candidate" "$release"
    fsync_path "$RELEASES_DIR"
    RELEASE_CREATED=1
  fi
  validate_release "$sha" || die 'candidate release failed strict validation'
  write_transaction publish prepared "$old_current" "$old_previous" "$sha" "$old_current"
  atomic_link "$RELEASES_DIR/$sha" "$CURRENT_LINK"
  test_fail_phase after-current
  write_transaction publish current-switched "$old_current" "$old_previous" "$sha" "$old_current"
  if [[ -n "$old_current" ]]; then atomic_link "$RELEASES_DIR/$old_current" "$PREVIOUS_LINK"; else remove_link "$PREVIOUS_LINK"; fi
  test_fail_phase after-previous
  write_transaction publish previous-switched "$old_current" "$old_previous" "$sha" "$old_current"
  atomic_write "$CURRENT_MARKER" "$sha"
  if [[ -n "$old_current" ]]; then atomic_write "$PREVIOUS_MARKER" "$old_current"; else remove_file "$PREVIOUS_MARKER"; fi
  test_fail_phase after-markers
  clear_transaction
  log "published $sha"
}

cleanup_releases() {
  local current previous path sha kept=0
  current="$(read_link_sha "$CURRENT_LINK")"
  previous="$(read_link_sha "$PREVIOUS_LINK")"
  for path in "$RELEASES_DIR"/*; do
    [[ -d "$path" && ! -L "$path" ]] || continue
    sha="${path##*/}"
    is_sha "$sha" || continue
    [[ "$sha" == "$current" || "$sha" == "$previous" ]] && continue
    if ! validate_release "$sha"; then
      quarantine_release "$sha"
      continue
    fi
    kept=$((kept + 1))
    if (( kept > KEEP_RELEASES )); then
      rm -rf "$path"
      fsync_path "$RELEASES_DIR"
      log "removed old release $sha"
    fi
  done
}

reconcile() {
  validate_config
  "$BUN_BIN" --version | grep -Fxq '1.2.17' || die 'BUN_BIN version must be exactly 1.2.17'
  init_layout
  acquire_lock
  recover_transaction
  validate_active_releases
  validate_markers
  [[ -e "$HOLD_FILE" ]] && { log 'hold is active; reconcile is a strict no-op'; return 0; }
  if ! resolve_target_sha; then return 0; fi
  [[ ! -f "$TARGET_FAILED_FILE" || "$(cut -d= -f1 "$TARGET_FAILED_FILE")" != "$TARGET_SHA" || "$(cut -d= -f2 "$TARGET_FAILED_FILE")" != "$TARGET_SHA" ]] || { log "target $TARGET_SHA is marked failed; no-op"; return 0; }
  local current
  current="$(read_link_sha "$CURRENT_LINK")"
  if [[ "$current" == "$TARGET_SHA" ]]; then
    validate_release "$TARGET_SHA" || die 'current release metadata is incomplete or tampered'
    log "target $TARGET_SHA already current; strict no-op"
    return 0
  fi
  local archive="$WORK_DIR/$TARGET_SHA.$$.tar.gz" unpack="$WORK_DIR/$TARGET_SHA.$$.unpack"
  ARCHIVE_FILE="$archive"
  UNPACK_DIR="$unpack"
  fetch_archive "$TARGET_SHA" "$archive"
  mkdir "$unpack"
  extract_archive "$archive" "$unpack" "$TARGET_SHA"
  local source="$unpack/computing-lab-$TARGET_SHA"
  if [[ "$TARGET_FROM_WEBHOOK" == 0 ]]; then
    [[ "$(api_main_sha 2>/dev/null || true)" == "$TARGET_SHA" ]] || die 'GitHub main moved before build'
  fi
  build_candidate "$TARGET_SHA" "$source"
  if [[ "$TARGET_FROM_WEBHOOK" == 0 ]]; then
    [[ "$(api_main_sha 2>/dev/null || true)" == "$TARGET_SHA" ]] || die 'GitHub main moved during build; stale release refused'
  fi
  publish_candidate "$TARGET_SHA"
  remove_file "$TARGET_FILE"
  remove_file "$TARGET_FAILED_FILE"
  rm -rf "$archive" "$unpack"
  ARCHIVE_FILE=''
  UNPACK_DIR=''
  rm -rf "$STAGING_DIR"
  STAGING_DIR=''
  cleanup_releases
}

rollback() {
  validate_config
  init_layout
  acquire_lock
  recover_transaction
  validate_active_releases
  validate_markers
  local current previous
  current="$(read_link_sha "$CURRENT_LINK")"
  previous="$(read_link_sha "$PREVIOUS_LINK")"
  [[ -n "$current" && -n "$previous" ]] || die 'rollback requires current and previous releases'
  validate_release "$current" || die 'current release is invalid'
  validate_release "$previous" || die 'previous release is invalid'
  atomic_write "$HOLD_FILE" "rollback $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  write_transaction rollback prepared "$current" "$previous" "$previous" "$current"
  atomic_link "$RELEASES_DIR/$previous" "$CURRENT_LINK"
  test_fail_phase after-current
  write_transaction rollback current-switched "$current" "$previous" "$previous" "$current"
  atomic_link "$RELEASES_DIR/$current" "$PREVIOUS_LINK"
  test_fail_phase after-previous
  write_transaction rollback previous-switched "$current" "$previous" "$previous" "$current"
  atomic_write "$CURRENT_MARKER" "$previous"
  atomic_write "$PREVIOUS_MARKER" "$current"
  test_fail_phase after-markers
  clear_transaction
  log "rolled back to $previous; hold remains active"
}

status_command() {
  validate_config
  init_layout
  local current previous marker hold
  current="$(read_link_sha "$CURRENT_LINK")"
  previous="$(read_link_sha "$PREVIOUS_LINK")"
  marker="$(read_marker "$CURRENT_MARKER")"
  hold='no'; [[ -e "$HOLD_FILE" ]] && hold='yes'
  local target=none
  [[ -f "$TARGET_FILE" ]] && target="$(<"$TARGET_FILE")"
  printf 'current=%s\nprevious=%s\nhold=%s\nmarker=%s\ntransaction=%s\ntarget=%s\n' \
    "${current:-none}" "${previous:-none}" "$hold" "${marker:-none}" "$( [[ -e "$TX_FILE" ]] && echo present || echo none )" "$target"
  validate_lock_path
  exec {LOCK_FD}>>"$LOCK_FILE"
  if "$FLOCK_BIN" -n "$LOCK_FD"; then
    printf 'lock=free\n'
    "$FLOCK_BIN" -u "$LOCK_FD" || true
  else
    printf 'lock=busy\n'
  fi
  exec {LOCK_FD}>&-
}

hold_command() { validate_config; init_layout; acquire_lock; recover_transaction; validate_active_releases; validate_markers; atomic_write "$HOLD_FILE" "manual hold $(date -u +%Y-%m-%dT%H:%M:%SZ)"; log 'hold enabled'; }
resume_command() { validate_config; init_layout; acquire_lock; recover_transaction; validate_active_releases; validate_markers; remove_file "$HOLD_FILE"; log 'hold cleared; run reconcile to deploy'; }
cleanup_command() { validate_config; init_layout; acquire_lock; recover_transaction; validate_active_releases; validate_markers; cleanup_releases; }

command="${1:-}"
case "$command" in
  reconcile) reconcile ;;
  rollback) rollback ;;
  status) status_command ;;
  hold) hold_command ;;
  resume) resume_command ;;
  cleanup) cleanup_command ;;
  *) die 'usage: reconcile.sh {reconcile|status|rollback|hold|resume|cleanup}' ;;
esac
