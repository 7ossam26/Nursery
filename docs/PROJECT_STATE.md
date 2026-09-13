# Project state

Baseline: 2026-09-13. Phase 04 implementation is complete.

## Active state

- Current phase: 04 — Branches, classrooms, and dynamic permissions — COMPLETE.
- Current checkpoint: acceptance gate passed; see [organization/policy evidence](ORGANIZATION_AND_POLICY.md) and [handoff](HANDOFF.md).
- Last completed phase: 04. Next phase: 05 — Superadmin, subscriptions, slots, and nursery settings. Stop here; Phase 05 was not started.
- Implemented: coded branches/classrooms/age groups; advisory capacity; editable templates/stable capabilities; explicit account scope mode; transactional central policy; SYSTEM role/delegation/sensitive-grant controls; constrained staff assignment UI; scoped list/detail/aggregate and future resource/support helpers; live session scope changes and in-memory UI invalidation.
- Verification: workspace typecheck/lint/build passed. Final Phase 04 PostgreSQL/API script passed 9 tests; migration upgrade/rerun passed 1; authentication regression passed 12; bilingual DOM/HTTP passed 7; focused unit checks passed 8. API type/lint/build passed again after the final bounded request-size correction. Exact commands, interim failures, and limits are in ORGANIZATION_AND_POLICY.md.
- Environment: dependencies restored with npm ci; no package/lockfile changes. Pinned Node 24.19.0/npm 11.1.0 and isolated PostgreSQL 18.6 were used. Test cluster stopped after verification; final diff check passed. This checkout had no .env. Existing PostgreSQL service and nursery databases were not modified; no deployment or real account provisioning.
- Migration: 0002_organization_policy.sql verified against an actual Phase 03 schema via the repository runner; second run applied nothing. Existing identities remained unchanged and staff defaulted to no roles/branches with CLASSROOM scope. Test schemas cleaned by fixtures.
- Decisions/contracts: D30 in DECISIONS.md and API_AND_DATA_CONTRACTS.md. No unresolved gate blocker. U24 script-only verification followed; no actual-browser visual or production performance claim. Guardian links, licensing, provisioning and financial operations remain later phases.

## Phase ledger

| Phase | Topic | Status | Evidence |
|---|---|---|---|
| 01 | Repository, tooling, and shared contracts | COMPLETE | Node 24.19.0/npm 11.1.0; workspace/contracts; local PostgreSQL 17.9 migration applied once and rerun idempotently; real transaction rollback, build, lint, typecheck, script tests, and audit passed. |
| 02 | Bilingual design system and navigation | COMPLETE | Bilingual locale/theme/component/navigation system; workspace lint/type/build, 29 unit/component checks, Vite fallback smoke, audit, production-preview exclusion, and diff check passed. |
| 03 | Authentication, sessions, and account security | COMPLETE | Authentication schema/services/UI; applied and idempotently rerun migration; workspace type/lint/build; 8 focused unit, 12 real PostgreSQL/API/command and 5 scripted UI/startup checks passed. See AUTHENTICATION.md. |
| 04 | Branches, classrooms, and dynamic permissions | COMPLETE | Organization/policy/UI; 9 PostgreSQL/API policy tests, 1 migration upgrade/rerun, 12 auth regression, 7 bilingual DOM/HTTP, 8 unit checks; workspace type/lint/build passed. See ORGANIZATION_AND_POLICY.md. |
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
