# Phase 15 collections and receipts

Phase 15 COMPLETE (2026-09-14). Actual gate verification is recorded below.

## Behavior and boundaries

`LedgerService.outstanding` projects canonical installment_balances, with unpaid/partial/paid, strictly overdue after the Cairo due date, upcoming/due-today, branch/classroom/category/child filters and paginated rows. Remaining totals/count use the full identical filtered scope. Credit and signed adjustments come from the existing views, without a second financial formula. Staff collection options expose assigned destination identities and current scope mode, never branch cash balances to classroom staff.

`/administration/collections` records partial/full tuition and exact-full bus settlement through the existing PaymentService. The shortcut defaults to the selected installment's remaining amount and branch default CASH destination. Every selected branch has an explicit real destination/method; multiple branches still produce one linked receipt per branch atomically. The form reviews allocations/date/payer/reference and requires confirmation of externally received money. A separate confirmed credit receipt needs its own explicit choice/reason and uses receiveCredit, without settling the installment. No refunds/reversals/closing or bus subscription features were added.

The UI freezes one operation/payload while submitting or uncertain, checks actor operation status, and retries the identical saved request only after lookup. A NOT_FOUND lookup never promises the first request failed. Duplicate clicks cannot create a new operation. Hidden/scope-refresh selections are cleared; the pending request remains in memory for resolution. No offline queue or persisted child/financial records.

Initial payment is optional after successful admission and explicit fee approval. The admission result links to this same child-filtered collection workflow. Admission, agreement drafts and debt create no cash. A failed collection leaves admission/debt intact and never reports payment success.

`/parent/payments` lists only active children with current read+finance links while Finance is enabled. Totals are per child, without a combined family balance. Receipt lists/downloads require authority over every included line; shared receipt amounts cannot disclose a forbidden sibling. Existing guardian links, license/session checks, SSE and useScoped invalidation clear client records on access loss. Staff retain scoped receipt history when Finance is disabled.

## API contracts

- GET `/api/v1/finance/collection-options`: CollectionOptions, current capabilities/scope, assigned branches/classrooms/shared fee options and permitted destination identities.
- GET `/api/v1/finance/outstanding`: strict outstandingQuerySchema; OutstandingPage. Guardian requests require childId and disallow staff branch/classroom/category filters.
- POST `/api/v1/payments` and `/api/v1/finance/credit-receipts`: unchanged authoritative Phase 13 writer schemas/services. Actor operation lookup remains `/api/v1/finance/operations/:id`.
- GET `/api/v1/finance/receipts` and `/api/v1/finance/receipts/:id`: scoped immutable identifying snapshots. GET `.../:id/download`: freshly authorized A4 PDF attachment, private/no-store.
- GET `/api/v1/parent/payment-options`: enabled flag and allowed child IDs/names. GET `/api/v1/parent/children/:id/receipts`: wholly authorized receipts, paginated.
- POST `/api/v1/finance/installments/:id/reminders`: strict operationId, billing.manage plus installment scope, idempotent explicit resend. GET `/api/v1/finance/reminders`: current finance.read recipient inbox and canonical outstanding targets.
- Existing licensing account block/unblock routes/services remain authoritative; optional inclusive until-date now uses the shared dd/MM/yyyy DateField.

## Receipt and reminder implementation

ReceiptService uses PaymentService.receiptInTransaction and current canonical balances in the same authenticated policy transaction. Receipt branch/account/child/category/date/method/payer/reference/amount are immutable snapshots. The printed balance is explicitly current, scoped to permitted included child accounts and dated in Cairo; credit receipts print available credit. No audit timestamps or internal actor data, including PDF creation/modification metadata.

PDFDocument/sharp/Pango render bilingual A4 text at 300 dpi with bundled Noto Sans Arabic, word/character wrapping, pagination and reference/page footers. Nursery name/contact/theme accent are server-owned. Font discovery resolves the API package for both source and emitted modules and fails if the asset is missing. Include apps/api/assets/fonts in release packaging. Zero generated-file retention: PDFs are memory-only attachments, with no public path, persistent generated artifact or bearer grant. Printable text is raster-embedded and is not searchable. Remote/caller-selected logo paths are not fetched; logo upload/rendering is not an existing implemented service.

Migration 0013 adds immutable finance_reminders witnesses and extends the existing parent source view, preserving prior event identities/read state. One initial witness per installment/recipient; explicit resend uses actor/operation identity. Staff need current finance.read and original branch/classroom scope; guardians need active read/finance/notify links. Parent receipt notifications deduplicate per receipt/guardian and require every receipt child's finance access. Paid/disabled/revoked targets are filtered on fresh reads. Blocked parents can retain pending witnesses but cannot access them.

