# Project state

Baseline: 2026-09-13. Phase 15 complete (2026-09-14).

## Active state

- Current phase: 15 — Collections, outstanding balances, receipts, and manual blocks — COMPLETE (2026-09-14).
- Initial working tree clean; required phase/reference reads completed. Actual prerequisite finance/billing PostgreSQL tests passed 25/25. Worker suite initially failed to import missing pg-boss; restored committed dependencies with npm ci --ignore-scripts (349 packages, 0 vulnerabilities), then worker restart check passed 1/1.
- Checkpoint 1 complete: strict outstanding DTO/query, canonical installment filters/full totals, scoped destination identities, bilingual collections and separately confirmed credit receipt, frozen-operation recovery, staff receipt history and optional initial-payment links. PaymentService remains the sole writer; no charge/admission creates cash.
- Checkpoint 2 complete: freshly authorized bilingual A4 receipt attachment, bundled OFL Arabic font/Pango at 300 dpi, nursery name/contact/accent, canonical permitted balances, no technical timestamps, zero generated-file retention. Final receipt PG 1/1 (6.39s), emitted-module/font smoke and final four-page PDF render/inspection passed.
- Checkpoint 3 complete: migration 0013 immutable/deduplicated reminders, bounded Cairo minute/startup pg-boss sweep, explicit scoped/idempotent resend, staff inbox, all-line finance-gated parent notifications/receipts and child payment views. Manual blocking reuses existing administration/revocation services; debt/billing/seats stay independent.
- Final gate: focused PostgreSQL/regression 51/51 (23.76s), final reminder/receipt checks 5/5 (15.85s, including 204-recipient 200+4 dispatch/resend), final receipt 1/1, bilingual real HTTP/DOM collection/credit/readonly/block/finance-revocation 4/4 (35.59s), focused units 9/9 plus updated catalog/finance 4/4; final typecheck/lint/build/emitted receipt/diff passed. Evidence and contracts: [COLLECTIONS_AND_RECEIPTS.md](COLLECTIONS_AND_RECEIPTS.md), D41. Shared DateField prerequisite fix prevents invalid visible dates submitting old ISO values.
- Limitations: printable receipt text is raster-embedded, not searchable; no existing logo upload/render service was introduced. Actual browser/manual mobile walkthrough and VPS performance unmeasured; existing >500 kB web bundle and pg query-deprecation warnings retained. Next phase is 16; no later-phase work performed.
- Actual runtime: Node 24.19.0/npm 11.1.0 under %TEMP%/nursery-phase04-tools; disposable PostgreSQL 18 %TEMP%/nursery-phase12-pg on loopback 55412 STOPPED after checks. Process-only DATABASE_URL; no .env, system service, browser automation, subagents, model changes or production actions.
- Phase 12 screenshot handoff remains unresolved, without marking it complete. Earlier completed Phase 14 evidence remains in [BILLING_AND_RECURRENCE.md](BILLING_AND_RECURRENCE.md).
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
| 16 | Expenses, transfers, refunds, and daily closing | NOT STARTED | None |
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
