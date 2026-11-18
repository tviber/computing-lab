# Deployment

Production uses a single Debian host. GitHub Actions sends a signed deployment
webhook after successful CI; the host reconciler downloads the exact commit
archive from GitHub codeload over HTTPS, builds a static release with Bun
1.2.17, then atomically updates `current` and `previous`.

The host configuration example is [host.env.example](../deploy/host.env.example).
The reconciler is installed as `/usr/local/libexec/computing-lab/reconcile.sh`.
Its status, hold, resume, rollback, and cleanup operations are documented in
the service runbook maintained by the host operator.

For migration from the former mirror setup, follow [MIGRATION.md](../deploy/MIGRATION.md).
