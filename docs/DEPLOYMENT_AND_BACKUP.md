# Deployment package, backup, restore and support (Phase 23)

Implements R01/R16 with defaults D23 and D51. This document records what exists in the repository, what was actually
exercised on local disposable infrastructure, and which real deployment inputs are still missing. It is not a claim that
any live nursery was deployed, backed up or restored.

## Package contents

| Asset | Purpose |
|---|---|
| `infra/Dockerfile` | One image for API (serving the built web client), worker and operator commands. The build base is Node 24.19.0 bookworm-slim pinned by multi-platform index digest; the runtime base is PostgreSQL 18.4 bookworm pinned by digest, supplies the exact `pg_dump`/`pg_restore`, and receives only the pinned Node binary. It runs as non-root `node`, bakes no secrets, and has a `/api/v1/readiness` healthcheck. |
| `infra/docker-compose.yml` | Dokploy Compose: digest-pinned `postgres` 18.4 (private, healthcheck, `docker-entrypoint-initdb.d` creates `<db>_restore_check`), one-shot `migrate` (`infra/scripts/release.ts`), `api` (waits for `migrate` success, `expose 3000`, joined to `dokploy-network`), `worker` (1 replica). Volumes `pgdata`, `private-files`, `backups`, `restore-check`; nothing publishes a port; no data volume is served by the web router. |
| `infra/.env.production.example` | Every deployment input by name (`INSTALLATION_ID`, `APP_ORIGIN`, `SESSION_SECRET`, `POSTGRES_*`, `BACKUP_ENCRYPTION_KEY`, `BACKUP_TARGET`, retention, `TRUST_PROXY`). |
| `infra/postgres-init/10-restore-validation.sh` | Creates the isolated restore-validation database once at first PostgreSQL start. |
| `infra/scripts/check-env.ts` (`npm run env:check`) | Validates configuration (names, never values), production HTTPS/release/database-secret rules, all live/backup/offsite/restore-validation storage permissions, `pg_dump`/`pg_restore`, both database targets, schema state and installation identity. |
| `infra/scripts/release.ts` (`npm run release:prepare`) | Start/upgrade steps 1–4: validate, take a `PRE_UPGRADE` recovery set when data migrations are pending (detached when the pending migration itself creates `backup_runs`), apply migrations once under advisory lock `7190101`, refuse a schema that is ahead of the release. |
| `infra/scripts/backup.ts` (`npm run backup:create -- --kind MANUAL|PRE_UPGRADE|PRE_RESTORE`) | Operator backup with the same barrier, snapshot, encryption, offsite copy and retention as the scheduled worker run. |
| `infra/scripts/restore.ts` (`npm run backup:restore`) | Fixed restore procedure: `--mode validate` into an isolated target; `--mode live` requires the exact configured database/files targets and confirmation, creates a healthy `PRE_RESTORE` set before destruction (including a verified directory copy when that target is configured), and holds the shared maintenance lock throughout. Cross-installation sets are rejected unless `--allow-cross-installation`. |
| `infra/scripts/support-bundle.ts` (`npm run support:bundle`) | Redacted diagnostics JSON (versions, schema, queues, backups, restore validations, heartbeat, disk); refuses to write if any secret value would be included. |
| `apps/api/src/static.ts` | Same-origin serving of `apps/web/dist`: allowlist of enumerated files only, `index.html`/`sw.js`/manifest `no-cache`, `/assets/*` immutable, SPA fallback for navigations, `404` for `/api/*`, dotfiles and unlisted files, HTML CSP `default-src 'self'`. |
| `apps/api/src/modules/support/*` | `backup.ts` (BackupService), `restore.ts` (restoreArchive, RestoreValidationService), `tar.ts` (ustar), `archive-crypto.ts` (AES-256-GCM), `retention.ts` (D23 policy), `pg-tools.ts` (redacted `pg_dump`/`pg_restore` execution), `service.ts`/`routes.ts` (`/api/v1/support/*`), `worker.ts` (jobs). |
| `apps/worker/src/support.ts` | pg-boss queues `installation-support-v1` (minute sweep: heartbeat, requested backups, requested restore validations) and `installation-backups-v1` (`BACKUP_SCHEDULE`, Cairo). Startup obtains the maintenance lock before classifying abandoned RUNNING work as `FAILED/WORKER_RESTARTED` and removing only bounded `.partial`/`.dump.tmp` artifacts. |
| `packages/db/src/migrate.ts` + migration `0023_support_backups.sql` | Shared runner (`applyMigrations`, `schemaStatus`, `assertSchemaCurrent`) plus immutable installation-baseline validation; reserved capability `support.restore`; `backup_runs`, `restore_validations`, `worker_heartbeats`, `support_audit_events`. |
| `apps/web/src/features/support/*` | Bilingual `/support/operations` screen (status, backups, restore validation, audit search, account lookup with reset/block/release actions, child archival preview). |

