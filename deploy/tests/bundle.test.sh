#!/usr/bin/env bash
set -euo pipefail
scripts=$(cd "$(dirname "$0")/.." && pwd)
export scripts
fixture=$(mktemp -d)
trap 'rm -rf -- "$fixture"' EXIT
export fixture DEPLOY_OBJECT_CACHE="$fixture/cache"
mkdir "$DEPLOY_OBJECT_CACHE"
git init -q "$fixture/work"
cd "$fixture/work"
git config user.name 'Release test'
git config user.email release@example.invalid
head -c 32768 /dev/urandom >asset
git add asset
git commit -qm initial
export RELEASE_SHA=$(git rev-parse HEAD)
git update-ref refs/remotes/origin/main "$RELEASE_SHA"

# Fake the SSH boundary and exercise the actual sender and bundle importer.
cat >"$fixture/transport" <<'TRANSPORT'
#!/usr/bin/env bash
set -euo pipefail
read -r -a header
if [[ "${header[0]}" == base-v1 ]]; then
  [[ ${scenario:-} != legacy ]] || exit 1
  exec bash "$scripts/bundle-cache.sh" base
fi
echo "${header[0]}" >>"$fixture/deliveries"
cat >"$fixture/wire"
digest=$(sha256sum <"$fixture/wire")
[[ ${header[${#header[@]}-1]} == "${digest%% *}" ]]
if [[ ${header[0]} == bundle-v1 ]]; then
  [[ ${scenario:-} != broken ]] || exit 42
  bash "$scripts/bundle-cache.sh" unpack "${header[1]}" <"$fixture/wire" >"$fixture/archive"
  if [[ ${scenario:-} == failed ]]; then
    source "$scripts/receive-release.sh"
    systemd-run() { return 42; }
    systemctl() { return 1; }
    stage=$(mktemp -d "$fixture/stage.XXXXXXXX")
    mv "$fixture/archive" "$stage/source.tar.gz"
    if publish "$RELEASE_SHA" "$stage" "$(sha256sum <"$stage/source.tar.gz" | cut -d' ' -f1)"; then
      exit 1
    fi
  fi
else
  [[ ${header[0]} == "$RELEASE_SHA" ]]
  cp "$fixture/wire" "$fixture/archive"
fi
TRANSPORT
chmod +x "$fixture/transport"
publish() {
  bash "$scripts/send-release.sh" "$fixture/transport"
  git archive --format=tar.gz --prefix="computing-lab-$RELEASE_SHA/" "$RELEASE_SHA" | cmp - "$fixture/archive"
}
publish
full_size=$(wc -c <"$fixture/wire")
git rm -q asset
echo delta >small
git add small
git commit -qm second
RELEASE_SHA=$(git rev-parse HEAD)
git update-ref refs/remotes/origin/main "$RELEASE_SHA"
publish
(( $(wc -c <"$fixture/wire") < full_size ))
publish # Retry an already cached SHA.
scenario=legacy publish
: >"$fixture/deliveries"
scenario=broken publish
[[ $(cat "$fixture/deliveries") == "bundle-v1"$'\n'"$RELEASE_SHA" ]]
: >"$fixture/deliveries"
result=0
scenario=failed bash "$scripts/send-release.sh" "$fixture/transport" 2>"$fixture/error" || result=$?
[[ $result == 1 && $(cat "$fixture/deliveries") == bundle-v1 ]]
grep -F 'systemd-run status 42' "$fixture/error" >/dev/null
echo 'ok - full, delta, cached retry, legacy, cache failure, and publication failure'
