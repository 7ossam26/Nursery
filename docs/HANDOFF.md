# Current handoff

Updated: 2026-09-15 — Phase23 forensic remediation complete for every feasible item; Docker/Dokploy-only execution remains BLOCKED because Docker is absent. Package, procedures and detailed evidence: [DEPLOYMENT_AND_BACKUP.md](DEPLOYMENT_AND_BACKUP.md); runbook: [OPERATIONS.md](OPERATIONS.md); defaults: D51.

## Phase23 summary and precise files

Dokploy deployment assets, backup, restore and support (R01/R16, D23/D51). Migration `0023_support_backups.sql` (schema now at 0023).

- Infra: `infra/Dockerfile` now uses registry-verified multi-platform digests for Node 24.19.0 (`sha256:a9f5…29df`) and PostgreSQL 18.4 (`sha256:8822…a382`); the PostgreSQL runtime supplies exact client tools and receives the Node binary. Compose pins PostgreSQL by digest. `check-env` probes validation storage/database and installation identity; `release` does the same identity check. The live restore CLI requires the configured targets, automatically creates a healthy `PRE_RESTORE` set, and holds lock `7192301` through destruction.
- Runtime: `apps/api/src/config.ts` adds production HTTPS, immutable release label and strong PostgreSQL credential validation. API and worker pass `INSTALLATION_ID` into startup checks. `apps/api/src/modules/support/worker.ts` provides lock-aware crash reconciliation and bounded partial cleanup; `apps/worker/src/support.ts` invokes it before queue work. `restore.ts` completely replaces file namespaces and reconciles snapshot-carried RUNNING rows. The shared web `AuthClient` now handles successful 204 licensing actions correctly.
- Database: `packages/db/src/migrate.ts` now exposes/checks the single installation baseline in addition to schema compatibility. Migration remains `0023_support_backups.sql`; no new migration was needed.
- Support module `apps/api/src/modules/support/`: `tar.ts`, `archive-crypto.ts`, `retention.ts`, `pg-tools.ts`, `backup.ts` (BackupService incl. detached pre-upgrade mode), `restore.ts` (restoreArchive, RestoreValidationService), `service.ts`, `routes.ts` (`/api/v1/support/*`), `worker.ts` (createSupportJobs), `backup-primitives.unit.test.ts`; `apps/api/src/static.unit.test.ts`. Shared file barrier: `FILE_LOCK` exported from `children/private-store.ts` and now also held by report export writes/cleanup (`reports/service.ts`); `children/documents.ts` and `finance/expense-documents.ts` import it.
- Contracts: `packages/contracts/src/support.ts` (schemas/types), `organization.ts` (+`support.restore`), `index.ts` export.
- Web: `apps/web/src/features/support/{copy,screen}.tsx` (`/support/operations`), `App.tsx` route, `layout/navigation.ts` (`nav.operations` item under the support group), `i18n/catalogs.ts` (support copy, `nav.operations`).
- Tests: recovery now covers populated reset/stale files, live CLI pre-restore enforcement, restored worker start, missing/mismatched references and 0022→0023 restore; support integration covers identity mismatch and crash recovery; bilingual support DOM executes every lifecycle action. Added production-config and 204-client units. `network-recovery.test.tsx` received a test-only `waitFor` around React's dialog-open effect after the full gate exposed its immediate assertion race.
- Docs: DECISIONS D51 (+D23 note), OPERATIONS runbook, DEPLOYMENT_AND_BACKUP.md (new), TESTING_AND_ACCEPTANCE (Phase23 evidence), ACCESS_AND_LICENSING (support capabilities), README (commands, deployment pointer), PROJECT_STATE.

## Actual commands/results

Disposable PostgreSQL18.4 UTF8 cluster `C:/Users/jo/AppData/Local/Temp/nursery-phase19-pg-utf8` on 127.0.0.1:55421 (`DATABASE_URL=postgresql://jo@127.0.0.1:55421/postgres`; `alter system set max_locks_per_transaction=512` applied for the final runs). No live nursery, deployment, Docker, browser automation or subagent.

    $env:DATABASE_URL='postgresql://jo@127.0.0.1:55421/postgres'
    npm run test:recovery                                   # 1 file / 3 tests
    node node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts   # 32 files / 183 tests
    node node_modules/vitest/vitest.mjs run --config vitest.e2e.config.ts tests/e2e/support.test.tsx --maxWorkers=1   # 2/2
    node node_modules/vitest/vitest.mjs run --config vitest.e2e.config.ts --maxWorkers=1   # final 23 files / 60 tests
    npm run test:unit   # 31 files / 118 tests
    npm run typecheck; npm run lint; npm run build; git diff --check   # exit 0 (existing Vite chunk warning only)
    npm run env:check                                        # passed; live + validation DB reachable, all storage writable
    npm run release:prepare                                  # matching initialized 0023 target, applied 0

New defects found and fixed during forensic remediation: startup did not bind an existing database to `INSTALLATION_ID`; worker crashes left permanent RUNNING rows; live restore did not itself create/validate `PRE_RESTORE` or hold the run lock; live file restore retained stale blobs; a restored dump carried its own RUNNING backup row; successful 204 support actions displayed false network failures; older-schema restore, post-restore worker start, populated targets and valid-archive reference failures lacked coverage. The first full DOM run passed 59/60 but exposed a pre-existing immediate dialog-open timing race; the focused file passed 4/4, the assertion was made effect-aware, and the final full run passed 60/60.

## Remaining limitations and unchanged work

BLOCKED: `docker build`, `docker compose config` and `docker compose up` cannot run because the `docker` executable is absent. Compose YAML parsed successfully and static assertions verified four expected services/volumes, the digest and no published ports, but actual image construction, entrypoint/tool execution and Dokploy/Traefik TLS/SSE remain unverified until a Docker host exists. SIGTERM drain remains unexercised because Windows does not deliver it to these Node handlers. No live deployment/restore was performed. Off-host directory-copy behavior is real-tested; actual remote storage, secrets/domain, resource capacity and Dokploy Volume Backups remain real deployment inputs. A non-failing `pg` deprecation was traced to pre-existing Phase05 `LicensingService.context` concurrent queries on one transaction client; serialize before pg 9, outside Phase23. Host Node25.2.1/npm11.6.2 differ from pins. Unresolved Phase12 screenshot handoff is unchanged.

## Next executable action

Phase23 is COMPLETE for all feasible local work; Docker-host execution is explicitly BLOCKED, not assumed. The disposable cluster on 55421 remains running. Next phase: 24 — Cross-module verification and release fixes; do not begin automatically. Live deployment remains a separate authorized operator action.
