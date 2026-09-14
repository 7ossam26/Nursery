# Project state

Baseline: 2026-09-13. Phase 15 complete (2026-09-14).

## Active state

- Current phase: 16 — Expenses, transfers, refunds, and daily closing — IN PROGRESS (2026-09-14).
- Required phase/state/handoff/reference reads completed. Initial working tree clean at 274fc3c (Phase 15); only root AGENTS.md applies. No model changes, subagents, browser automation or deployment. Phase 12 screenshot gate remains unresolved separately.
- Actual prerequisites: finance/collections/receipt PostgreSQL 20/20 (14.74s), before edits. Verified disposable PostgreSQL18 %TEMP%/nursery-phase12-pg loopback55412 was restarted for checks and STOPPED after checkpoint verification; pinned Node24.19.0/npm11.1.0, process-only DATABASE_URL.
- Checkpoint 1/2 backend: migration0014 adds immutable pending expenses, scoped approvals/cancellations, actual unique disbursements and paired atomic transfers. Threshold explicitly0/disabled, configurable nonreserved approving capability; operating manual sources exclude reserved payroll categories. Canonical cash, sorted expense/account locks, FinancialCore idempotency/audit and deferred source/leg constraints reused. PG spending+migration+child-document regression17/17 (15.34s); initial spending run4/5 found invalid classroom options column, fixed with organization queryScope and rerun.
- Private expense documents reuse extracted PrivateDocumentStore and existing content validator. Current scope/finance/document capability and module gates; no public paths, private/no-store attachment, same-key upload, immutable retirement and conservative cleanup. Expense document PG2/2 (6.89s), including permission withdrawal, active PDF rejection, rollback file cleanup and retention. File bytes omitted from financial audit, hashed for request identity.
- Bilingual expense/transfer pages verified with cash-effect confirmation, category/settings controls, filtered full totals, audit/documents, real accounts and frozen-operation status recovery. First checkpoint UI4/4 (14.02s), type/lint/build/diff passed; missing new capability labels/account prompt and exact required-label assertions corrected and rerun. Evidence/defaults: EXPENSES_AND_CLOSING.md and D42.
- Closing checkpoint backend: migration0015 immutable COUNTED/REOPENED chains, generated difference, canonical dated cash projection, sensitive current-date explicit adjustment and shared SQL/account-lock guard across receipts, credit receipts, expenses/transfers/openings. Backend closing5/5 (13.62s); combined financial/documents/migration PG34/34 (22.89s). Current-head DTO prevents stale history pagination deciding revisions. Bilingual closing page verified: combined UI5/6 (23.78s) found one premature reopen lookup during scoped reload; changed to await fresh data, final closing2/2 (24.75s). Final strengthened closing PG5/5 (14.35s), catalog/finance unit4/4 (556ms), final type/lint/build/diff passed (178 modules671.96kB/183.70kB gzip, existing bundle warning). D43 and EXPENSES_AND_CLOSING.md record actual evidence.
- Outstanding Phase16 scope: sensitive source-linked correction/reversal/replacement, paid tuition reduction to refundable credit, refund availability/concurrency, corresponding pages and complete A25 gate. Not implemented or marked passed. Next phase17 remains NOT STARTED.

## Phase ledger