## Recovery set format

`backup-<installation8>-<UTC timestamp>-<kind>-<run8>.tar.enc` = AES-256-GCM (`NBK1` magic, 12-byte IV, ciphertext, 16-byte
tag) over a POSIX ustar stream: `files/<namespace>/<uuid>.blob` for every private file (`child-documents`,
`expense-documents`, `report-exports`), `database.dump` (`pg_dump --format=custom --no-owner --no-privileges
--exclude-schema=pgboss --snapshot=<exported>`), then `manifest.json` (format `nursery-backup/1`, run ID, kind,
installation ID, release, schema version, timestamp, per-file and dump SHA-256/sizes). A plaintext sidecar
`<archive>.manifest.json` (same content plus archive SHA-256/bytes) allows listing without the key.

Consistency: the worker takes the exclusive file barrier (advisory lock `7190602`, held shared by every document/export
writer and remover inside its transaction), exports a snapshot, copies the files, releases the barrier, then dumps the
database from that snapshot — so every file referenced by dumped rows is in the archive. The pg-boss schema is excluded
(queues and schedules are recreated by the worker; billing occurrences and report/import operations are idempotent by
business keys). Overlap is prevented by advisory lock `7192301` and the single-`RUNNING` unique index; an overlapping
scheduled run is recorded `SKIPPED`/`OVERLAP`. Failures are recorded as fixed codes (`PG_DUMP_FAILED`, `FILES_FAILED`,
`ARCHIVE_FAILED`, `OFFSITE_FAILED`, `RETENTION_FAILED`, `CONFIG_MISSING`, `WORKER_RESTARTED`) — stderr is redacted in logs and never stored.

Retention (D23): scheduled sets keep the newest `BACKUP_RETENTION_DAILY` (7) plus the newest set of each of the next
`BACKUP_RETENTION_WEEKLY` (4) ISO weeks; manual/pre-upgrade/pre-restore sets keep the newest `BACKUP_RETENTION_MANUAL`
(4) per kind. Deletions apply locally and in the offsite directory and are recorded (`archive_deleted_at`).

Off-host copy: `BACKUP_TARGET=directory:<absolute path>` copies archive + sidecar (checksum verified) to a directory
mounted from remote storage; `none` means Dokploy Volume Backups (or another operator mechanism) ship the `backups`
volume. `local-development-only` is refused in production. No S3 client is bundled (D51).

## Restore procedure

Validation (any time, from the UI or CLI): the archive checksum is verified, decrypted and unpacked into a staging
directory; the GCM tag, manifest format, installation ID, per-file and dump checksums and schema compatibility
(`SCHEMA_AHEAD` when the archive is newer than the code) are checked; the isolated target database is reset (all user
schemas dropped), `pg_restore --exit-on-error` runs, forward migrations apply, snapshot-carried RUNNING support rows are
classified historical, every restored session is revoked, existing namespace contents are replaced completely, files
move into place and every `child_documents`/`expense_documents`/READY `report_exports` row is checked for an existing
file with the stored SHA-256. The report includes schema version, migrations applied, sessions revoked, file counts,
accounts, children, outstanding debt (sum of `installment_balances.remaining`), treasury balance (sum of
`treasury_movements.amount`), nursery name and license validity.

Live restore is an operator command only: after API and worker are stopped, `npm run backup:restore -- --archive <file> --mode live
--target-database-url <live url> --target-files-dir <live private dir> --confirm-database <exact database name>` after
which the command itself creates a healthy `PRE_RESTORE` set and refuses to continue if that run reports any backup, offsite-copy or retention error,
then holds the maintenance lock through restore. Follow with the verification steps in OPERATIONS.md.
Cross-installation archives are rejected unless `--allow-cross-installation` is passed deliberately.

## What was actually exercised (2026-09-15, disposable PostgreSQL 18.4 on 127.0.0.1:55421, Windows host)

Commands and results (no live nursery, no Docker on this host):

