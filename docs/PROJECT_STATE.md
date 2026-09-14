# Project state

Baseline: 2026-09-13. Phase 19 complete (2026-09-14).

## Active state

- Phase19 — Employee financials and monthly payroll — COMPLETE (2026-09-14). Profiles/optional creation or later STAFF login, immutable future salary/month attribution, adjustments/cap, immediate advances, full final payout once, explicit no-cash settlement, old unpaid history and bilingual real payroll/receipt-data UI implemented. Defaults D47 and detailed files/commands/equations: [EMPLOYEE_PAYROLL.md](EMPLOYEE_PAYROLL.md).
- Final PostgreSQL payroll12 + actual migration upgrade/rerun3 =15/15 passed81.50s. Shared finance/spending/correction/closing regression checkpoint45/45 passed183.34s. Final bilingual real HTTP/DOM payroll4 + shared-operation spending4 =8/8 passed64.07s; units3/3 passed767ms; final workspace lint/typecheck/build and diff check passed. Failures/fixes and independent source/cash reconciliation are recorded in the evidence document, not skipped.
- Migration0020 verified in fresh isolated schemas after0019 and idempotently rerun. No persistent/live nursery database was migrated. Disposable PostgreSQL18.4 UTF8 loopback55420 cluster stopped after verification; its files remain reusable. Its early public0020 schema is not final evidence.
- Limits: observed Node25.2.1/npm11.6.2 differs from repository pins24.19.0/11.1.0; bundle and pg deprecation warnings remain. No pinned-runtime/VPS performance, mobile screenshot or live deployment claim. Settled payroll stays immutable; no correction endpoint. PDF/Excel files remain Phase20.
- Next: Phase20 — Management reports and PDF/Excel exports — NOT STARTED. Stop here until requested. No subagents, browser automation, model changes or live deployment. Independently unresolved Phase12 screenshot handoff remains unchanged.

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
| 16 | Expenses, transfers, refunds, and daily closing | COMPLETE | A23/A24 and closing/documents checkpoint PG34/34, children10/10, expense/transfer UI4/4, closing UI2/2. A25 backend4/4, combined correction/financial/migration PG36/36, correction/refund UI2/2, final Phase16 UI8/8, units4/4, type/lint/build/diff passed. See EXPENSES_AND_CLOSING.md. |
| 17 | Child branch transfer and outstanding debt ownership | COMPLETE | PostgreSQL56/56 regression + final11/11; bilingual HTTP/DOM2/2; units4/4; migration0017 upgrade/rerun; type/lint/build/diff passed. See CHILD_BRANCH_TRANSFERS.md. |
| 18 | Bus subscriptions, trips, and participation | COMPLETE | PostgreSQL A20/A32/A01/A02/A31 plus atomic cancellation/Phase16 regressions11/11; migration0018–0019 upgrade/rerun2/2; bilingual HTTP/DOM5/5; units4/4; lint/type/build/diff passed. D46/F09. |
| 19 | Employee financials and monthly payroll | COMPLETE | Final PostgreSQL payroll/upgrade-rerun15/15; financial regression checkpoint45/45; final bilingual HTTP/DOM/shared-operation8/8; units3/3; lint/type/build/diff passed. D47; see EMPLOYEE_PAYROLL.md. |
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
