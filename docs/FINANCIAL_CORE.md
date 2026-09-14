# Phase 13 financial core

2026-09-14 — COMPLETE. Phase 13 acceptance gate satisfied; Phase 14 not started.

## Prerequisite evidence and environment

Initial `git status --short` and `git diff --stat` were empty. Actual Phase 12 modules, migrations and tests exist. Its screenshot handoff remains unresolved; explicit Phase 13 request permits technical progression (D39), without marking Phase 12 complete or permitting browser automation.

Recorded Phase 12 temporary Node/PostgreSQL paths did not exist. Current machine supplies Node 24.19.0/npm 11.1.0 and PostgreSQL 17.9. Created disposable `%TEMP%/nursery-phase13-pg`, loopback 55413, database nursery_test. No system service changes. Initial prerequisite suite could not load missing `sharp`; `npm ci --ignore-scripts` restored the lockfile's dependencies (340 packages, 0 vulnerabilities). `DATABASE_URL=postgresql://postgres@127.0.0.1:55413/nursery_test npm run test:integration -- tests/integration/communication.test.ts --maxWorkers=1` then passed 9/9, 16.77s. Existing pg concurrent-query deprecation warning observed. PostgreSQL 18 target has not been verified on this machine.

## Checkpoints

1. Prerequisites verified; exact string amount contracts and migration 0011 authored.
2. Core services implemented: financial operations, immutable account openings/default mappings, obligations/installments, explicit grouped receipts/allocations, credit receipt/application, canonical reads and scoped receipt print DTO. API and bilingual treasury screen wired.
3. Final financial/reconciliation/race/rollback suites, bilingual script DOM/HTTP, migration upgrade/rerun, type/lint/build and diff checks passed. Gate satisfied; stopped at Phase 13.

## Transaction and service contract

Every public mutation runs inside `ChildService.withPolicy`: shared license, policy, guardian-scope locks; sorted actor accounts and session row; actor-scoped financial operation advisory lock; sorted children; sorted obligations; sorted installments; credits; sorted treasury accounts. Account creation/default configuration locks its branch before accounts and does not acquire children. License/policy mutations use the established exclusive advisory locks. All work is one PostgreSQL transaction; receipts/audits reference the durable operation using deferred foreign keys. No partial success is exposed. Actor/key payload hash includes action and recursively canonicalized payload. Replays revalidate current capability/module and historical resource scopes, then return durable IDs. Operation status is actor-only and scope checked, with COMMITTED/NOT_FOUND; NOT_FOUND does not prove an in-flight request failed, so clients retry only the same key/payload.

`LedgerService.createObligation` stores issued child/category/placement snapshots and subordinate installments whose sum equals the obligation. BUS accepts one due item, settled fully. Unique child/sourceReference prevents duplicate source debt. `PaymentService.collect` requires exact group totals, no duplicate due IDs, one declared destination/method per branch and all scopes. `receiveCredit` explicitly confirms a child credit receipt; `applyCredit` locks credit and due balances and posts no cash. Cross-branch credit application is unavailable until explicit transfer/refund funding rules exist. `TreasuryService.postReceiptInTransaction` is an internal source-specific adapter; it derives amount/account from the receipt, never caller-submitted arbitrary movements. No settled edit/delete endpoint exists. Sensitive correction authorization remains the existing `requireSensitiveCorrection` capability + Superadmin grant + scope helper; Phase 16 owns correction workflows.

Canonical formula: due remaining = installment base + signed obligation adjustments - signed receipt allocations - signed credit allocations. Obligation remaining sums its due rows; base obligation and installments are never both added. Credit available = credit amount - signed credit allocations. Treasury balance = sum of every posted signed movement including exactly one explicit opening. Aggregates use PostgreSQL numeric/string results; individual entries use BIGINT/string contracts. No writable paid total/balance exists.

Receipt reference: installation-local `FIN-` plus minimum twelve decimal sequence digits, gaps allowed on rollback. Receipt DTO has date, branch/account codes, method, payer/external reference, exact amount and immutable child/category lines. Audit timestamps and operator internals are excluded. Group operation returns receipt IDs, while individually scoped receipt endpoints never reveal inaccessible sibling branch receipts. Classroom readers may only access receipts whose every line is within their historical classroom scope; guardians need current read + finance links to every line. Branch treasury totals/movements require branch-level scope. Disabled finance blocks mutations and guardian data, retaining authorized staff history.

Migration 0011 adds financial tables, immutable triggers, source-leg uniqueness, deferred operation FKs, balance views and four capability keys without granting existing roles. No historical debt/account/opening migration is inferred. A branch's first configured treasury must be CASH and receives a required explicit signed opening (zero permitted); that account becomes default. Future branches configure through the same action. Branch mapping uses expectedVersion with audit; account identities/openings stay immutable.

Financial event rows are a private durable receipt/child producer boundary. Parent notification dispatch and collection UI belong to Phase 15. No recurring billing, expense/refund/closing, debt transfer, payroll, imports, deployment, screenshot, or browser automation added.

## Minimum API and authorization

All paths start with `/api/v1`; normal session/cookie/CSRF protections apply. Only declared actions are available; there is no generic money-row patch/delete endpoint.

