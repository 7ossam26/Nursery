# Project state

Baseline: 2026-09-13. Phase 07 is complete (2026-09-14).

## Active state

- Current phase: 07 — Health notes, authorized pickup, and incidents — COMPLETE; acceptance gate satisfied.
- Delivered: health notes/allergies/alerts/emergency contacts with a retained staff emergency view (D26); parent-managed authorized pickup people with date validity and one-day authorization; management restrictions and prohibited collectors with private notes; staff release recording requiring a permitted collector plus a confirmed call to a pickup-permitted guardian (date-only, append-only, no clock fields); incidents with durable append-only notification events for Phase 12; normalized user-initiated WhatsApp links; PICKUP/INCIDENTS module keys with MODULE_DISABLED gating; bilingual staff and guardian panels.
- Evidence: unit 47/47; full integration 45/45 on real PostgreSQL (safety 4 incl. A33/A01/A03/A37/A31 and event contract; migration upgrade 0005 from Phase 03/05 schemas); e2e safety 2/2 and children 3/3 in isolation; full e2e 11/13 where the 2 failures are the pre-existing authentication reset timing assertion (fails identically on the pristine Phase 06 tree). Workspace typecheck/lint/build, both audits (0 vulnerabilities) and diff check passed.
- Runtime: pinned Node 24.19.0/npm 11.1.0 (%TEMP%/nursery-phase07-tools); disposable PostgreSQL 18.4 cluster %TEMP%/nursery-phase07-pg on 127.0.0.1:55407 was found running, died once mid-run (restarted via pg_ctl, WAL redo) and is left running; system PostgreSQL service untouched; no .env or deployment.
- Migration/defaults: apply 0005 after 0004; six new delegable capabilities need explicit role assignment; PICKUP/INCIDENTS module rows are inserted enabled. D33 records defaults; test-fixture-only change closes lingering keep-alive sockets before app close.
- Last completed phase: 07. Next: Phase 08 — Versioned checkpoints and publication engine — only when requested. Stop; no later-phase implementation.
- Details: [SAFETY.md](SAFETY.md); precise next-session record in [HANDOFF.md](HANDOFF.md). Phase 06 details remain in CHILDREN_AND_DOCUMENTS.md.

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
| 08 | Versioned checkpoints and publication engine | NOT STARTED | None |
| 09 | Attendance and daily classroom reports | NOT STARTED | None |
| 10 | Exams, grades, and corrections | NOT STARTED | None |
| 11 | Homework assignments and individual completion | NOT STARTED | None |
| 12 | Parent hub, announcements, and live notifications | NOT STARTED | None |
| 13 | Financial records, transactions, and treasury core | NOT STARTED | None |
| 14 | Billing modes, equal discounts, and recurring charges | NOT STARTED | None |
| 15 | Collections, outstanding balances, receipts, and manual blocks | NOT STARTED | None |
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
