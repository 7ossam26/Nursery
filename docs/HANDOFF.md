# Current handoff

Updated: 2026-09-15 — Phase21 implemented; final evidence recorded in [IMPORTS.md](IMPORTS.md) and PROJECT_STATE.md.

## Phase21 summary and precise files

Excel templates, validation preview and atomic import (R16/U21, D49). Detailed contract, limits, duplicate policy, credential procedure, routes and evidence: [IMPORTS.md](IMPORTS.md).

- `packages/contracts/src/imports.ts`, `import-copy.ts`, `imports.unit.test.ts`, `index.ts`, `organization.ts` (`imports.commit` capability key): kinds, template versions/columns, `IMPORT_LIMITS`, strict upload/commit inputs, preview/batch/result types, exact EGP/boolean/date/month parsers, shared bilingual column/error/kind help.
- `packages/db/src/migrations/0022_imports.sql`: `imports.commit` capability, creator-private `import_batches` (immutable once committed, commit FK to `financial_operations`), `obligations_import_source` index.
- `apps/api/src/modules/imports/{zip-guard,parse,templates,service,routes}.ts`, `apps/api/src/app.ts`: bounded zip inspection, guarded ExcelJS parsing, scope-filtered versioned templates, staged validation with preview hash, one atomic `IMPORT_COMMIT` operation; `/api/v1/imports/{options,templates/:kind,:id,:id/commit}` and `POST /api/v1/imports`.
- Narrow in-transaction refactors reused by the import: `ChildService.onboardInTransaction`, `LedgerService.postInTransaction`, `PayrollService.createProfileInTransaction`, `OrganizationService.assignInTransaction` (+ public `assignable`). Interactive behavior and lock semantics unchanged.
- `apps/web/src/features/imports/{screen,copy,copy.unit.test}.ts(x)`, `App.tsx` (`/administration/imports`), `auth/screens.tsx` (navigation), `auth/client.ts` (`downloadFile`), `i18n/catalogs.ts`: bilingual template download, upload/preview, row errors, frozen-operation commit with status recovery, one-time credentials, recent batches.
- Tests: `tests/helpers/imports.ts`, `tests/integration/imports.test.ts` (7), `tests/integration/organization-migration.test.ts` (Phase20→0022 case added), `tests/e2e/imports.test.tsx` (3).
- Docs: DECISIONS D49, API_AND_DATA_CONTRACTS (Imports), ACCESS_AND_LICENSING, FINANCE_RULES F06, TESTING_AND_ACCEPTANCE, IMPORTS.md, PROJECT_STATE.

Template versions: all v1. Maximum batch: 1 MiB file, 500 data rows per sheet, 500 chars per cell, 4 guardians/10 children per linked family, 24-hour preview. Duplicate policy: normalized in-file duplicates and existing usernames/child codes/employee codes/previously imported opening debts are row errors. Credential setup: temporary passwords appear once in the commit response only; delivery is outside the app; expired/lost ones use the existing Superadmin reset.

## Actual commands/results

Disposable PostgreSQL18.4 UTF8 cluster `C:/Users/jo/AppData/Local/Temp/nursery-phase19-pg-utf8`, started with `pg_ctl -D <cluster> -o "-p 55421 -h 127.0.0.1" -l <cluster>/phase21.log start`; `DATABASE_URL=postgresql://jo@127.0.0.1:55421/postgres`. No live nursery database, deployment, browser automation or subagent.

    $env:DATABASE_URL='postgresql://jo@127.0.0.1:55421/postgres'
    node node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts tests/integration/imports.test.ts tests/integration/organization-migration.test.ts --maxWorkers=1
    node node_modules/vitest/vitest.mjs run --config vitest.e2e.config.ts tests/e2e/imports.test.tsx --maxWorkers=1
    node node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts tests/integration/children.test.ts tests/integration/organization.test.ts tests/integration/payroll.test.ts tests/integration/finance.test.ts tests/integration/billing.test.ts tests/integration/licensing.test.ts --maxWorkers=1
    node node_modules/vitest/vitest.mjs run --config vitest.e2e.config.ts tests/e2e/children.test.tsx tests/e2e/organization.test.tsx tests/e2e/payroll.test.tsx tests/e2e/billing.test.tsx --maxWorkers=1
    npm run test:unit; npm run typecheck; npm run lint; npm run build; git diff --check

Results: imports+migration 12/12 (54.55s); imports HTTP/DOM 3/3 (21.78s); regression integration 63/63 (119.20s); regression DOM 12/12 (97.56s); units 24 files/73 tests; typecheck/lint/build/diff-check exit 0 (existing Vite chunk warning). Full `npm run test:integration -- --maxWorkers=1`: 31 files/181 tests passed in 679.92s; final focused re-run on the final source (imports/children/payroll/organization) 38/38 with typecheck/lint/build/diff-check exit 0. Defects found and fixed during the phase are listed in IMPORTS.md; none were skipped.

## Remaining limitations and unchanged work

Expired previews are retained as bounded rows (no cleanup job). Preview rows/errors are capped at 1,500/500 in responses. Parsing runs inside the upload transaction under shared locks (bounded by file caps). Temporary passwords follow the existing 24-hour rule. No existing-guardian linking by username, arbitrary table import/export, payment-history reconstruction or partial batch success. Host Node25.2.1/npm11.6.2 differs from pins24.19.0/11.1.0; no pinned-runtime certification, performance, manual mobile/screenshot or live deployment check is claimed. Unresolved Phase12 screenshot handoff is unchanged.

## Next executable action

Phase21 is COMPLETE. The disposable cluster on 55421 was left running for optional inspection; stop it with `pg_ctl -D C:/Users/jo/AppData/Local/Temp/nursery-phase19-pg-utf8 stop`. Do not begin Phase22 unless explicitly requested.
