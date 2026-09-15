# Installation and support operations

Target: Hostinger VPS managed with Dokploy. VPS sizing is intentionally deferred. Phase 23 implemented the package described here; the tested commands and their evidence are in [DEPLOYMENT_AND_BACKUP.md](DEPLOYMENT_AND_BACKUP.md). No live nursery has been deployed, backed up or restored by this repository.

## Repeatable installation

Use one versioned application image for API and worker entry points, a separately versioned PostgreSQL image, and private persistent storage. Each nursery has a distinct deployment/project name, domain, database, database credentials, session secret, installation ID, file volume, and backup prefix.

Dokploy routes the domain to the API/web service and terminates TLS. Serve /api/v1 and the web client from one origin. Configure SPA route fallback, proxy trust, upload limits, SSE heartbeat/buffering/timeouts, and health checks. PostgreSQL is not exposed publicly.

Phase22 PWA assets: the web build emits `/sw.js`, `/manifest.webmanifest` and `/icons/*` next to the hashed bundle. Serve `/sw.js` from the site root with `Cache-Control: no-cache` (or a short max-age) and the correct JavaScript type so browsers pick up new versions; hashed `/assets/*` may be cached long-term; `index.html` must not be cached long-term. Never serve API responses with cacheable headers. See [PWA_AND_NETWORK.md](PWA_AND_NETWORK.md).

Docker Compose is the delivery format: `infra/docker-compose.yml` with `infra/Dockerfile` (one application image for API/web, worker and operator commands) and `infra/.env.production.example`. The API serves the built client itself (`WEB_DIST_DIR`), so no Nginx image exists. Native equivalents for development or an emergency host: `npm run start:api`, `npm run start:worker`, and the `infra/scripts` commands below.

### Dokploy steps (new nursery)

1. Create a Dokploy project per nursery and a **Docker Compose** service from this repository with compose path `infra/docker-compose.yml`. Add the domain to service `api`, port `3000`, HTTPS with Let's Encrypt. `dokploy-network` must exist (Dokploy creates it).
2. Paste `infra/.env.production.example` into the service environment and fill every `<required>` value: `RELEASE_VERSION` (git short SHA), `INSTALLATION_ID` (new UUID), `APP_ORIGIN` (exactly `https://<domain>`), `SUPPORT_CONTACT`, `POSTGRES_PASSWORD`, `SESSION_SECRET`, `BACKUP_ENCRYPTION_KEY` (keep a copy outside the server), and the off-host destination (`OFFSITE_MOUNT` + uncomment the two `/offsite` volume lines, or `BACKUP_TARGET=none` when Dokploy Volume Backups ship the `backups` volume to S3).
3. Deploy. The `migrate` service runs `release:prepare` (environment/storage check, pre-upgrade backup when needed, migrations) and exits; `api` and `worker` start only after it succeeds. Watch the `migrate` logs; a failure leaves the previous release running.
4. Create the Superadmin from the Dokploy terminal of the `api` container with private stdin JSON (see [AUTHENTICATION.md](AUTHENTICATION.md)): `printf '{"username":"…","password":"…"}' | node --import tsx apps/api/src/auth-command.ts bootstrap`. Sign in within 24 hours and change the password.
5. Smoke checks: `https://<domain>/api/v1/readiness` → `ready`; the login page loads; the Superadmin signs in; `/support/operations` shows worker heartbeat "healthy", backups configured and the off-host destination; `/sw.js` responds with `Cache-Control: no-cache`.
6. Configure license, capacities, branding, roles and the first admin as in [LICENSING_AND_SETTINGS.md](LICENSING_AND_SETTINGS.md); then request a manual backup from `/support/operations` and confirm it reaches the off-host destination.

## Required deployment inputs

Nursery name, domain, support phone/contact text, database and session secrets, initial Superadmin setup credential mechanism, license validity/grace, parent/employee slot capacities, private storage path/volume, backup destination/encryption configuration. Obtain actual server capacity at deployment verification; no assumed CPU/RAM guarantee.

A protected one-time bootstrap creates the installation's Superadmin and validates that no prior root exists. Credentials are supplied securely and never logged or committed. A nursery admin login consumes one employee reservation; initialize capacity accordingly.

## Start and upgrade sequence

Implemented by `npm run release:prepare` (`infra/scripts/release.ts`, the Compose `migrate` service) plus the start checks in `apps/api/src/server.ts` and `apps/worker/src/worker.ts`:

