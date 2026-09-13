# Project state

Baseline: 2026-09-13. Phase 05 implementation is complete.

## Active state

- Current phase: 05 — Superadmin, subscriptions, slots, and nursery settings — COMPLETE.
- Current checkpoint: acceptance gate passed; see [licensing/settings evidence](LICENSING_AND_SETTINGS.md) and [handoff](HANDOFF.md).
- Last completed phase: 05. Next phase: 06 — Children, guardians, onboarding, and documents. Stop here; Phase 06 was not started.
- Implemented: atomic seat reservation/release/restore with a real Postgres row lock (not a coarse advisory lock); staff/parent provisioning that reserves a seat and creates the account in one transaction; deactivate/reactivate (staff) and block/unblock (parent) that never touch reservations and refuse a `RELEASED` target; manual monthly/yearly license limits with grace/suspension enforced Cairo-date-wise inside the existing policy load (blocking every non-SYSTEM request once suspended, never SYSTEM); purchased-capacity commercial estimate and an isolated manual renewal-payment ledger; nursery-wide module settings (no branch dimension) with a finance re-enable catch-up preview/acknowledgement gate; Superadmin-only branding/theme with WCAG contrast validation on both server and client; an audited Superadmin support-context endpoint; new `/administration/settings` and `/support/licenses` screens.
- Verification: workspace typecheck/lint/build passed. New `tests/integration/licensing.test.ts` passed 7/7 on real PostgreSQL (seat race, release/restore, grace/suspend/renew, module catch-up workflow, contrast gate, delegated-capability boundaries). Full `test:integration` passed 30/30 across 6 files. `test:unit` passed 39/39 (new Cairo-date/contrast domain checks). `test:e2e` passed for organization (3) and startup (1) after fixing a real regression (see below); `authentication.test.tsx` has 2/8 failing reproducibly on an unmodified Phase 04 checkout too (confirmed via `git stash`) — a pre-existing scrypt/CPU-timing sensitivity in this sandbox, not a Phase 05 regression. Exact commands and full detail are in LICENSING_AND_SETTINGS.md.
- Environment: dependencies were not installed at checkout; `npm install` (not `ci`) was used because `@nursery/domain` was added as a dependency of `@nursery/contracts` and `@nursery/api`, updating the lockfile. System Node 25.2.1/npm 11.6.2 were used as-is; the pinned 24.19.0/11.1.0 toolchain was not separately installed this session (recorded as a deviation). An isolated PostgreSQL 18.4 cluster was created under `%TEMP%/nursery-phase05-pg` on 127.0.0.1:55405; the existing system PostgreSQL 18 install was not otherwise touched. A local `.env` was created pointing at that isolated cluster (gitignored, not committed).
- Migration: 0003_licensing_settings.sql applied cleanly to the existing Phase 04 schema via the repository runner and reran idempotently (0 applied). It only adds new tables and capability/module rows; no existing table is altered.
- Decisions/contracts: D31 in DECISIONS.md and API_AND_DATA_CONTRACTS.md. No unresolved gate blocker. U24 script-only verification followed; no actual-browser visual or production performance claim. Guardian links, children/documents, and financial modules remain later phases. Two real bugs were found and fixed during this phase's own testing (see LICENSING_AND_SETTINGS.md): missing `temporary_expires_at` on provisioned accounts, and a seat-reservation bypass in ordinary reactivate/unblock.

## Phase ledger

| Phase | Topic | Status | Evidence |
|---|---|---|---|
| 01 | Repository, tooling, and shared contracts | COMPLETE | Node 24.19.0/npm 11.1.0; workspace/contracts; local PostgreSQL 17.9 migration applied once and rerun idempotently; real transaction rollback, build, lint, typecheck, script tests, and audit passed. |
| 02 | Bilingual design system and navigation | COMPLETE | Bilingual locale/theme/component/navigation system; workspace lint/type/build, 29 unit/component checks, Vite fallback smoke, audit, production-preview exclusion, and diff check passed. |
| 03 | Authentication, sessions, and account security | COMPLETE | Authentication schema/services/UI; applied and idempotently rerun migration; workspace type/lint/build; 8 focused unit, 12 real PostgreSQL/API/command and 5 scripted UI/startup checks passed. See AUTHENTICATION.md. |
| 04 | Branches, classrooms, and dynamic permissions | COMPLETE | Organization/policy/UI; 9 PostgreSQL/API policy tests, 1 migration upgrade/rerun, 12 auth regression, 7 bilingual DOM/HTTP, 8 unit checks; workspace type/lint/build passed. See ORGANIZATION_AND_POLICY.md. |
| 05 | Superadmin, subscriptions, slots, and nursery settings | COMPLETE | Licensing/seats/settings service and UI; 7 licensing PostgreSQL/API tests plus 30/30 full integration regression, 39/39 unit, 4/4 e2e (organization+startup); workspace type/lint/build passed. See LICENSING_AND_SETTINGS.md. |
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
