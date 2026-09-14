# Project state

Baseline: 2026-09-13. Phase 12 in progress (2026-09-14).

## Active state

- Current phase: 12 — Parent hub, announcements, and live notifications — IN PROGRESS; gate not yet satisfied.
- Checkpoint 1: inspected clean worktree, actual policy/guardian services and immutable learning/homework/incident/absence producers. Prerequisites verified on disposable PostgreSQL 18.6: `npm run test:integration -- tests/integration/safety.test.ts tests/integration/homework.test.ts --maxWorkers=1` passed 12/12. Pinned Node 24.19.0/npm 11.1.0; new loopback-only cluster `%TEMP%/nursery-phase12-pg`, port 55412, database nursery_test.
- Delivered: communication contracts/migration 0010, immutable targeted announcements/holiday notices, private recipients/independent acknowledgment/inbox read state, real producer adapters, authenticated SSE and compact bilingual Today/history/notices/notification/publish/WhatsApp screens. Existing contracts/components/policy/learning operation reused.
- Actual final evidence: current PostgreSQL/regression 24/24; final communication-only 9/9 including active-stream shutdown; focused units 3/3; final bilingual real HTTP/SSE/DOM/publication 3/3 with RTL/axe/no server errors and visible refresh under five seconds. Final typecheck/lint/build and repository-configured `git diff --check` passed. Detailed commands/results in PARENT_HUB_AND_NOTIFICATIONS.md.
- Migration/defaults: fresh 0000–0010 applied and rerun idempotently; upgrades preserve identities/reservations/edited roles, no role grants/history mutation. D38 documents privacy/reconnect and narrow dated-holiday notice addition because actual Phase 09 lacks a calendar producer; notices never infer attendance.
- Runtime: pinned Node 24.19.0/npm 11.1.0, isolated PostgreSQL 18.6 `%TEMP%/nursery-phase12-pg`, loopback 55412, nursery_test, STOPPED after verification. No live nursery/environment/dependency/model/deployment/browser automation/subagents changed. Initial diff clean; preserve uncommitted phase work.
- Limits: dispatch at most 200 candidates/transaction, list pages at most 50, three streams/account/API process; revocation checked each second plus DB/network latency, normal requests immediately. Build 590.69 kB/164.63 kB gzip retains >500 kB warning; pg concurrent-query deprecation warning observed, origin untraced; prior auth DOM timing defect outside scope.
- Remaining handoff conflict: phase requires screenshots; AGENTS mandates scripts and prohibits browser automation. Clarification asked (waive screenshots or explicitly permit local screenshot-only automation), no reply/permission received. Screenshots/physical narrow-phone layout review not run; gate stays open, no completion claim.
- Last completed: Phase 11 (HOMEWORK.md). Resolve Phase 12 screenshot handoff next; Phase 13 follows only after its gate. Precise continuation: [HANDOFF.md](HANDOFF.md).

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