pg-boss queue `finance-reminders-v1` runs each Cairo minute and at startup, inserts at most 200 new witnesses per transaction, and safely resumes after restart. Explicit scoped resend drains batches under one transaction/operation. Jobs never mutate account status, reservations, obligations, balances or cash; no late fees/SMS/WhatsApp. Manual parent blocking remains an independent audited administration action, interrupting existing API/SSE/download access without cancelling debt or recurring billing.

## Actual verification

Environment: synthetic isolated schemas in disposable PostgreSQL 18, loopback 55412, %TEMP%/nursery-phase12-pg, stopped after final checks using pg_ctl -m fast -w stop. Pinned Node 24.19.0/npm 11.1.0 under %TEMP%/nursery-phase04-tools. Initial worktree clean. Prior handoff's PG17/Node tooling was unavailable; actual PG18/tools inspected and used. npm ci --ignore-scripts restored missing committed pg-boss dependency: 349 packages, audit 0 vulnerabilities. No .env/service/live deployment/browser automation/subagents/model changes.

Use process-only PowerShell PATH and DATABASE_URL, then invoke the pinned npm CLI:

    $env:PATH="$env:TEMP/nursery-phase04-tools/node_modules/node/bin;$env:PATH"
    $env:DATABASE_URL='postgresql://postgres@127.0.0.1:55412/nursery_test'
    node "$env:TEMP/nursery-phase04-tools/node_modules/npm/bin/npm-cli.js" run <script> -- <files>

| Command/check | Actual result |
|---|---|
| test:integration -- finance.test.ts billing.test.ts billing-worker.test.ts | Finance/billing 25/25; initial worker import failed (pg-boss missing). After committed dependency restore, worker passed. |
| test:integration -- finance.test.ts billing.test.ts collections.test.ts receipts.test.ts finance-reminders.test.ts communication.test.ts billing-worker.test.ts organization-migration.test.ts licensing.test.ts (each under tests/integration/) | 51/51, 23.76s. A18/A19 settlement races/rollback/retries, exact partial bank inflow, all-line receipt privacy, reminder dedup, real blocked SSE/API/download with continuing recurrence/seats/debt, pg-boss restart and migration upgrade/rerun. |
| test:integration -- tests/integration/finance-reminders.test.ts tests/integration/receipts.test.ts | 5/5, 15.85s; includes 204-recipient bounded 200+4 initial dispatch and one full idempotent explicit resend. |
| test:integration -- tests/integration/receipts.test.ts after final metadata/font fix | 1/1, 6.39s; Arabic multi-page real receipt, another family/finance revocation/block/path denied, zero retained files, no technical PDF dates. |
| test:e2e -- tests/e2e/collections.test.tsx | Final bilingual collection/credit/readonly/block/finance-revocation 4/4, 35.59s. Real HTTP connection dropped after payment commit; duplicate clicks one settlement; separate credit adds cash/available credit without paying debt. Axe excludes unmeasurable jsdom color contrast. Earlier fixture/assertion/timing failures fixed and rerun. |
| test:unit -- apps/web/src/components/components.unit.test.tsx apps/web/src/i18n/catalogs.unit.test.ts packages/contracts/src/finance.unit.test.ts | 9/9, 2.27s; invalid visible date cannot submit a previously valid date. Final updated catalogs/finance subset 4/4, 327ms. |
| run typecheck; run lint; run build | Final commands passed after all implementation changes; 172 web modules, existing >500 kB bundle warning (643.53 kB / 177.56 kB gzip). |
| node --import tsx tests/scripts/receipt-build-smoke.ts after build | Passed: emitted API module renders Arabic A4 with the actual bundled font, 190531 bytes, one page and no creation-date metadata. |
| pdftoppm -scale-to 1300 -png output/pdf/phase15/arabic-receipt.pdf output/pdf/phase15/arabic-receipt; inspect all four PNGs | Final render/inspection passed after metadata/font correction. Joined Arabic, no clipped text. Output is git-ignored. |
| git -c core.safecrlf=false diff --check | Passed, including final documentation update. |

One lint failure in control-character regex was fixed using code-point filtering. Existing pg concurrent-query deprecation warning occurs in communication regression; no new parallel queries inside phase transactions. Scripted DOM/HTTP and PDF visual checks do not claim an actual browser/manual mobile walkthrough or VPS performance. Phase 12 screenshot handoff remains unresolved independently.

Next phase after this gate: Phase 16 — Expenses, transfers, refunds, and daily closing.
