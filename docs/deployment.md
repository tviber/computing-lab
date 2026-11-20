# Deployment

After successful push CI on `main`, GitHub Actions downloads the exact commit
archive and streams it over SSH to the Debian host. The job waits for the joint
release to finish rather than reporting success when a trigger is accepted.
To retry, manually run **Deploy production over SSH** from `main` with the full
SHA of a successful push CI run on `main`.

## Provisioning

- Install `release.sh` and `receive-release.sh` from `deploy/` under
  `/usr/local/libexec/computing-lab/`, owned by root and not writable by the
  publisher. Keep the existing coordinated reconciler and API deployer.
- Use a dedicated `computing-lab-push` account with a locked password and a
  root-owned home and `.ssh` directory. Its one authorized key must use
  `restrict,command="/usr/bin/sudo -n /usr/local/libexec/computing-lab/receive-release.sh"`.
  In sudoers, allow this account to run only that receiver as root with no
  arguments (`/usr/local/libexec/computing-lab/receive-release.sh ""`).
- Limit the Actions `production` environment to the `main` branch. Set its
  `DEPLOY_SSH_HOST`, `DEPLOY_SSH_KEY`, and `DEPLOY_SSH_KNOWN_HOSTS` secrets.
  Pin the Ed25519 public host key obtained through a trusted admin connection;
  do not generate `known_hosts` in the runner by scanning the deployment host.
  Treat the CI key as production release authority; never reuse an admin key.

## Release and fallback

The receiver bounds the upload and checks its SHA-256 before handing it to the
root-owned joint release service. The release checks that the SHA belongs to
`main` and advances both active versions. It stages and smoke-tests the static
build with Bun 1.2.17, rehearses the API migration and checks live API routes,
then activates the static build. The checksum covers transfer integrity; the
restricted CI key authorizes the contents of the archive.

Check the active versions in `/srv/computing-lab/state/current.sha` and
`/srv/computing-lab-api/state/deployed.sha`. Inspect a push release with
`journalctl -u computing-lab-push-<sha>.service`. If SSH delivery is unavailable,
an administrator can still start `computing-lab-release@<sha>.service` to
download directly from GitHub. A SHA already serving both frontend and API is
a health-checked no-op.