1. Validate environment and storage permissions (`npm run env:check` reports problems by variable name, never values; it checks the validation target too; `release:prepare` re-checks storage and refuses an unknown schema or an initialized database whose installation identity differs from `INSTALLATION_ID`).
2. Take a current backup before a data migration: when migrations are pending on a non-empty database, a `PRE_UPGRADE` recovery set is written (and copied off-host) before anything changes; `--skip-backup` must be passed deliberately to bypass it. If the pending migration itself introduces `backup_runs` (0023), the set is taken detached and recorded after the migration.
3. Stop/coordinate incompatible workers: Compose replaces `api` and `worker` together and both wait for `migrate`; a running old worker refuses to continue once its schema check fails on restart. Maintenance mode for a live restore = stop `api` and `worker` (Dokploy → Stop) so no writes occur.
4. Run forward migrations once under advisory lock `7190101` (`applyMigrations`; each file in its own transaction, recorded in `schema_migrations`).
5. Start compatible API and worker versions: both call `assertSchemaCurrent` and exit when the schema is behind/ahead or the installation baseline differs from `INSTALLATION_ID`; the API also verifies the private storage root. Worker startup obtains the maintenance lock before failing abandoned RUNNING backup/restore rows as `WORKER_RESTARTED`; it leaves a legitimately locked run untouched. Readiness `/api/v1/readiness`, worker heartbeat and queue state appear on `/support/operations`.
6. Smoke checks: login, an authorized parent view, one read, `/sw.js` and `/manifest.webmanifest`, worker heartbeat younger than three minutes, last backup age.
7. Retain `RELEASE_VERSION` and `schema_version` (both shown in the support screen and in every backup manifest) with rollback instructions.

Rollback: redeploy the previous image tag when no migration ran; otherwise restore the `PRE_UPGRADE` set taken in step 2 with the live procedure below (schema goes back with the data). Do not claim every migration can be reversed automatically. Never run destructive demo reset/seed against production.

Graceful shutdown: SIGTERM stops accepting connections, ends SSE streams through the `preClose` hook, waits up to `SHUTDOWN_TIMEOUT_MS` (15 s; Compose `stop_grace_period` 30 s) and then closes remaining sockets. The worker stops pg-boss gracefully within the same deadline.

## Backup

Implemented (D51; format and evidence in [DEPLOYMENT_AND_BACKUP.md](DEPLOYMENT_AND_BACKUP.md)): the worker writes an encrypted recovery set (PostgreSQL custom dump from a snapshot exported under the exclusive file barrier + every private file + manifest with installation ID, schema/release version, time and SHA-256 checksums) into the private `backups` volume on `BACKUP_SCHEDULE` (default 02:00 Cairo), on Superadmin request (`/support/operations` → Create backup now), from `npm run backup:create`, and before migrations/live restores (`PRE_UPGRADE`/`PRE_RESTORE`).

Retention: seven daily plus four weekly scheduled sets and four per manual kind, configurable through `BACKUP_RETENTION_*`. Off-host copy: `BACKUP_TARGET=directory:/offsite` with remote storage mounted at `OFFSITE_MOUNT`, or Dokploy Volume Backups of the `backups` volume when `BACKUP_TARGET=none`. A local-only backup is not protection against loss of that server; the support screen warns while no off-host destination is configured, and a run whose copy failed shows `OFFSITE_FAILED`.

Status: `/support/operations` shows the last run, last successful date/age, failed or skipped runs in the last seven days, worker heartbeat and disk space; `backup_runs.error_code` holds a fixed classification only. Logs redact connection strings and never include child data. Archives live in `/data/backups`, outside the web root and outside `PRIVATE_FILES_DIR`.

## Restore

Superadmin selects a successful recovery set on `/support/operations`, types its archive name back, re-enters the password and gives a reason; the worker restores it into the isolated validation target (`RESTORE_VALIDATION_DATABASE_URL` = `<db>_restore_check`, `RESTORE_VALIDATION_FILES_DIR` = `/data/restore-check`) and stores a report (schema version, migrations applied, sessions revoked, files referenced/missing/mismatched, accounts, children, outstanding debt, treasury balance, nursery name, license validity). Requests fail visibly with `TARGET_NOT_CONFIGURED`, `ARCHIVE_INVALID`, `SCHEMA_AHEAD`, `CROSS_INSTALLATION`, `PG_RESTORE_FAILED` or `VERIFICATION_FAILED`. No arbitrary command execution exists.

