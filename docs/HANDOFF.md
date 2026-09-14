# Current handoff

Updated: 2026-09-14 — Phase 15 COMPLETE.

## Next executable action

Phase 16 — Expenses, transfers, refunds, and daily closing. Read AGENTS.md, PROJECT_STATE.md, this handoff, the Phase 16 file and only its named references before editing. Inspect the actual diff first: Phase 15 work remains uncommitted. No Phase 16 implementation started. Phase 12 screenshot handoff remains unresolved independently; no browser automation is authorized.

## Delivered Phase 15 checkpoint

Evidence, API contracts and exact verification are in docs/COLLECTIONS_AND_RECEIPTS.md; decisions D41 in docs/DECISIONS.md. Phase 14 historical evidence remains in BILLING_AND_RECURRENCE.md and Phase 13 in FINANCIAL_CORE.md.

- Outstanding query/options: packages/contracts/src/finance.ts; apps/api/src/modules/finance/{ledger,routes}.ts. Canonical installment balances, all filtered totals, branch/classroom/category/status/due filters, assigned destination identities without branch cash balances; current scope mode returned by server.
- Collections: apps/web/src/features/finance/{collections-screen,collections-copy,parent-screen,receipt-card}.tsx/.ts, App.tsx, auth/navigation, children onboarding links and catalogs. Existing PaymentService.collect/receiveCredit remain the only writers. Frozen operation/payload, status lookup before same-request retry, explicit real branch destinations, partial tuition/full bus, separate confirmed credit. Optional initial payment follows admission and approved fees, through the child-filtered collection screen. Charges/admission never create cash.
- Receipts: finance/{payments,receipts,routes}.ts; apps/api/assets/fonts/NotoSansArabic.ttf and OFL.txt. A4 server-owned snapshots, current permitted child-account balance/date or available credit, nursery name/contact/accent, 300-dpi Pango Arabic text, pagination, no technical PDF/audit dates. Font resolves from the API package in source and emitted code; include assets/fonts in packaging. PDF memory only, zero retention, private/no-store; every download checks current session/module/permission/all child links.
- Reminders: packages/db/src/migrations/0013_collections.sql and reminders.ts/index.ts; API finance/reminders.ts; apps/worker/src/billing.ts. finance-reminders-v1 queue every Cairo minute/startup, 200 new initial installment/recipient witnesses per batch, unique immutable identities. Explicit billing.manage resend drains batches under one FinancialCore operation. Current scoped staff inbox; finance-gated parent source/read/receipt filtering in communication service/contracts/copy. No automatic blocks/late fees/external sends.
- Blocking reuses LicensingService.blockAccount/unblockAccount and existing auth/SSE revocation. Shared DateField now rejects invalid visible dd/MM/yyyy input instead of submitting a previous valid ISO date; optional block until-date uses it. No changes to debt, monthly recurrence or seats from blocking.
- Tests: integration/{collections,receipts,finance-reminders}.test.ts, e2e/collections.test.tsx, scripts/receipt-build-smoke.ts; focused component date test. Migration output/count and worker schedule/restart assertions extended for additive migration/queue.

## Actual verification

Initial worktree clean. Required references read. Actual prerequisite finance/billing PG25/25; worker initially failed import because pg-boss was missing locally. npm ci --ignore-scripts restored committed dependencies (349 packages, audit0); worker passed afterward. No package manifest/lock changes.

Final relevant PG suites 51/51 (23.76s): finance, billing, collections, receipts, finance-reminders, communication, billing-worker, organization-migration and licensing. Includes A18/A19 races/rollback/same-key recovery, partial bank cash, all-line grouped-receipt privacy, dedup/explicit resend, real blocked SSE/API/download with continuing billing/debt/seats, pg-boss restart and fresh/upgrade/rerun migration0013. Final reminder/receipt checks 5/5 (15.85s) include 204 eligible recipients dispatched200+4 and explicit resend all204. Final receipt after metadata/font correction1/1 (6.39s).

Final bilingual real HTTP/DOM4/4 (35.59s): duplicate clicks/actual post-commit connection loss, separate credit adds cash and available credit without settling debt, readonly allowed child views, finance-permission loss and manual block clear records/files. Focused units9/9 (2.27s), updated catalog/finance4/4 (327ms). Earlier fixture/assertion/timing failures were corrected and rerun; no checks skipped to pass.

Final npm run typecheck, lint and build passed after implementation changes. Build172 web modules,643.53kB /177.56kB gzip; existing bundle warning. Compiled receipt smoke passed190531 bytes using the actual bundled font. Final real Arabic receipt rendered with pdftoppm to four A4 PNGs; every page visually inspected without clipping. No creation/modification metadata or retained server files. Final git diff --check passed. Outputs output/pdf/phase15 are git-ignored QA artifacts.

## Exact runtime and repeat commands

Actual runtime is pinned Node24.19.0/npm11.1.0 under %TEMP%/nursery-phase04-tools (system Node24.11.1/npm11.6.2 differs). PostgreSQL18 cluster %TEMP%/nursery-phase12-pg, loopback55412, is STOPPED after checks. Tests use synthetic isolated schemas and drop them. Prior Phase13 PG17/tool paths are absent on this machine.

PowerShell process-only environment:

    $env:PATH="$env:TEMP/nursery-phase04-tools/node_modules/node/bin;$env:PATH"
    $env:DATABASE_URL='postgresql://postgres@127.0.0.1:55412/nursery_test'
    node "$env:TEMP/nursery-phase04-tools/node_modules/npm/bin/npm-cli.js" run test:integration -- tests/integration/finance-reminders.test.ts tests/integration/receipts.test.ts
    node "$env:TEMP/nursery-phase04-tools/node_modules/npm/bin/npm-cli.js" run test:e2e -- tests/e2e/collections.test.tsx
    node --import tsx tests/scripts/receipt-build-smoke.ts

Restart only verified disposable cluster: C:/Program Files/PostgreSQL/18/bin/pg_ctl.exe -D "$env:TEMP/nursery-phase12-pg" -l "$env:TEMP/nursery-phase12-pg/server.log" -o '-h 127.0.0.1 -p 55412' -w start. Stop same -D with -m fast -w stop. No .env/system service/live deployment/subagents/model changes/browser automation.

## Remaining limitations and invariants for Phase 16

Receipt text is raster-embedded for stable printing and not searchable. Nursery name/contact/accent are supported; no existing logo upload/render service or remote-logo fetch introduced. No actual browser/manual mobile walkthrough or VPS performance claim. Existing pg concurrent-query deprecation warning persists in communication regression. Phase12 screenshot gate is not marked complete.

Reuse FinancialCore.operation, canonical balance views, PaymentService/TreasuryService and the shared obligation writer. Keep sorted children/obligations/installments/credit/accounts lock hierarchy and audited atomic idempotency. Parent totals only for permitted children; a grouped receipt requires all included child lines. No permissive fallback, seat release on block, duplicate installment debt/cash formula or in-place settled-history edit. Phase16 must add its corrections/refunds/closing through reasoned source-linked transactions, without rewriting Phase15 receipts or notification identities.
