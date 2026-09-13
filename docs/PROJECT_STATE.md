# Project state

Baseline: 2026-09-13. Phase 06 is complete.

## Active state

- Current phase: 06 — Children, guardians, onboarding, and documents — COMPLETE; acceptance gate satisfied.
- Delivered: atomic family onboarding using existing quota provisioning; independent guardian links/permissions; scoped child/profile/contact administration; lifecycle/classroom history; private validated administrative documents and conservative cleanup; bilingual staff and guardian sibling screens.
- Evidence: 28/28 focused PostgreSQL integration/migration/policy checks, 41/41 unit checks, 3/3 bilingual DOM/HTTP checks; workspace typecheck/lint/build passed. Final web-only check and DOM rerun passed after credential clearing on policy errors. Both full and production audit found 0 vulnerabilities; diff check passed.
- Last completed phase: 06. Next: Phase 07 — Health notes, authorized pickup, and incidents — only when requested. Stop; no later-phase implementation.
- Runtime: Node 24.19.0/npm 11.1.0, isolated PostgreSQL 18.6. Disposable Phase 06 cluster stopped; existing service/data untouched, no .env or deployment. Existing unrelated line-ending changes preserved.
- Migration/defaults: apply 0004 before use; private storage configuration required; four new delegable capabilities require explicit assignment. D32 and API contracts document defaults/boundaries. No financial/transport implementation or public document files.
- Details: [CHILDREN_AND_DOCUMENTS.md](CHILDREN_AND_DOCUMENTS.md); precise next-session record in [HANDOFF.md](HANDOFF.md). Historical Phase 05 evidence/limitations remain in LICENSING_AND_SETTINGS.md.

## Phase ledger

| Phase | Topic | Status | Evidence |
|---|---|---|---|
| 01 | Repository, tooling, and shared contracts | COMPLETE | Node 24.19.0/npm 11.1.0; workspace/contracts; local PostgreSQL 17.9 migration applied once and rerun idempotently; real transaction rollback, build, lint, typecheck, script tests, and audit passed. |
| 02 | Bilingual design system and navigation | COMPLETE | Bilingual locale/theme/component/navigation system; workspace lint/type/build, 29 unit/component checks, Vite fallback smoke, audit, production-preview exclusion, and diff check passed. |
| 03 | Authentication, sessions, and account security | COMPLETE | Authentication schema/services/UI; applied and idempotently rerun migration; workspace type/lint/build; 8 focused unit, 12 real PostgreSQL/API/command and 5 scripted UI/startup checks passed. See AUTHENTICATION.md. |
| 04 | Branches, classrooms, and dynamic permissions | COMPLETE | Organization/policy/UI; 9 PostgreSQL/API policy tests, 1 migration upgrade/rerun, 12 auth regression, 7 bilingual DOM/HTTP, 8 unit checks; workspace type/lint/build passed. See ORGANIZATION_AND_POLICY.md. |
| 05 | Superadmin, subscriptions, slots, and nursery settings | COMPLETE | Licensing/seats/settings service and UI; 7 licensing PostgreSQL/API tests plus 30/30 full integration regression, 39/39 unit, 4/4 e2e (organization+startup); workspace type/lint/build passed. See LICENSING_AND_SETTINGS.md. |
| 06 | Children, guardians, onboarding, and documents | COMPLETE | 10 children + 7 licensing + 9 organization + 2 migration PostgreSQL checks (28/28); unit 41/41; bilingual DOM/HTTP 3/3; workspace type/lint/build and audit passed. See CHILDREN_AND_DOCUMENTS.md. |
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