- `npm run test:recovery` (`vitest.recovery.config.ts`, single worker; whole-database tests remain excluded from the parallel integration config) — 3/3 on real disposable databases. A38 additionally proves populated target/schema reset and stale-file removal; successful live CLI restore with an automatically created/offsite-verified `PRE_RESTORE` set; restored snapshot RUNNING-row reconciliation; complete worker startup/heartbeat after restore; and rejection of a cryptographically valid set with one missing and one mismatched referenced file. A separate case restores a known 0022 set and applies only `0023_support_backups.sql`; retention remains covered. A focused A38 rerun also passed after the stale snapshot-row defect was fixed.
- `npm run test:integration` after the split — 32 files/183 tests passed (the stricter `BACKUP_TARGET` grammar had broken the spawned `auth-command` fixture until the test fixture's placeholder became `none`).
- `tests/integration/support.test.ts` — 1/1: prior support checks plus matching/mismatched installation startup checks and lock-aware interrupted-run recovery (live lock untouched; abandoned backup/restore rows become `FAILED/WORKER_RESTARTED`; bounded partial removed).
- `tests/integration/organization-migration.test.ts` — 6/6 including a Phase 22 → 0023 upgrade and rerun (24 recorded migrations, `support.restore` reserved).
- `tests/e2e/support.test.tsx --maxWorkers=1` — 2/2 (en, ar-EG) real HTTP/DOM: prior checks plus actual parent block/unblock, seat release/restore with a working fresh temporary credential, staff disable/reactivate, child archival and database-state assertions; axe clean. This exposed and fixed the shared frontend client's false failure on successful HTTP 204 licensing responses.
- Full DOM gate `node node_modules/vitest/vitest.mjs run --config vitest.e2e.config.ts --maxWorkers=1` — final 23 files/60 tests passed. The first attempt passed 59/60 and exposed an immediate `dialog[open]` assertion race in a pre-existing Phase22 Arabic network test; that file passed 4/4 alone, the test now waits for React's open effect, and the complete rerun passed.
- `npm run test:unit` — 31 files/118 tests, including new production configuration and HTTP 204 regressions plus the existing archive/static checks.
- Operator walkthrough (`scratchpad/ops-walkthrough.sh`, `step11.sh`; databases `nursery_ops_demo`, `nursery_ops_check`, `nursery_ops_up`): `env:check` pass; `release:prepare` fresh install applied 24 migrations, rerun applied 0; `auth:bootstrap` via private stdin; API start with `WEB_DIST_DIR` — `/` 200 `text/html` `no-cache` with the HTML CSP, `/sw.js` 200 `text/javascript` `no-cache`, `/manifest.webmanifest` 200, `/assets/*.js` `immutable`, `/administration/children` → shell, `/api/v1/nope` 404, `/.env` 404, "schema compatible" logged; worker start wrote `worker_heartbeats` and registered five Cairo schedules (`installation-backups-v1` `0 2 * * *`); `backup:create` `SUCCEEDED` with offsite copy; `backup:restore --mode validate` into `nursery_ops_check` report OK; live mode refused without confirmation; `support:bundle` written with 0 secret occurrences; upgrade from a 0000–0022 schema: detached `PRE_UPGRADE` set, 0023 applied, run recorded with offsite copy, rerun idempotent, a fake `0099_future.sql` row makes `release:prepare`, `env:check` and the API start refuse.

Additional remediation checks: `npm run env:check` passed with distinct reachable real database targets and all storage probes; a mismatched `INSTALLATION_ID` run exited 1 with the explicit refusal; `npm run release:prepare` passed on an initialized 0023 database with matching installation ID and applied 0 migrations; `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` passed. Compose YAML parsed and statically verified for four services, four volumes, digest-pinned PostgreSQL and no published ports.

Blocked / not possible here: `docker build`, `docker compose config`/`up` (the `docker` executable is absent; digest values were resolved from the registry, but the Dockerfile/runtime and Compose start remain unexecuted until a Docker/Dokploy host), graceful SIGTERM drain (Windows
does not deliver SIGTERM to Node handlers; the code path is exercised only by `app.close()` in tests), Traefik/TLS/SSE
proxy behaviour, off-host storage other than a local directory, and any measurement of VPS capacity.

Unchanged out-of-scope warning: `pg` reports that the pre-existing Phase05 `LicensingService.context` runs three queries concurrently on one transaction client (`apps/api/src/modules/licensing/service.ts:62-64`); a traced A38 rerun still passed. This must be serialized before a future pg 9 upgrade, but it is not a Phase23 recovery defect.

## Missing real deployment inputs (not invented)

Domain and Dokploy project, VPS capacity and measured resource limits, `INSTALLATION_ID`, `SESSION_SECRET`,
`POSTGRES_PASSWORD`, `BACKUP_ENCRYPTION_KEY` (and its off-server copy), the off-host destination (mount or Dokploy
Volume Backup S3 credentials), support contact text, initial Superadmin credential delivery, license validity/grace and
capacities, and the tech lead's deployment instruction. Live deployment and live restore are separate authorized
operator actions.
