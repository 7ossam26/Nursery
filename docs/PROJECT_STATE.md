# Project state

Baseline: 2026-09-13. Phase 01 implementation is complete.

## Active state

- Current phase: 01 — Repository, tooling, and shared contracts — COMPLETE.
- Current checkpoint: acceptance gate passed.
- Last completed implementation phase: 01.
- Next action: begin Phase 02 only on explicit user direction.
- Runtime/dependency versions: exact pins and source verification are in `docs/DEPENDENCIES.md`; Node 24.19.0 and npm 11.1.0 installed locally. `npm audit --omit=dev` reports zero vulnerabilities after React Router 7.18.3.
- Implemented commands: dev, build, lint, typecheck, test:unit, test:integration, test:e2e, db:migrate, db:seed:demo.
- Application migrations/tests/build/deployment/backup/restore: Phase 01 baseline migration applied to local PostgreSQL 17.9, rerun idempotently, and real rollback integration passed. Build/lint/typecheck, unit readiness, scripted Vite startup smoke, no-op demo seed, and audit pass. Deployment/backup/restore remain later-phase work.
- Known blocker: none for Phase 01. PostgreSQL 18 remains the production target; PostgreSQL 17.9 was used only for local verification.

## Phase ledger

| Phase | Topic | Status | Evidence |
|---|---|---|---|
| 01 | Repository, tooling, and shared contracts | COMPLETE | Node 24.19.0/npm 11.1.0; workspace/contracts; local PostgreSQL 17.9 migration applied once and rerun idempotently; real transaction rollback, build, lint, typecheck, script tests, and audit passed. |
| 02 | Bilingual design system and navigation | NOT STARTED | None |
| 03 | Authentication, sessions, and account security | NOT STARTED | None |
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
