# Deployment

After successful push CI on `main`, GitHub Actions asks the Debian host for its
cached Git commit. It sends a Git bundle containing the objects needed for the
target SHA. An empty cache receives a full bundle. The job waits for the joint
release to finish rather than reporting success when a trigger is accepted.
To retry, manually run **Deploy production over SSH** from `main` with the full
SHA of a successful push CI run on `main`.

## Provisioning

- Install `release.sh`, `bundle-cache.sh`, and `receive-release.sh` from `deploy/` under
  `/usr/local/libexec/computing-lab/`, owned by root and not writable by the
  publisher. Keep the existing coordinated reconciler and API deployer.
- Create a locked system account `computing-lab-git` without login or sudo, and
  `install -d -m 0700 -o computing-lab-git -g computing-lab-git /var/cache/computing-lab-git`.
  Install the executable cache helper and release script first, then the receiver.
  The cache account only needs write access to its cache. The receiver parses Git
  objects as that account and supplies the resulting archive to the joint release.
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

The receiver bounds the upload and checks its SHA-256. For bundles it checks the
advertised target, imports the objects and computes the reconstructed archive digest.
An older receiver or a cache reconstruction failure uses the full source archive
protocol. A failure during publication is reported to Actions. The cached SHA
can precede or follow the active SHA because it describes available objects.
To rebuild the cache, clear it between deliveries. Check phase durations for the
release lock, static preparation, API release, and activation in the release journal.

The receiver hands the archive to the
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
