# Current handoff

Updated: 2026-09-14 — Phase 13 COMPLETE. Stop at this gate; Phase 14 NOT STARTED.

## Next executable action

On a separate Phase 14 request, read AGENTS.md, state, this handoff and its phase file before editing. Reuse financial contracts/services/views/factories below. Do not run recurrence, full collection UI, expense/refund/closing, debt transfer, payroll, imports or deployment as continuation of Phase 13.

Phase 12's screenshot handoff remains unresolved, and its ledger row remains IN PROGRESS. User explicitly requested Phase 13; D39 records technical progression without claiming screenshots, manual phone review or browser authorization. Phase 12 implementation evidence remains in PARENT_HUB_AND_NOTIFICATIONS.md. Older authentication DOM timing failure and communication pg concurrent-query deprecation warning were not investigated in this phase.

## Delivered files and contracts

- packages/contracts/src/finance.ts, finance.unit.test.ts, organization.ts, index.ts; packages/domain/src/money.ts, index.ts: strict normalized UUID and canonical string piastres, exact EGP parser/equal split, four explicit capability keys without role grants.
- packages/db/src/migrations/0011_financial_core.sql: accounts/default mapping, shared fee categories, obligations/installments, receipts/allocations, credits/applications, signed adjustment boundary, immutable source movements, operation/audit/event records, canonical balance views. No fabricated cash or history mutation.
- apps/api/src/modules/finance/{core,ledger,payments,treasury,routes}.ts and apps/api/src/app.ts: scoped atomic public entry points and minimum APIs. FinancialCore.operation owns durable actor/key/action/payload hashing and current module/capability/resource checks. LedgerService owns schedule/remaining rules. PaymentService.collect/receiveCredit/applyCredit owns settlement. TreasuryService.createAccount/setDefault/postReceiptInTransaction owns explicit openings/defaults/source-derived cash. Internal posting rejects missing receipts and checks every line scope.
- apps/web/src/features/finance/{screen.tsx,copy.ts}, App.tsx, features/auth/screens.tsx, i18n/catalogs.ts: bilingual /administration/treasury; existing components/auth/scoped refresh reused. Exact opening entry, actual CASH/BANK/WALLET destinations and versioned cash default. Uncertain outcomes retain the same request in memory, freeze edits, check actor operation status, and retry that same payload/key only.
- tests/helpers/finance.ts, tests/integration/finance.test.ts, tests/integration/organization-migration.test.ts, tests/e2e/finance.test.tsx: reusable real PG factories/reconciliation, races/rollback/scopes/immutability, upgrade/rerun and real HTTP/DOM loss recovery.
- docs/FINANCIAL_CORE.md contains complete APIs, field semantics, changed files, defaults, limitations and verification history. API_AND_DATA_CONTRACTS.md, DECISIONS.md D39 and state updated.

## Lock, money and receipt rules

Reuse ChildService.withPolicy for shared license/policy/guardian-scope locks, sorted actor accounts and session row. Financial mutation order: actor/key advisory lock; sorted children; sorted obligations; sorted installments; credit rows; sorted treasury accounts. Account configuration locks branch before account and never takes child locks. Reads/aggregates use the same branch/classroom predicates. Branch-wide cash requires branch mode; classroom users may read only receipts whose every line is in scope; guardians require current read AND finance permission for every included child.

Remaining = due base + signed adjustments - receipt allocations - applied credit; obligation remaining sums due rows, never base plus due rows. Available credit = credit amount - its applications. Cash = all signed posted movements including exactly one opening and each original/reversal once. Individual entries BIGINT/canonical JSON strings; aggregate SQL numeric converted to strings. No writable paid_total/balance or mutable settled history.

