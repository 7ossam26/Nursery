# Project state

Baseline: 2026-09-13. Phase 03 implementation is complete.

## Active state

- Current phase: 03 — Authentication, sessions, and account security — COMPLETE.
- Current checkpoint: acceptance gate passed; see [authentication evidence and operation](AUTHENTICATION.md) and [handoff](HANDOFF.md).
- Last completed implementation phase: 03.
- Next action: begin Phase 04 only on explicit user direction; inspect its prerequisites and named references first.
- Implemented: immutable account kinds/single SYSTEM identity; one-time bootstrap/local recovery; scrypt passwords and hashed revocable sessions; expiry/rotation/logout; origin/CSRF protection, secure cookies, rate limits and safe errors; audited password/status changes; bilingual login/setup/account/reset/expired screens; saved locale; deny-by-default route boundary and revocation integration hooks.
- Verification: workspace `npm run typecheck`, `npm run lint`, `npm run build` passed. Focused unit scripts passed 8 checks; PostgreSQL/API/operator scripts passed 12; scripted bilingual HTTP/DOM plus Vite startup passed 5. After the final stale-response fix, the web type/lint/build gate and all 4 bilingual flows passed again. Exact commands and limitations are in AUTHENTICATION.md.
- Migration: `npm run db:migrate` applied `0001_authentication.sql` and reran cleanly with no reapplication. Only isolated test schemas received test accounts; they were removed. Existing `.env` and migration history were preserved; no deployment or real account bootstrap performed.
- Runtime/dependencies: Node 24.19.0/npm 11.1.0; dependency versions unchanged in this phase. Local PostgreSQL 17.9 used for verification; PostgreSQL 18 remains the production target.
- Known blocker: none. U24 script-only verification was followed; no browser automation/manual browser claim. General provisioning, capabilities/scopes and licensing remain later phases. No later phase was started.

## Phase ledger

| Phase | Topic | Status | Evidence |
|---|---|---|---|
| 01 | Repository, tooling, and shared contracts | COMPLETE | Node 24.19.0/npm 11.1.0; workspace/contracts; local PostgreSQL 17.9 migration applied once and rerun idempotently; real transaction rollback, build, lint, typecheck, script tests, and audit passed. |
| 02 | Bilingual design system and navigation | COMPLETE | Bilingual locale/theme/component/navigation system; workspace lint/type/build, 29 unit/component checks, Vite fallback smoke, audit, production-preview exclusion, and diff check passed. |
| 03 | Authentication, sessions, and account security | COMPLETE | Authentication schema/services/UI; applied and idempotently rerun migration; workspace type/lint/build; 8 focused unit, 12 real PostgreSQL/API/command and 5 scripted UI/startup checks passed. See AUTHENTICATION.md. |
| 04 | Branches, classrooms, and dynamic permissions | NOT STARTED | None |
| 05 | Superadmin, subscriptions, slots, and nursery settings | NOT STARTED | None |
| 06 | Children, guardians, onboarding, and documents | NOT STARTED | None |
| 07 | Health notes, authorized pickup, and incidents | NOT STARTED | None |
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
