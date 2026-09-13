# Installation and support operations

Target: Hostinger VPS managed with Dokploy. VPS sizing is intentionally deferred. This is a runbook specification for Phase 23, not a record of an existing deployment.

## Repeatable installation

Use one versioned application image for API and worker entry points, a separately versioned PostgreSQL image, and private persistent storage. Each nursery has a distinct deployment/project name, domain, database, database credentials, session secret, installation ID, file volume, and backup prefix.

Dokploy routes the domain to the API/web service and terminates TLS. Serve /api/v1 and the web client from one origin. Configure SPA route fallback, proxy trust, upload limits, SSE heartbeat/buffering/timeouts, and health checks. PostgreSQL is not exposed publicly.

Docker Compose is the recommended reproducible delivery format supported by Dokploy. Also document native process equivalents for development or later operations; do not build two competing deployment systems. A separate Nginx image is optional, not a prerequisite.

## Required deployment inputs

Nursery name, domain, support phone/contact text, database and session secrets, initial Superadmin setup credential mechanism, license validity/grace, parent/employee slot capacities, private storage path/volume, backup destination/encryption configuration. Obtain actual server capacity at deployment verification; no assumed CPU/RAM guarantee.

A protected one-time bootstrap creates the installation's Superadmin and validates that no prior root exists. Credentials are supplied securely and never logged or committed. A nursery admin login consumes one employee reservation; initialize capacity accordingly.

## Start and upgrade sequence

1. Validate environment and storage permissions.
2. Take a current backup before a data migration.
3. Stop/coordinate incompatible workers and enter a clear maintenance mode when required.
4. Run forward migrations once under a database lock.
5. Start compatible API and worker versions; verify readiness and queue health.
6. Run smoke checks for login, authorized parent view, one test-safe read, static assets, and workers.
7. Retain release/migration version and rollback instructions.

Rollback may require a compatible forward fix or tested database restore. Do not claim every migration can be reversed automatically. Never run destructive demo reset/seed against production.

## Backup

Back up PostgreSQL and private files as a coherent recovery set, including a manifest with installation ID, schema/release version, time, and checksums. Use a maintenance/write barrier or documented consistent snapshot strategy so database references never point to omitted files.

Initial retention: seven daily and four weekly recovery sets, configurable, plus pre-upgrade/restore sets. Keep encrypted copies off the VPS. A local-only backup is not protection against loss of that server. Configure destination and test credentials during deployment.

Backup jobs expose success/failure and last successful date in Superadmin. Redact secrets and child data from logs. Do not put backup archives under the public web root.

## Restore

Superadmin may select a backup of the current installation, review its identity/date/version, and start a fixed restore job with reauthentication and explicit target confirmation. No arbitrary command execution.

Restore into a fresh isolated target first. Verify schema, file checksums, login, key child records, ledger reconciliation, and worker compatibility. When an actual live restore is authorized, take a current backup, enter maintenance, prevent writes, restore the database and files coherently, revoke old sessions, verify, then reopen.

Cross-installation backup restore is rejected by default to prevent a customer's data being loaded into another customer's nursery. A deliberate migration is a separate support procedure.

The planning task does not authorize access to a live customer VPS. Phase 23 produces and verifies the scripts with synthetic/local or explicitly supplied staging targets. Live execution needs the actual target and the tech lead's deployment instruction.

## Monitoring and recovery

Health: API process, database readiness, worker heartbeat, oldest overdue job, last successful recurring generation, disk usage, backup age, error counts. Distinguish the user's offline network from a backend outage.

Audit: support actor, target, operation, reason, before/after references, success/failure. Audit data must not contain passwords/session tokens/file contents.

Billing queue recovery reuses occurrence keys. Restore and catch-up must not duplicate charges or receipts. Licensing/feature restrictions still apply after restart; browser cache is never the authority.

Keep separate nonproduction demo data and credentials. Real parent information is not used in screenshots or seeded fixtures.

## Operator instructions to produce

New nursery deployment, configure branding/roles/limits, provision first admin, reset password, release a seat explicitly, renew subscription, diagnose a blocked user, check billing worker, take/download backup, restore to staging, upgrade, review logs, and collect a support bundle with redacted data.

The final delivery includes tested commands once the implementation exists. This plan itself contains no claim of performed backup, restore, or deployment.