Staging/CLI validation: `BACKUP_ENCRYPTION_KEY=… npm run backup:restore -- --archive /data/backups/<set>.tar.enc --mode validate --target-database-url postgresql://…/<other db> --target-files-dir /data/restore-check`.

Live restore (authorized operator action): 1) stop `api` and `worker` (maintenance, no writes); 2) run `npm run backup:restore -- --archive <set> --mode live --target-database-url <live DATABASE_URL> --target-files-dir <live PRIVATE_FILES_DIR> --confirm-database <exact database name>` — the command requires those exact configured targets, automatically creates a healthy `PRE_RESTORE` set, refuses to continue if that run reports a backup/offsite-copy/retention error, holds the maintenance lock, replaces the target database and private namespaces, migrates forward and revokes every session; 3) start `api` and `worker`; 4) verify sign-in, one private document, balances and `/support/operations` heartbeat; 5) reopen access. Rerunning the migrate step afterwards is safe.

Cross-installation archives are rejected (`CROSS_INSTALLATION`) unless `--allow-cross-installation` is passed deliberately for a documented migration.

The planning task does not authorize access to a live customer VPS. Phase 23 produces and verifies the scripts with synthetic/local or explicitly supplied staging targets. Live execution needs the actual target and the tech lead's deployment instruction.

## Monitoring and recovery

Health: `/api/v1/health` (process), `/api/v1/readiness` (database), and `/support/operations` for worker heartbeat (`worker_heartbeats`, healthy under three minutes), queue counts per state, overdue and failed jobs, last recurring charge period and reminder, disk usage, last backup age and release/schema versions. Distinguish the user's offline network from a backend outage (Phase 22 connection dialog).

Audit: support actor, target, operation, reason, before/after references, success/failure. Audit data must not contain passwords/session tokens/file contents.

Billing queue recovery reuses occurrence keys. Restore and catch-up must not duplicate charges or receipts. Licensing/feature restrictions still apply after restart; browser cache is never the authority.

Keep separate nonproduction demo data and credentials. Real parent information is not used in screenshots or seeded fixtures.

## Troubleshooting

Drawn from the Phase 23 evidence in [DEPLOYMENT_AND_BACKUP.md](DEPLOYMENT_AND_BACKUP.md); the fixed codes below are exactly what the implemented services return, not illustrative examples.

