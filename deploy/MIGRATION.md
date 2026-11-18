# Deployment source migration

## Host changes

1. Install the updated `reconcile.sh` and `fsync.py` at the existing libexec
   path, owned by root and not writable by the deployment account.
2. Replace `deploy.env` with the values in `host.env.example`. Keep `BUN_BIN`
   pinned to Bun `1.2.17`; do not change the existing release root or Caddy
   configuration.
3. Configure `/root/deploy.sh` to validate the GitHub webhook as before and,
   for a valid push event for `tviber/computing-lab` on `refs/heads/main`, write
   the full lowercase 40-character `after` SHA to
   `/srv/computing-lab/state/target.sha` atomically. Set owner/group to
   `computing-lab:computing-lab` and mode `0640`. The reconciler trusts that
   file first and removes it after a successful publish.
4. Optionally install a GitHub API token at
   `/etc/computing-lab/github.token` with root ownership and mode `0640`, and
   configure `GITHUB_TOKEN_FILE`. Without the token, API resolution uses an
   anonymous conditional request when no webhook target is present.
5. Run `reconcile.sh status`, then `reconcile.sh reconcile` and verify the
   current release and static site before disabling the former mirror timer
   source.

## GitHub Actions settings

Set repository variable `DEPLOY_HOOK_URL` to the HTTPS webhook endpoint and
repository secret `DEPLOY_HOOK_SECRET` to the same HMAC secret configured on
the host. `GITHUB_TOKEN` is optional for the host API fallback; do not put
tokens in repository files or logs.

The deploy workflow triggers only after successful CI on `main`, or by manual
dispatch with a full lowercase commit SHA. The webhook payload contract is the
GitHub push shape for `tviber/computing-lab`, `refs/heads/main`, and that SHA.

## Rollback and cleanup

Use `reconcile.sh rollback` to atomically switch to `previous`; this enables a
hold until `reconcile.sh resume` is run. Existing releases with the legacy
`GITEE_REF=main` metadata remain valid, so rollback to the current production
release and its previous release remains available after migration.

After verifying HTTPS deployments and rollback, remove the former mirror
credentials and settings:

- Delete `/etc/computing-lab/keys/gitee-readonly`.
- Remove every `GITEE_*` setting from `/etc/computing-lab/deploy.env`.
- Disable the `GITEE_REPOSITORY` repository variable.
- Remove any remaining mirror SSH configuration and obsolete workflow files.
