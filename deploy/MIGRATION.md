# Deployment source migration

The host is driven by one coordinator: GitHub Actions builds a bundle or
archive from `main`, sends it over the restricted SSH account, and `release.sh`
runs `reconcile.sh prepare` and `reconcile.sh activate` as a joint static and
API release. The standalone codeload/webhook reconciler and its timer are
retired.

## Provisioning from the repository

1. Install `reconcile.sh`, `fsync.py`, `release.sh`, `bundle-cache.sh`, and
   `receive-release.sh` from `deploy/` under `/usr/local/libexec/computing-lab/`,
   owned by root and not writable by the deployment or publisher accounts.
2. Install `/etc/computing-lab/deploy.env` from `deploy/host.env.example`.
   Keep `BUN_BIN` pinned to Bun 1.2.17.
3. Do not install the previous `computing-lab-reconcile.timer`/`.service` or
   the webhook `deploy.sh`: CI on `main` is the only automatic trigger.
4. Run `reconcile.sh status`, then `hold` and `resume`, to validate the current
   and previous releases. `status` does not validate release metadata.

## Release and recovery

`release.sh <sha>` is the manual fallback when SSH delivery is unavailable; it
downloads the archive from codeload and runs the same prepare/activate
contract.

The joint release is forward-only. To undo a bad release, revert the commit on
`main` and publish the revert. The previous API release directory is retained
for an emergency API-only source switch; the database backup written before
migration is the recovery point for data.

Releases written by the retired SSH-only host script (`SOURCE_KIND=ssh`) remain
valid; the reconciler accepts `SOURCE_KIND=ssh`, `SOURCE_KIND=codeload`, and
the legacy `GITEE_REF=main` metadata.

## Cleanup after migration

- Delete `/etc/computing-lab/keys/gitee-readonly` and remove every `GITEE_*`
  setting from `/etc/computing-lab/deploy.env`.
- Disable the `GITEE_REPOSITORY` repository variable and remove mirror SSH
  configuration.
- Remove the masked `computing-lab-reconcile` and `computing-lab-release@`
  unit links, plus retired `/root` deployment copies after a successful
  release.