| Phase | Topic | Status | Evidence |
|---|---|---|---|
| 01 | Repository, tooling, and shared contracts | COMPLETE | Node 24.19.0/npm 11.1.0; workspace/contracts; local PostgreSQL 17.9 migration applied once and rerun idempotently; real transaction rollback, build, lint, typecheck, script tests, and audit passed. |
| 02 | Bilingual design system and navigation | COMPLETE | Bilingual locale/theme/component/navigation system; workspace lint/type/build, 29 unit/component checks, Vite fallback smoke, audit, production-preview exclusion, and diff check passed. |
| 03 | Authentication, sessions, and account security | COMPLETE | Authentication schema/services/UI; applied and idempotently rerun migration; workspace type/lint/build; 8 focused unit, 12 real PostgreSQL/API/command and 5 scripted UI/startup checks passed. See AUTHENTICATION.md. |
| 04 | Branches, classrooms, and dynamic permissions | COMPLETE | Organization/policy/UI; 9 PostgreSQL/API policy tests, 1 migration upgrade/rerun, 12 auth regression, 7 bilingual DOM/HTTP, 8 unit checks; workspace type/lint/build passed. See ORGANIZATION_AND_POLICY.md. |
| 05 | Superadmin, subscriptions, slots, and nursery settings | COMPLETE | Licensing/seats/settings service and UI; 7 licensing PostgreSQL/API tests plus 30/30 full integration regression, 39/39 unit, 4/4 e2e (organization+startup); workspace type/lint/build passed. See LICENSING_AND_SETTINGS.md. |
| 06 | Children, guardians, onboarding, and documents | COMPLETE | 10 children + 7 licensing + 9 organization + 2 migration PostgreSQL checks (28/28); unit 41/41; bilingual DOM/HTTP 3/3; workspace type/lint/build and audit passed. See CHILDREN_AND_DOCUMENTS.md. |
| 07 | Health notes, authorized pickup, and incidents | COMPLETE | Safety 4 + all suites 45/45 PostgreSQL checks (migration 0005 upgrade/rerun included); unit 47/47; bilingual DOM/HTTP safety 2/2, children 3/3; workspace type/lint/build and audit passed. Pre-existing auth e2e timing failure unchanged. See SAFETY.md. |
| 08 | Versioned checkpoints and publication engine | COMPLETE | Unit 49/49; focused PostgreSQL 9/9 incl. correction race, scope/module checks and migration upgrade/rerun; bilingual DOM/HTTP 2/2; workspace typecheck/lint/build and diff check passed. See CHECKPOINT_ENGINE.md. |
| 09 | Attendance and daily classroom reports | COMPLETE | Unit 50/50; PostgreSQL attendance+migration 8/8 plus learning regression 7/7; bilingual DOM/HTTP 2/2; typecheck/build/changed lint/diff passed. See ATTENDANCE.md. |
| 10 | Exams, grades, and corrections | COMPLETE | Unit 54/54; PostgreSQL exams 7/7 plus full regression 65/65; bilingual DOM/HTTP 2/2; workspace typecheck/lint/build and diff check passed. See EXAMS.md. |
| 11 | Homework assignments and individual completion | COMPLETE | Homework PostgreSQL 8/8; learning/exam/attendance/migration regression 22/22; unit 56/56; bilingual DOM/HTTP 2/2; workspace typecheck/lint/build, fresh migration/rerun and diff passed. See HOMEWORK.md. |
| 12 | Parent hub, announcements, and live notifications | IN PROGRESS | Prerequisites 12/12; PG/regression 24/24 plus final communication 9/9; unit 3/3; final real HTTP/SSE bilingual DOM/publication 3/3; final type/lint/build passed. Required screenshot handoff conflict pending. |
| 13 | Financial records, transactions, and treasury core | COMPLETE | Final PostgreSQL finance 16/16; upgrade/rerun 2/2; focused unit 7/7 plus final finance 1/1; bilingual real HTTP/DOM/lost-response 2/2; final type/lint/build and diff passed. See FINANCIAL_CORE.md. |
| 14 | Billing modes, equal discounts, and recurring charges | COMPLETE | PostgreSQL 33/33; pg-boss restart; migration 0012 upgrade/rerun 2/2; bilingual HTTP/DOM 2/2; focused units 6/6; type/lint/build/diff passed. See BILLING_AND_RECURRENCE.md. |
| 15 | Collections, outstanding balances, receipts, and manual blocks | COMPLETE | PostgreSQL/regression 51/51, final reminders/receipts 5/5 and receipt 1/1; bilingual real HTTP/DOM 4/4; focused units 9/9 plus 4/4; migration upgrade/rerun, worker restart, final A4 Arabic PDF visual/emitted-module smoke, type/lint/build/diff passed. See COLLECTIONS_AND_RECEIPTS.md. |
| 16 | Expenses, transfers, refunds, and daily closing | IN PROGRESS | Financial/closing/documents/migration PG34/34, children regression10/10; expense/transfer UI4/4 and final closing2/2; focused units4/4 and final type/lint/build/diff passed. A25 refunds/corrections outstanding. |
| 17 | Child branch transfer and outstanding debt ownership | NOT STARTED | None |
| 18 | Bus subscriptions, trips, and participation | NOT STARTED | None |
| 19 | Employee financials and monthly payroll | NOT STARTED | None |
| 20 | Management reports and PDF/Excel exports | NOT STARTED | None |
| 21 | Excel templates, validation preview, and atomic import | NOT STARTED | None |
| 22 | PWA, network recovery, and usability hardening | NOT STARTED | None |
| 23 | Dokploy deployment assets, backup, restore, and support | NOT STARTED | None |
| 24 | Cross-module verification and release fixes | NOT STARTED | None |
| 25 | Operator guides, user walkthrough, and final handoff | NOT STARTED | None |

Valid execution statuses: NOT STARTED, IN PROGRESS, BLOCKED, COMPLETE. COMPLETE requires the phase's real acceptance evidence, not merely a generated implementation.

## Update contract

At each meaningful checkpoint replace the active summary with the current facts. Update the ledger only when evidence changes. Include actual command names after Phase 01 creates them. Link detailed evidence rather than accumulating long logs here.

A new user requirement should update DECISIONS.md and affected rules/phases, then be referenced here. Do not discard unresolved defects or mark failed checks skipped to close a phase.
