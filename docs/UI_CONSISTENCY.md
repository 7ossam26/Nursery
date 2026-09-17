# UI consistency pass — 2026-09-17

Status: COMPLETE. User-requested presentation-only follow-up to the dashboard redesign.

## Boundary and baseline

- Preserve existing dashboard, illustration, and other uncommitted work. Recheck the diff between batches.
- Do not change loading/performance architecture, request timing, business rules, validation, payloads, routes, permissions, authentication, database, or dependencies.
- The user explicitly authorized browser automation for visual inspection during this pass. Functional verification remains repository scripts against real HTTP/PostgreSQL.
- No staging, commits, reset, stash, deployment, subagents, or direct access to `pgdata/`.
- Before implementation: unit tests 33 files / 150 tests PASS; `git diff --check` PASS. Serial DOM baseline: 23 files passed / 1 failed, 61 tests passed / 1 failed, 706.48 seconds. The failure is the documented Arabic A36/A18 network-recovery timing issue (`tests/e2e/network-recovery.test.tsx:39`, reconnect button queried inside a closed dialog). Frontend source was unchanged for the entire baseline run.

## Route and panel checklist

Each row requires source audit, implementation review, and rendered inspection. A shared component change alone does not complete a row. Widths: 360, 390, 768, 1024, 1280, 1440, 1920. Appearances: light/dark; locales: en/ar-EG.

| Existing route | Panels / review focus | Status |
|---|---|---|
| `/`, `/account` | Dashboard, account actions; preserve reference design | Verified |
| `/login`, `/session-expired` | Sign-in form and expired state | Verified |
| `/change-password` | Password fields, validation, submit and back action | Verified |
| `/administration/organization` | Branches, classrooms, age groups, roles, staff, assignments | Verified |
| `/administration/settings` | Branding, modules, staff/parent accounts, blocking actions | Verified |
| `/support/licenses` | Status, capacities, renewal, reservations, support context | Verified |
| `/support/operations` | Search, audit, operations, backups, restore and tables | Verified |
| `/administration/children` | Search/filter, onboarding steps, results, child cards | Verified |
| `/administration/children/:id` | Profile, guardians, history, documents, health, pickup, incidents | Verified |
| `/administration/checkpoints` | Configuration, definitions, custom statuses | Verified |
| `/teacher/learning` | Child/date controls, reporting, history, classroom publication | Verified |
| `/teacher/today` | Classroom attendance, corrections, history and pagination | Verified |
| `/teacher/exams` | Catalog, sessions, grades, corrections, roster | Verified |
| `/teacher/homework` | Assignments, publication, completion, roster and history | Verified |
| `/teacher/activities` | Activity roster and existing permitted actions | Verified |
| `/parent/today` | Child switcher, updates, contacts, notices | Verified |
| `/parent/children` | Child cards, empty and paused states | Verified |
| `/parent/children/:id` | Learning, attendance, exams, homework, health and pickup | Verified |
| `/parent/payments` | Balances, charges, receipts, filters | Verified |
| `/parent/notices` | Notice list and pagination | Verified |
| `/parent/notices/:id` | Notice detail and acknowledgement | Verified |
| `/parent/notifications` | Notification records and navigation actions | Verified |
| `/administration/announcements` | Publishing form, recipients, flags and actions | Verified |
| `/administration/treasury` | Accounts and related finance navigation | Verified |
| `/administration/billing` | Agreement, categories, recurrence and approvals | Verified |
| `/administration/collections` | Filters, amounts, collection, credit, receipts | Verified |
| `/administration/expenses` | Expenses, documents, categories, confirmation | Verified |
| `/administration/transfers` | Treasury transfer and history | Verified |
| `/administration/closing` | Cash counts, confirmation, closing history | Verified |
| `/administration/corrections` | Replacements, credit, refunds and history | Verified |
| `/administration/child-transfers` | Transfer preview, confirmation and history | Verified |
| `/administration/transport` | Bus subscriptions, activities, consent and cancellation | Verified |
| `/administration/payroll` | Employees, terms, advances and monthly settlement | Verified |
| `/administration/reports` | Page heading, filters, tables, export and pagination | Verified |
| `/administration/imports` | Template, file selection, previews, validation and commit | Verified |
| Existing group fallbacks and `*` | Unavailable and not-found actions | Verified |
| `/__preview/*` | Shared variants, controls, dialogs and states | Verified |

## Evidence

Commands, outcomes, screenshots and limitations will be recorded here as executed. Unverified rows must remain explicit.

Checkpoint 1: shared variants, action groups, form/native-control presentation, headers, badges, states and screen composition applied. Source edits were prepared separately during baseline verification, then applied only after verifying every destination still matched its captured starting content. No unrelated edits were overwritten.

Checkpoint 2: every checklist row received a source audit and rendered review. The pass standardizes page headers, form and filter grouping, action hierarchy, destructive/success states, status badges, responsive tables and lists, dialogs, inline notices, loading skeletons, and true empty states while keeping the existing product copy and data. A TypeScript AST inventory found the same 221 request/auth/navigation call expressions in the captured pre-pass frontend and the final frontend, with zero additions or removals. No API, backend, route, permission, validation, payload, database, migration, dependency, or loading/performance architecture changed.

Checkpoint 3: the local disposable real-HTTP/PostgreSQL preview was inspected in the in-app Chromium browser across English and Egyptian Arabic, light and dark appearance, and viewport widths 360, 390, 768, 1024, 1280, 1440, and 1920. The matrix ran 1,211 route/persona/appearance/locale/width checks across 38 distinct route or fallback views, including true System, teacher, and parent sessions; the teacher routes were repeated under the dedicated teacher account. No document overflow or off-screen main control/card was measured. Representative desktop, phone, dark, RTL, empty, populated, table/card, and 360px Arabic dialog states were also visually inspected. These are browser viewport emulations, not physical-device captures; the existing physical-device qualification remains separate.

Checkpoint 4: the first final DOM run found a real heading-order regression in the shared empty state plus two non-reproducing fixture/timing lookups. `EmptyState` now follows the page `h1` with an `h2`; the focused real-HTTP/PostgreSQL rerun of homework, safety, and support passed 3 files / 6 tests in both locales. Unit verification passes 33 files / 152 tests. `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` pass. The production build retains the existing large-chunk advisory; performance work was explicitly outside this pass. Final serial DOM-suite evidence is recorded below.

Cleanup: the visual-review tab and server were closed, its active disposable schema/files were removed by the fixture, and a uniquely identified abandoned preview schema from the earlier interrupted run was removed by its exact child marker. No production or shared application data was touched.

Final serial DOM suite (`npx vitest run --config vitest.e2e.config.ts --no-file-parallelism --maxWorkers=1`): 23 files / 61 tests passed and 1 file / 1 test failed in 737.55 seconds. The only failure is the documented A36/A18 network-recovery dialog timing race at `tests/e2e/network-recovery.test.tsx:39`: the reconnect button is present in the dumped dialog but the dialog has already closed for the accessible-role query. The untouched baseline failed identically in Arabic; this final run failed in English, so the result remains an existing timing defect rather than a UI-consistency regression. It was not changed because loading/performance and recovery architecture were explicitly excluded.
