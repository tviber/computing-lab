#!/usr/bin/env bash
# Installed root-owned. Run as the dedicated cache account, never as root.
set -euo pipefail
umask 077
cache=${DEPLOY_OBJECT_CACHE:-/var/cache/computing-lab-git}
repo="$cache/source.git"
ref=refs/heads/release

case "$1" in
  base)
    base=$(git --git-dir="$repo" rev-parse --verify "$ref^{commit}" 2>/dev/null) || base=empty
    printf 'bundle-v1 %s\n' "$base"
    ;;
  unpack)
    sha=$2
    [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || exit 1
    git init --bare -q "$repo"
    bundle=$(mktemp "$cache/incoming.XXXXXXXX")
    trap 'rm -f -- "$bundle"' EXIT
    cat >"$bundle"
    [[ "$(git bundle list-heads "$bundle")" == "$sha $ref" ]] || exit 1
    git --git-dir="$repo" -c fetch.fsckObjects=true -c protocol.file.allow=always \
      fetch --no-tags --no-write-fetch-head "$bundle" "+$ref:$ref" >&2
    [[ "$(git --git-dir="$repo" cat-file -t "$sha")" == commit ]]
    git --git-dir="$repo" archive --format=tar.gz --prefix="computing-lab-$sha/" "$sha"
    ;;
  *) exit 1 ;;
esac
