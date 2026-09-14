# Phase 21 evidence — Excel templates, validation preview, and atomic import

Status: COMPLETE (2026-09-15). This document records the implemented contract and executed evidence.

## Templates and limits

| Kind | Template version | File name | Data sheets (stable header keys) |
|---|---|---|---|
| PARENTS_CHILDREN | 1 | `nursery-import-parents-children-v1.xlsx` | Parents(parent_key, username, full_name, mobile); Children(child_code, full_name, birth_date, branch_code, classroom_code, contact_name, contact_mobile, contact_relationship); Links(parent_key, child_code, relationship, can_read, can_finance, can_pickup, can_notify) |
| OPENING_BALANCES | 1 | `nursery-import-opening-balances-v1.xlsx` | Balances(child_code, category_code, amount_egp, description, issued_on, due_on) |
| EMPLOYEES | 1 | `nursery-import-employees-v1.xlsx` | Employees(employee_code, full_name, basic_salary_egp, effective_month, paying_branch_code, paying_account_code, login_username, role_name, branch_codes) |

Every template also carries a bilingual `Guide` sheet (column help, limits, no-password rule), a scope-filtered `Reference` sheet (permitted branches/classrooms, fee categories, treasury accounts, SYSTEM-assignable roles) and a `Template` marker sheet (`NURSERY_IMPORT`, kind, version). Header keys are the machine contract; a version changes whenever columns or semantics change, and a file with another version is rejected with `imports.templateVersion`. Code/key/username/mobile/name/month columns are text-formatted so leading zeros survive editing; Yes/No columns use range-level list validation only.

Limits (`IMPORT_LIMITS` in `packages/contracts/src/imports.ts`): 1 MiB file, 500 data rows per sheet, 500 characters per cell, 4 guardians and 10 children per linked family, 200 zip entries, 8 MiB per inflated entry, 24 MiB total inflated, preview validity 24 hours. Larger data is split into explicitly separate reviewed batches; nothing is truncated or half-accepted.

## Parsing and A37 defenses

`apps/api/src/modules/imports/zip-guard.ts` inflates every zip entry once under `zlib.inflateRawSync({ maxOutputLength })` and rejects forged central-directory sizes, zip64 markers, encrypted entries, absolute/parent paths, macro/external-link/embedded-object parts (`vbaProject`, `externalLinks`, `embeddings`, `activeX`, `*.bin`, `pivotCache`, `connections.xml`, `customXml`) and files without `xl/workbook.xml` before ExcelJS runs. `parse.ts` rejects formula cells (`FORMULA`), error/unknown cells (`UNSUPPORTED_CELL`), overlong text (`TOO_LONG`), formula-like text starting with `=`/`@` or `+`/`-` followed by a non-digit and any control/bidi-override character (shared `unsafeImportText`). Typed date cells become ISO dates; text dates accept `YYYY-MM-DD` or `dd/MM/yyyy`; EGP amounts must be exact with at most two decimals (`parseEgpToPiastres`). Uploads are bounded JSON/base64 (route body limit 4·⌈1 MiB/3⌉+4096) and require `imports.commit` before any byte is inspected.

## Validation, preview, and duplicate policy

`ImportService.validate` (`apps/api/src/modules/imports/service.ts`) recomputes every rule from current data on upload, on every `GET /api/v1/imports/:id`, and again inside the commit transaction:

- Required/format checks per column; codes uppercase `[A-Z0-9_-]{1,32}`; usernames through `usernameSchema`; mobiles through `mobileSchema`.
- In-file duplicates (`DUPLICATE`) on normalized parent keys, usernames, child codes, employee codes, link pairs and opening-balance rows (child+category+amount+due date+description, case-insensitive). Existing records (`EXISTS`) on usernames (any account kind), child codes, employee codes and previously imported opening debts (`obligations.source_reference like 'import/%'` with the same child, category, amount, description and due date).
- Reference checks (`UNKNOWN_REFERENCE`) for branches, classrooms (same branch), fee categories, treasury accounts (same paying branch), parent keys, child codes and role names; scope checks (`OUT_OF_SCOPE`) apply the same `requireRecord`/`requireChild` rules as the interactive screens, including CLASSROOM-mode actors needing an assigned classroom for every child.
- Every parent and child must appear in at least one link row (`UNLINKED`); linked families are connected components and are limited to 4 guardians / 10 children (`FAMILY_TOO_LARGE`) because each family commits through `onboardingInputSchema`.
- Seat summary per kind (capacity, reserved, required); insufficient or unconfigured/suspended license yields `CAPACITY`. Classroom capacity overflow is an advisory warning (`CAPACITY_EXCEEDED:<code>`), matching D32.
- Employees: `login_username` requires `users.manage_staff` (`NOT_PERMITTED` otherwise); `role_name`/`branch_codes` require a login and are honoured only for the SYSTEM actor, because only Superadmin initially scopes unassigned staff (ORGANIZATION_AND_POLICY); delegated admins receive `NOT_PERMITTED`.
- Cells the parser already rejected are not reported a second time as `REQUIRED`; `UNLINKED` is reported only when no link row mentions the key.