| Symptom | Likely cause | Action |
|---|---|---|
| `migrate` service fails and `api`/`worker` never start | A pending migration is invalid for the current data, or `env:check` rules failed | Read the `migrate` container log (Dokploy → service logs); it names the failing check/migration. The previous release keeps running until you redeploy a fix. Do not skip the pre-upgrade backup to work around this. |
| `env:check` / `release:prepare` refuses to start: "installation baseline differs from `INSTALLATION_ID`" | The database already belongs to a different installation, or `INSTALLATION_ID` was typed wrong for this deployment | Confirm the intended `INSTALLATION_ID` against the database's recorded baseline before proceeding; never force past this check. |
| `release:prepare` refuses: unknown/ahead schema | The image is older than the database's applied migrations (a rollback attempt, or a mismatched image tag) | Redeploy the image version that matches the schema, or apply the correct forward migrations first. |
| Worker heartbeat on `/support/operations` is missing or older than three minutes | Worker container is down, crash-looping, or lost its database connection | Check `worker` container logs; confirm `DATABASE_URL` is reachable; a legitimate `WORKER_RESTARTED` backup/restore row means the worker restarted mid-run and the job will be retried on the next schedule. |
| Backup run shows `PG_DUMP_FAILED`, `FILES_FAILED`, `ARCHIVE_FAILED`, `RETENTION_FAILED`, or `CONFIG_MISSING` | See `backup_runs.error_code` on `/support/operations`; stderr itself is redacted from logs | `CONFIG_MISSING` means required backup environment variables are absent — fix `.env` and redeploy. The others indicate a `pg_dump`/disk/permission problem on the `backups` volume; check `PG_BIN_DIR`, volume free space, and container file permissions. |
| Backup run shows `OFFSITE_FAILED` (or the support screen warns no off-host destination is configured) | `BACKUP_TARGET=directory:<path>` points at an unmounted or unwritable path, or `BACKUP_TARGET=none` was chosen without enabling Dokploy Volume Backups | The local archive is still valid; a local-only backup is not protection against loss of that server, so fix the off-host destination before relying on it. |
| Restore request fails with `TARGET_NOT_CONFIGURED` | `RESTORE_VALIDATION_DATABASE_URL`/`RESTORE_VALIDATION_FILES_DIR` (validation) or the exact live targets (`--mode live`) are not set | Set the missing environment variable(s); live mode intentionally requires the exact configured live database/files targets, never an arbitrary path. |
| Restore request fails with `ARCHIVE_INVALID` | The archive's checksum, GCM tag, or manifest format did not match, or the wrong `BACKUP_ENCRYPTION_KEY` was supplied | Re-check the encryption key and that the archive/sidecar pair was not truncated or edited; try a different recorded run. |
| Restore request fails with `SCHEMA_AHEAD` | The archive was taken on a newer schema than the code being restored | Deploy the matching or newer release version before restoring this archive. |
| Restore request fails with `CROSS_INSTALLATION` | The archive belongs to a different `INSTALLATION_ID` | Expected safety behavior; only pass `--allow-cross-installation` for a deliberate, documented migration between installations. |
| Restore request fails with `PG_RESTORE_FAILED` or `VERIFICATION_FAILED` | The dump could not be applied cleanly, or the post-restore report could not verify accounts/files/balances | Inspect the redacted `pg_restore` log excerpt on the report; retry `--mode validate` before ever attempting `--mode live` again. |
| `/sw.js` or `index.html` is being cached by the browser/proxy after a release | A proxy or CDN is overriding the emitted `Cache-Control` headers | Confirm `apps/api/src/static.ts` is actually serving these paths (same origin, `WEB_DIST_DIR` set) and that no intermediate cache strips the `no-cache` header on `/sw.js`/`index.html`. |
| `npm audit --omit=dev` is non-zero | Known: ExcelJS's bundled `uuid` dependency (S24-01, moderate, not high/critical) | Confirmed the installed ExcelJS call site does not use the affected `uuid` path; do not apply an unreviewed major-version downgrade to "fix" the audit. Re-review before each release. |

Every code above and its exact source is listed in [DEPLOYMENT_AND_BACKUP.md](DEPLOYMENT_AND_BACKUP.md) and implemented in `apps/api/src/modules/support/*`; this table does not add new behavior.

## Operator instructions

| Task | Where |
|---|---|
| New nursery deployment | Dokploy steps above; `infra/.env.production.example` |
| Configure branding/roles/limits, provision first admin | `/administration/settings`, `/administration/organization`, `/support/licenses` ([LICENSING_AND_SETTINGS.md](LICENSING_AND_SETTINGS.md)) |
| Reset a password | `/support/operations` → Account lookup → Reset password (SYSTEM password re-entered; temporary password shown once) |
| Release a seat explicitly / restore a released account | `/support/operations` → Account lookup → Release seat / Restore released account (Superadmin only) |
| Renew subscription | `/support/licenses` |
| Diagnose a blocked user | `/support/operations` → Account lookup (status, until date, reservation, last sign-in) and Audit search |
| Check billing worker | `/support/operations` → worker heartbeat, queues, last recurring charge period |
| Take a backup | `/support/operations` → Create backup now, or `npm run backup:create` in the `worker`/`api` container |
| Download a backup | Copy `/data/backups/<set>.tar.enc` + `.manifest.json` from the `backups` volume (Dokploy volume browser or `docker cp`); the off-host copy is already there when `BACKUP_TARGET` is a directory |
| Restore to staging | `/support/operations` → Restore validation, or `npm run backup:restore -- --mode validate …` |
| Upgrade | Deploy the new `RELEASE_VERSION`; `migrate` takes the pre-upgrade set and migrates; roll back per the sequence above |
| Review logs | Dokploy service logs (`api`, `worker`, `migrate`); connection strings and secrets are redacted |
| Collect a support bundle | `npm run support:bundle -- --output /data/backups/support-bundle.json` (redacted; refuses to include secret values) |

Tested command transcripts are recorded in [DEPLOYMENT_AND_BACKUP.md](DEPLOYMENT_AND_BACKUP.md). No live deployment, live backup or live restore has been performed.
