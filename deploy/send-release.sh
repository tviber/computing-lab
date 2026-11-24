#!/usr/bin/env bash
set -euo pipefail
[[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]]
git merge-base --is-ancestor "$RELEASE_SHA" origin/main
transport=("$@")
stage=$(mktemp -d)
trap 'rm -rf -- "$stage"' EXIT

send() {
  local prefix=$1 payload=$2 digest
  digest=$(sha256sum <"$payload") || return 1
  { printf '%s%s %s\n' "$prefix" "$RELEASE_SHA" "${digest%% *}"; cat "$payload"; } | "${transport[@]}"
}

# Old forced-command receivers reject this probe, and accept the archive below.
if reply=$(printf 'base-v1\n' | "${transport[@]}") && [[ "$reply" =~ ^bundle-v1\ (empty|[0-9a-f]{40})$ ]]; then
  base=${BASH_REMATCH[1]}
  ref=refs/heads/release
  git update-ref "$ref" "$RELEASE_SHA"
  revisions=("$ref")
  if [[ "$base" != empty && "$base" != "$RELEASE_SHA" ]] && git merge-base --is-ancestor "$base" "$RELEASE_SHA"; then
    revisions+=("^$base")
  elif [[ "$base" == "$RELEASE_SHA" ]] && git rev-parse --verify "$base^" >/dev/null 2>&1; then
    revisions+=("^$base^")
  fi
  git bundle create "$stage/source.bundle" "${revisions[@]}"
  if send 'bundle-v1 ' "$stage/source.bundle"; then exit 0; else result=$?; fi
  # A release may already have begun after a disconnect. Only retry a known
  # pre-publication cache failure, never an ambiguous SSH or release failure.
  [[ "$result" == 42 ]] || exit "$result"
fi

echo 'Using full source archive' >&2
git archive --format=tar.gz --prefix="computing-lab-$RELEASE_SHA/" "$RELEASE_SHA" >"$stage/source.tar.gz"
send '' "$stage/source.tar.gz"