| Path | Action / policy |
|---|---|
| `GET /finance/options`, `GET /finance/accounts` | Branch-scoped configuration and exact treasury balances; finance.read and branch scope |
| `POST /finance/accounts` | Explicit dated opening and immutable account identity; treasury.manage and branch scope |
| `POST /finance/branches/:id/default-account` | Existing same-branch CASH account; treasury.manage, operation ID and expectedVersion |
| `GET /finance/accounts/:id/movements` | Signed source movements; finance.read and branch scope |
| `GET /finance/categories`, `POST /finance/categories` | Shared catalog; finance.read / explicit billing.manage capability |
| `POST /finance/obligations` | One dated child obligation and exact due schedule; billing.manage and child branch/classroom scope |
| `GET /finance/balances`, `GET /finance/children/:id/balances` | Scoped aggregate + due rows; finance.read, or current guardian read AND finance links for the specific child |
| `POST /payments` | Atomic explicit branch groups; payments.record and every due-line scope |
| `POST /finance/credit-receipts` | Explicitly confirmed credit and actual receipt/cash; payments.record and child scope |
| `POST /finance/credit-applications` | Spend available same-child/same-branch credit, with no cash; payments.record and due scopes |
| `GET /finance/receipts`, `GET /finance/receipts/:id` | Filtered list / receipt print-data contract; finance.read and every line scope; individual guardian reads additionally require every current read/finance link |
| `GET /finance/operations/:id` | Actor's own durable status and IDs; finance.read and every original resource scope |

Pages are bounded at 50; options/catalog at 100; collection at 20 branches and 100 allocations per branch, schedules at 120 installments. A branch group's declared amount must equal its allocations exactly, and its method must equal its account type. No unallocated remainder is silently turned into credit. Account balance never adds an opening column to the opening movement. JSON receipt lines store exact strings and frozen child/category identifiers/names for later print/rendering; no PDF/receipt-print UI is claimed.

## Changed files

- `packages/contracts/src/finance.ts`, `finance.unit.test.ts`, `index.ts`, `organization.ts`; `packages/domain/src/money.ts`, `index.ts`.
- `packages/db/src/migrations/0011_financial_core.sql`.
- `apps/api/src/modules/finance/{core,ledger,payments,treasury,routes}.ts`, `apps/api/src/app.ts`.
- `apps/web/src/features/finance/{screen.tsx,copy.ts}`, `apps/web/src/App.tsx`, `features/auth/screens.tsx`, `i18n/catalogs.ts`.
- `tests/helpers/finance.ts`, `tests/integration/finance.test.ts`, `tests/integration/organization-migration.test.ts`, `tests/e2e/finance.test.tsx`.
- `docs/DECISIONS.md` D39, `API_AND_DATA_CONTRACTS.md`, this evidence file, `PROJECT_STATE.md`, `HANDOFF.md`.

## Verification history

All integration/e2e commands use the disposable database URL above. No mocks/SQLite or browser automation used.

- `npm run test:integration -- tests/integration/communication.test.ts --maxWorkers=1`: prerequisite 9/9 passed, 16.77s after restoring dependencies.
- First `npm run test:integration -- tests/integration/finance.test.ts --maxWorkers=1`: 12/14 passed. Fixed two fixture assertions: guardian defaults intentionally omit finance permission; unauthenticated writes receive CSRF rejection before auth. No policy was weakened.
- `npm run test:integration -- tests/integration/finance.test.ts tests/integration/organization-migration.test.ts --maxWorkers=1`: 16/16 passed, 18.08s. Upgrade from Phase 03/05 preserves identities/reservations/edited roles, migration count now 12, rerun applies nothing.
- Expanded `npm run test:integration -- tests/integration/finance.test.ts --maxWorkers=1`: 16/16 passed, 15.90s. Includes observable PostgreSQL lock wait, reversed allocation-order collectors, second-branch failure after first receipt/movement, revoked replay/status, explicit credit contention, immutable history and reconciliation after every scenario.
- `npm run test:unit -- packages/contracts/src/finance.unit.test.ts packages/domain/src/display.unit.test.ts apps/web/src/i18n/catalogs.unit.test.ts --maxWorkers=1`: 7/7 passed, 556ms.
- `npm run test:e2e -- tests/e2e/finance.test.tsx --maxWorkers=1`: final 2/2 passed, 9.67s, after internal posting guard. Real TCP connection destroyed in onSend after commit for both account and receipt; status/retry returns the original operation. Bilingual forms, inherited fieldset disable, exact opening/default, no duplicate movement, RTL/LTR and axe (without color-contrast, which jsdom cannot measure) passed; no server 5xx. Initial assertion checked button.disabled instead of the disabling fieldset; corrected without production policy changes.
- `npm run db:migrate` then same command again: fresh 0000–0011 applied, rerun applied nothing.
- `npm run typecheck`, `npm run lint`, `npm run build`: passed after source guard refinement. Main bundle 601.03 kB / 167.16 kB gzip; existing >500 kB warning remains. Final UUID-normalization rerun of typecheck/lint/build also passed: main bundle 601.02 kB / 167.14 kB gzip.
- `git diff --check`: passed after removing an extra state-file trailing blank line. Repository CRLF normalization notices are informational.

Remaining limitations: PostgreSQL 18 production target unverified here (real checks used 17.9); physical phone layout/screenshots not run; pre-existing Phase 12 screenshot handoff and older auth DOM timing issue remain separate open items. The financial event source is durable but delivery belongs to Phase 15. Source reversal/adjustment schema reserves correction history; no correction/refund/closing action is exposed before Phase 16. Account identity edits/retirement and cross-branch credit funding are not silently invented. No live deployment or performance-target claim.

Final check after UUID case normalization: `npm run test:integration -- tests/integration/finance.test.ts --maxWorkers=1` passed 16/16, 19.53s, including uppercase IDs on the loss/retry path; `npm run test:unit -- packages/contracts/src/finance.unit.test.ts --maxWorkers=1` passed 1/1, 236ms. All Phase 13 acceptance checks are satisfied. Stop here; Phase 14 requires a separate request.