The preview hash (SHA-256 over template version, staged rows, errors, creation counts, seat summary, warnings, execution plan and the actor's scope revision/mode/branches/classrooms/capabilities/license status) is returned to the client. `POST /imports/:id/commit` requires `expectedPreviewHash`; any drift returns `STALE_VERSION imports.previewStale` after storing the refreshed preview, remaining errors return `VALIDATION_ERROR imports.revalidationFailed`, and expired previews return `imports.expired`.

## Atomic commit

Commit runs inside one transaction under shared license lock, exclusive policy lock (7190401, because employee logins may receive role assignments) and shared guardian-scope lock, then `FinancialCore.operation('IMPORT_COMMIT')` with the actor operation ID. Execution reuses the interactive services: `ChildService.onboardInTransaction` per family, `LedgerService.postInTransaction` per opening-debt row (single installment, `source_reference = import/<batchId>/<row>`, no receipt/treasury movement), `PayrollService.createProfileInTransaction` per employee (optional seat-reserving login through `LicensingService.provisionInTransaction`) and `OrganizationService.assignInTransaction` for SYSTEM role assignments. Sub-operation IDs are derived deterministically (`derivedOperationId(operationId, label)`) so the per-row idempotency rows required by `child_onboarding_operations`, `employee_profiles` and `salary_history` stay unique. Any failure rolls the whole batch back; the batch stays `PREVIEWED` and can be re-previewed or retried. A replay with the same operation returns the stored redacted result (`credentials: null`); `import_batches` moves to `COMMITTED` with the redacted result and is immutable from then on (trigger `import_batches_immutable`). `financial_audit_events` and `financial_operations` never store temporary passwords.

## Credential setup procedure

Templates never contain passwords. New parent or employee logins are provisioned by the identity/quota service with a random temporary password that is returned once in the commit response and rendered once in the browser (`imports.credentials`), never persisted, emailed or messaged. The operator delivers each password outside the app; the account must change it at first sign-in and the temporary credential expires after 24 hours (existing AUTH_DEFAULTS). A lost or expired temporary password needs the existing Superadmin reset (`POST /api/v1/auth/accounts/:id/reset-password`); the batch status page shows only counts.

## Routes and UI

`GET /api/v1/imports/options` (kinds with enabled state, limits, creator's recent batches), `GET /api/v1/imports/templates/:kind` (attachment), `POST /api/v1/imports` (upload + preview, 201), `GET /api/v1/imports/:id` (creator-only refreshed preview or committed result), `POST /api/v1/imports/:id/commit`. Kind availability: PARENTS_CHILDREN needs `children.manage`+`guardians.manage`+`users.create_parent`; OPENING_BALANCES needs FINANCE enabled and `billing.manage`; EMPLOYEES needs FINANCE+PAYROLL enabled, `payroll.manage`, `finance.read` and branch-wide scope. All routes require the new delegable `imports.commit` capability (migration `0022_imports.sql`). The bilingual page `/administration/imports` (`apps/web/src/features/imports/screen.tsx`) downloads templates, uploads files, shows row counts/creations/seat usage/warnings/row errors/reviewed rows, commits with a frozen operation ID, resolves uncertain outcomes from batch status before retrying, shows credentials once, and lists recent batches. The open batch renders independently of the options record so a background refresh never unmounts a preview or the one-time credential result (a defect found and fixed by the DOM test).

## Migration

`0022_imports.sql` adds capability `imports.commit`, table `import_batches` (creator, kind, template version, file name, sha256, status, staged JSON, row count, preview/hash, expiry, committed operation FK to `financial_operations`, immutability trigger) and index `obligations_import_source`. The fresh path and the actual Phase20 schema upgrade/rerun are covered by `tests/integration/organization-migration.test.ts` (phases 3/5/18/19/20 now apply through 0022).

## Verification

Runtime: disposable PostgreSQL 18.4 UTF8 cluster `C:/Users/jo/AppData/Local/Temp/nursery-phase19-pg-utf8` restarted with `pg_ctl -D <cluster> -o "-p 55421 -h 127.0.0.1" -l <cluster>/phase21.log start`; `DATABASE_URL=postgresql://jo@127.0.0.1:55421/postgres`; each fixture creates and drops an isolated schema. No live nursery database, deployment, browser automation or subagent was used. Host Node 25.2.1/npm 11.6.2 differ from the pinned 24.19.0/11.1.0.

| Command | Result |
|---|---|
| `node node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts tests/integration/imports.test.ts tests/integration/organization-migration.test.ts --maxWorkers=1` | 2 files / 12 tests passed (54.55s): templates/scope/options; A03/A04 sibling+shared-child links, replay redaction, concurrent final-slot race (exactly one commit, no orphan child/account, loser re-previews to CAPACITY); A29 2,500 EGP debt only (outstanding 250000, cash unchanged, no receipt, CASH_RESULT 0, duplicate re-import EXISTS, replay); A30 quota/scope/data drift → STALE_VERSION/revalidation, no duplicates, template-version drift; A37 formula cells/formula-like text, oversize, non-zip, forged sizes, macro part, foreign batch, delegated role NOT_PERMITTED, unknown role, out-of-scope branch, login without `users.manage_staff`; employee profiles/salaries/login seat/SYSTEM assignment/roster; validation rules (UNLINKED, DUPLICATE, UNKNOWN_REFERENCE, INVALID booleans, FAMILY_TOO_LARGE, TOO_MANY_ROWS, MISSING_SHEET, HEADER_MISMATCH, classroom scope, capacity warning, expiry, immutability trigger, FINANCE-disabled gating); Phase 3/5/18/19/20 schema upgrades through 0022 and idempotent rerun. `reconcileFinance` clean in every financial scenario. |
| `node node_modules/vitest/vitest.mjs run --config vitest.e2e.config.ts tests/e2e/imports.test.tsx --maxWorkers=1` | 1 file / 3 tests passed (21.78s): English and Egyptian Arabic real-HTTP/DOM flow (template attachment, browser file upload, bilingual row errors, disabled commit, successful commit, one-time credentials, working temporary login, dismissal, redacted reopen, unsupported file, RTL, axe clean); page/endpoints unavailable without `imports.commit`. |
| Regression `tests/integration/{children,organization,payroll,finance,billing,licensing}.test.ts --maxWorkers=1` | 6 files / 63 tests passed (119.20s) after the onboarding/ledger/payroll/assignment in-transaction refactors. |
| Regression `tests/e2e/{children,organization,payroll,billing}.test.tsx --maxWorkers=1` | 4 files / 12 tests passed (97.56s). |
| `npm run test:unit` | 24 files / 73 tests passed (5.60s), including `packages/contracts/src/imports.unit.test.ts` (exact EGP parsing, bilingual booleans, dates/months, formula-like text, strict inputs) and `apps/web/src/features/imports/copy.unit.test.ts` (complete Arabic copy for UI, columns, errors, kinds). |
| `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check` | All exit 0 (existing Vite chunk-size warning only). |
| `npm run test:integration -- --maxWorkers=1` (full suite) | 31 files / 181 tests passed (679.92s). A whitespace-only brace cleanup of the four refactored services landed after this run started; the final source was re-verified with imports/children/payroll/organization 38/38 plus typecheck/lint/build/diff-check exit 0. |

Earlier failures corrected during the phase (not shipped): cascaded `UNLINKED`/`REQUIRED` errors hid the real cause; per-cell data validation in templates made appended rows start at row 502; the batch card unmounted during options refresh (lost click and would have lost credentials); the batch refresh overwrote displayed credentials with the redacted stored result; raw control characters written into test sources were replaced with escape sequences.

## Limitations

Expired `PREVIEWED` batches remain as bounded rows (no cleanup job); committed batches are retained as immutable evidence. Preview rows are capped at 1,500 and errors at 500 entries in the response. Workbook parsing runs inside the upload transaction under shared locks (bounded by the 1 MiB/24 MiB caps). Temporary passwords follow the existing 24-hour identity rule, so large batches must be delivered promptly or reset by Superadmin. No arbitrary table import/export, payment-history reconstruction, existing-guardian linking by username, or partial batch acceptance is provided. No live deployment, performance, or manual visual verification is claimed.