Receipt reference FIN- + minimum twelve-digit installation-local sequence; rollback gaps allowed. Immutable receipt print DTO includes branch/account codes, business date, payer/external reference, actual method, exact amount and child/category identifying lines; technical audit times excluded. One grouped operation creates one receipt per declared branch, all committed together. Same-key retry returns saved IDs after current authorization, differing payload conflicts. Actor operation status yields COMMITTED/NOT_FOUND; NOT_FOUND may mean an in-flight request, so reuse the same key. Charge creation never posts cash; explicit credit receipt posts actual cash; application posts none. BUS settlement is full remaining only.

Sensitive correction helper remains capability + Superadmin grant + scope; no correction/refund/closing action exposed (Phase 16). Financial receipt events are durable private producer rows; recipient delivery/full collection UI are Phase 15. Recurring agreements are Phase 14. No later-phase work implemented.

## Runtime and exact verification

Initial diff clean. Prior temporary Phase 12 runtimes were missing. Current Node 24.19.0/npm 11.1.0; npm ci --ignore-scripts restored lockfile dependencies (340 packages, 0 vulnerabilities); no lockfile changes. Disposable real PostgreSQL 17.9 cluster %TEMP%/nursery-phase13-pg, loopback 55413, database nursery_test, STOPPED with pg_ctl -m fast -w stop after checks. PostgreSQL 18 production target unverified here. No system services/.env/live nursery/deployment/subagents/model changes.

Database-dependent commands use DATABASE_URL=postgresql://postgres@127.0.0.1:55413/nursery_test.

- npm run test:integration -- tests/integration/communication.test.ts --maxWorkers=1: prerequisite 9/9 passed, 16.77s. Initial attempt failed loading missing sharp before dependency restore; no test passed in that initial attempt.
- npm run test:integration -- tests/integration/finance.test.ts tests/integration/organization-migration.test.ts --maxWorkers=1: 16/16 passed, 18.08s before two additional financial scenarios. Two migration upgrade/rerun checks preserve identities, reservations and edited roles; no automatic grants.
- FINAL npm run test:integration -- tests/integration/finance.test.ts --maxWorkers=1: 16/16 passed, 19.53s. A14/A16/A18/A19/A20/A01, distinct collectors and credit spenders, observed pg lock wait, second-branch atomic rollback, three failure points, durable same-key replay/uppercase UUID normalization, revoked scope, module/guardian privacy, sensitive grant requirement, immutable records, reconciliation after every case.
- npm run test:unit -- packages/contracts/src/finance.unit.test.ts packages/domain/src/display.unit.test.ts apps/web/src/i18n/catalogs.unit.test.ts --maxWorkers=1: 7/7 passed, 556ms; FINAL finance-only rerun after UUID normalization 1/1 passed, 236ms.
- FINAL npm run test:e2e -- tests/e2e/finance.test.tsx --maxWorkers=1: 2/2 passed, 9.67s after posting guard. Bilingual forms/default/opening, RTL/LTR, axe without unmeasurable jsdom color contrast, real TCP disconnect after account and receipt commits, operation status/retry with no duplicate financial rows, zero server 5xx. No browser automation.
- npm run db:migrate, repeated once: fresh 0000–0011 applied; rerun no Applied lines. Test fixtures use generated isolated schemas.
- FINAL npm run typecheck, npm run lint, npm run build: passed after all source changes. Build 601.02 kB/167.14 kB gzip retains >500 kB warning.
- git diff --check: passed after state EOF cleanup and final documentation updates. Earlier type nullability, guardian default/CSRF fixture assertions and inherited-fieldset-disabled assertion failures were fixed; detailed history in FINANCIAL_CORE.md.

To restart only this isolated test cluster, use C:/Program Files/PostgreSQL/17/bin/pg_ctl.exe with -D "$env:TEMP/nursery-phase13-pg", -l "$env:TEMP/nursery-phase13-pg/server.log", -o '-h 127.0.0.1 -p 55413' and -w start. Stop it with the same verified -D and -m fast -w stop; never change system services. Changes remain uncommitted for review.
