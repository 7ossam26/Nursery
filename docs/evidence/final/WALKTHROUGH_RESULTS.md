# User acceptance walkthrough — executed results (post-Phase-25 release closure)

Implements Step 3 of the post-Phase-25 release-closure task: actual execution of
[docs/USER_ACCEPTANCE_WALKTHROUGH.md](../../USER_ACCEPTANCE_WALKTHROUGH.md) against the real application and
PostgreSQL, not a theoretical review. This document is the evidence; `USER_ACCEPTANCE_WALKTHROUGH.md` itself keeps
its blank template for the tech lead's own device/browser pass, which this cannot replace (see "What this does not
replace" below).

## Environment

| Field | Value |
|---|---|
| Candidate commit | `86ea0be09e136dc7de96a8f82553fecb576d0c4c` (`main`, immediately after the N25-01 fix and the Phase 12 conflict analysis) |
| Date executed | 2026-09-15 |
| Database | Real disposable PostgreSQL 18.4 on `127.0.0.1:55421`, database `nursery_uat` (+ `nursery_uat_restore_check` for restore validation), fresh schema migrated 0000→0023 (24 migrations) |
| Application processes | Real standalone `npm run start:api` and `npm run start:worker` (the actual compiled entry points, not an in-process test fixture), listening on `http://127.0.0.1:3100`, `NODE_ENV=development` (no HTTPS/production secret-length gate — this is a local non-production run, not a claim of production qualification) |
| Installation ID | `59ae7d0f-a59e-458d-ae43-6db1bca4c221` (fresh UUID, distinct from any other run) |
| Backups | `BACKUP_TARGET=directory:<scratch>/offsite`, `BACKUP_ENCRYPTION_KEY` a freshly generated 32-byte key |
| Method | Real HTTP requests via the actual web client's `AuthClient` (`apps/web/src/features/auth/client.ts`) reused unmodified by `tests/scripts/acceptance-walkthrough.ts`, run with `tsx` against the real listening server — the same request/response contract a browser would use, just without a rendered DOM. No browser automation (AGENTS.md rule 11 / U24). |
| Driver script | [tests/scripts/acceptance-walkthrough.ts](../../../tests/scripts/acceptance-walkthrough.ts) (committed, typechecked, reproducible — see its header for exact invocation) |
| Raw log | [walkthrough-run.log](walkthrough-run.log) (includes every request's real response data plus the Markdown table below, machine-generated) |
| Operator sequence evidence | [operator-sequence.txt](operator-sequence.txt) (`env:check`, `release:prepare` fresh + idempotent rerun, `auth:bootstrap`, API/worker startup, health/readiness/static-serving checks) |

## Result: 88 PASS, 0 FAIL, 5 NOT EXECUTED (manual/browser only)

Every row that can be exercised without a rendered browser passed on the actual running application and real
PostgreSQL. The single-story cross-module flow below is one continuous walkthrough (Superadmin setup → nursery
admin setup → teacher daily work → parent experience → finance operations → access blocking → import/restore),
matching the "Final manual walkthrough" narrative in
[TESTING_AND_ACCEPTANCE.md](../../TESTING_AND_ACCEPTANCE.md). Row IDs match
`USER_ACCEPTANCE_WALKTHROUGH.md` section numbering where a row exists there; `-setup`/`b`/`c` suffixes are
supporting sub-steps this driver needed to reach that row (creating fee categories, a second child so "zero vs
missing" is observable, a treasury account to collect into, etc.) and are included for full transparency rather
than folded away.

| Row | Status | Route | Note |
|---|---|---|---|
| 1.1 | PASS | POST /api/v1/auth/password | temporary bootstrap password changed for SYSTEM |
| 1.2 | PASS | PUT /api/v1/licensing/settings | nursery name/theme saved with a passing contrast pair |
| 1.2b | PASS | PUT /api/v1/licensing/settings | unreadable white-on-white theme correctly rejected server-side: VALIDATION_ERROR licensing.contrast |
| 1.3 | PASS | PUT /api/v1/licensing/limits | subscription validity/grace/capacities saved |
| 1.4 | PASS | POST /api/v1/organization/roles | custom role created id=d4232d15-6e5e-4fd3-87d1-a8c24b6649ec |
| 1.4b | PASS | POST /api/v1/organization/roles | reserved capability key correctly refused for a custom role: FORBIDDEN auth.forbidden |
| 1.4c | PASS | POST /api/v1/organization/roles | teacher role created id=638f30cb-a86c-4e97-a2c3-782d07db3e66 |
| 1.5 | PASS | POST /api/v1/licensing/staff | first nursery-admin login provisioned: admin-1789451999756 |
| 1.5b | PASS | POST /api/v1/auth/password | one-time temporary password worked and was changed |
| 2.1 | PASS | POST /api/v1/organization/branches | branch A id=cad62d57-1f76-4d69-9e1b-2e5eb52db01e |
| 2.1b | PASS | POST /api/v1/organization/branches | branch B id=b50b6806-b64a-4cc3-b867-6b5ededfbd77 |
| 2.1c | PASS | POST /api/v1/organization/classrooms | classroom A id=068fe7e3-0383-41dc-a41c-4cfe3184f9de |
| 2.1d | PASS | POST /api/v1/organization/classrooms | classroom B id=6b652ced-2410-4291-a9a2-8d297930f4f7 |
| 1.5c | PASS | PUT /api/v1/organization/staff/:id/assignments | admin scoped branch-wide over both branches |
| 2.2 | PASS | POST /api/v1/licensing/staff | teacher login provisioned: teacher-1789452001076 |
| 2.2a | PASS | PUT /api/v1/organization/staff/:id/assignments | teacher scoped to classroom A only |
| 2.2b | PASS | GET /api/v1/auth/me | teacher session scope is exactly classroom A only (classroomIds=[068fe7e3-0383-41dc-a41c-4cfe3184f9de]) |
| 2.setup-a | PASS | POST /api/v1/finance/categories | TUITION category id=11e7581c-a12a-473e-a5f8-ca0105e8dc8a |
| 2.setup-b | PASS | POST /api/v1/finance/categories | BUS category id=8ff8a238-8079-46d8-89bc-92c96d837b9c |
| 2.setup-c | PASS | POST /api/v1/finance/categories | TRIP category id=dff78f58-79bd-4918-9069-9499537f4967 |
| 2.setup-d | PASS | POST /api/v1/finance/accounts | branch A default CASH account id=f14ee431-fda1-47a0-b4a6-fdbd47c011b7, opening balance 2000000 |
| 2.setup-e | PASS | POST /api/v1/finance/accounts | branch B default CASH account id=d1a108a1-18c3-4c6d-b2d9-94e3b2e5f04b |
| 2.setup-f | PASS | POST /api/v1/finance/accounts | branch A BANK account id=b689acbb-7333-4445-aed6-afa88f13e81a |
| 2.3 | PASS | POST /api/v1/children/onboarding | family onboarded: 2 children, 1 guardian(s) |
| 2.4 | PASS | POST /api/v1/billing/agreements | draft billing agreement id=f9d395c3-7bfc-4d1d-afda-9174b3190264 |
| 2.4b | PASS | POST /api/v1/billing/agreements/:id/approve | agreement approved — creates debt only, verified against treasury balance in 2.4c |
| 2.4c | PASS | GET /api/v1/finance/accounts | approving the agreement created no cash movement (branch A cash balance still 2000000) |
| 2.5 | PASS | POST /api/v1/transport/subscriptions | bus subscription id=f64d609e-3bc5-4207-b69b-5171b0ce9ced created with obligation c034c4ed-a7b6-4125-a7a3-78b57bacc2a0 (eligibility checked in 5.2 after full settlement) |
| 2.6 | PASS | POST /api/v1/activities | activity created id=a20eafd8-a30c-41d8-9407-1b795fc43fad |
| 3.setup | PASS | GET /api/v1/learning/configuration | checkpoint configuration v2, 3 definitions |
| 3.1 | PASS | GET /api/v1/attendance/classrooms/:id/draft | roster 2 children |
| 3.1b | PASS | POST /api/v1/attendance/classroom-publications | attendance published PRESENT for the full roster |
| 3.setup-subject | PASS | POST /api/v1/exams/catalog/subjects | subject id=7f3ba849-afbb-4328-82b1-6b3f83a377c1 |
| 3.setup-type | PASS | POST /api/v1/exams/catalog/types | exam type id=ff75b1fb-6574-4158-8900-cb5cc41daeb7 |
| 3.setup-exam | PASS | POST /api/v1/exams | exam id=8cf6d431-9f07-454b-aced-f582ebc3ec98 |
| 3.setup-roster | PASS | GET /api/v1/exams/:id/roster | 2 children on roster |
| 3.2 | PASS | POST /api/v1/exams/results | child one scored 0 (real zero, not missing); child two left unrecorded to confirm missing ≠ zero |
| 3.2b | PASS | GET /api/v1/exams/:id/roster | confirmed: recorded zero score displays as 0, unrecorded child stays explicitly missing (not zero) |
| 3.3 | PASS | POST /api/v1/homework | homework assignment id=ea63c4c3-e17e-425e-8364-becf44c70d37 |
| 3.setup-hw-roster | PASS | GET /api/v1/homework/:id/roster | 2 children |
| 3.3b | PASS | POST /api/v1/homework/outcomes | child one homework marked completed |
| 3.4 | PASS | POST /api/v1/exams/results/corrections | issued a reasoned correction from 0 to 5 |
| 3.4b | PASS | GET /api/v1/exams/children/:id/history | 1 historical exam entries retained (original stays visible alongside the correction) |
| 4.1 | PASS | GET /api/v1/parent/live (SSE) | real SSE stream received a distinct invalidate event within 8s of a teacher publication (separate from the initial connect snapshot) |
| 4.1b | PASS | GET /api/v1/learning/children/:id/daily | guardian can read the child's daily record over the same authenticated route staff use |
| 4.2 | PASS | PATCH /api/v1/auth/locale | guardian locale switched to ar-EG (dd/MM/yyyy + Latin-digit EGP rendering itself is a DOM-suite/manual check, not verifiable over raw HTTP — see note in the matrix) |
| 4.3 | PASS | GET /api/v1/parent/payment-options | guardian can read parent payment options (permitted balances view); receipt visibility re-checked at 4.3b after 5.1 actually collects one |
| 4.3-balances | PASS | GET /api/v1/finance/children/:id/balances | guardian can read the permitted child balance before any collection |
| 4.4-setup | PASS | POST /api/v1/announcements | announcement id=185236ef-6d13-4276-b47f-049e39629c01 |
| 4.4 | PASS | GET /api/v1/parent/announcements | 1 notice(s) visible, including the classroom announcement |
| 4.4b | PASS | POST /api/v1/parent/announcements/:id/acknowledgment | guardian acknowledged the notice that required it, and it now shows acknowledged=true on re-read |
| 5.setup | PASS | GET /api/v1/finance/outstanding | 3 unpaid installment(s), total remaining 145000 |
| 5.1 | PASS | POST /api/v1/payments | partial collection produced receipt(s): 481735e8-cf2d-4fcc-a61e-02b2883b5c83 |
| 4.3b | PASS | GET /api/v1/parent/children/:id/receipts | guardian's payment history now shows the just-collected receipt (1 total) |
| 5.2 | PASS | POST /api/v1/payments | partial bus-fee payment correctly rejected (full settlement only): VALIDATION_ERROR finance.invalid |
| 5.2b | PASS | POST /api/v1/payments | full bus-fee settlement accepted once |
| 5.2c | PASS | GET /api/v1/transport/subscriptions | bus subscription now eligible after full settlement |
| 5.3-setup | PASS | POST /api/v1/expenses/categories | expense category id=5d0a3641-7a32-4979-983d-da8534c55484 |
| 5.3 | PASS | POST /api/v1/expenses | pending expense id=e0a18ddf-581a-4e12-be15-a71de9dce108 (no cash effect) |
| 5.3b | PASS | POST /api/v1/expenses/:id/pay | actual payment recorded once money left the account |
| 5.4 | PASS | POST /api/v1/finance/transfers | treasury account transfer recorded (source −, destination +) |
| 5.5-setup | PASS | POST /api/v1/payroll/employees | employee profile id=3f5808e5-d2a3-457c-8f9d-9c606937ab2b |
| 5.5-setup-b | PASS | POST /api/v1/payroll/periods | payroll period id=5f216896-e556-4a15-9bde-d1936d0d713f |
| 5.5 | PASS | POST /api/v1/payroll/periods/:id/advances | salary advance paid |
| 5.5b | PASS | POST /api/v1/payroll/periods/:id/settlements | full remaining 400000 paid once |
| 5.6-setup | PASS | POST /api/v1/finance/child-transfers/preview | preview: 1 outstanding item(s), amount 100000 |
| 5.6 | PASS | POST /api/v1/children/:id/branch-transfers | child transferred with outstanding debt moved to Branch B |
| 5.6b | PASS | GET /api/v1/finance/accounts | branch A cash balance after transfer: 1550333 (unchanged by the transfer itself, cf. balance recorded at 2.4c and any 5.1/5.3b/5.4 postings above) |
| 5.7-setup | PASS | GET /api/v1/finance/closing-options | 2 countable account(s), canCount=true |
| 5.7-setup-b | PASS | GET /api/v1/finance/closing-current | current revision 0 |
| 5.7 | PASS | POST /api/v1/finance/closings | closing recorded, difference 0 (0 = matches actual counted cash) |
| 5.8-setup | PASS | GET /api/v1/reports/options | 24 report kinds available |
| 5.8-PDF | PASS | POST /api/v1/reports/exports | PDF export requested id=aad99302-8e45-4949-b4a7-4f515f4c91f6 |
| 5.8 | PASS | GET /api/v1/reports/exports/:id/download | PDF export downloaded and parsed, 211323 bytes |
| 5.8-XLSX | PASS | POST /api/v1/reports/exports | XLSX export requested id=8844dbf0-87d8-4839-b522-7c267ed0fcf1 |
| 5.8b | PASS | GET /api/v1/reports/exports/:id/download | XLSX export downloaded and parsed, 1 sheet(s) |
| 6.1 | PASS | POST /api/v1/licensing/accounts/:id/block | guardian account blocked with a stated reason |
| 6.2 | PASS | POST /api/v1/auth/login | blocked guardian correctly refused sign-in: ACCOUNT_BLOCKED auth.contactNursery |
| 6.2b | PASS | GET /api/v1/finance/children/:id/balances | billing for the child continues unaffected while the guardian is blocked (finance data still readable by staff) |
| 6.3 | PASS | POST /api/v1/licensing/accounts/:id/unblock | guardian account unblocked |
| 6.3b | PASS | POST /api/v1/auth/login | normal sign-in access returned after unblock |
| 7.1 | NOT EXECUTED | n/a (manual/browser) | physical 360px layout requires a real rendered browser/device — no browser automation permitted (AGENTS.md rule 11 / U24) |
| 7.2 | NOT EXECUTED | n/a (manual/browser) | visible keyboard focus/tab order requires a real rendered browser |
| 7.3 | NOT EXECUTED | n/a (manual/browser) | prefers-reduced-motion visual behaviour requires a real rendered browser |
| 7.4 | NOT EXECUTED | n/a (manual/browser) | RTL layout direction of monetary/date values requires a real rendered browser (scripted CSS/axe checks in the DOM suite are the closest automated substitute — see Step 5 gate results) |
| 4.2b | NOT EXECUTED | n/a (manual/browser) | actual dd/MM/yyyy + Latin-digit EGP rendering on screen requires a real rendered browser; locale switch itself verified at 4.2 and by the existing bilingual DOM suite (tests/e2e/collections.test.tsx, parent-hub.test.tsx) |
| 8.1-setup | PASS | GET /api/v1/imports/templates/PARENTS_CHILDREN | template downloaded, 12765 bytes |
| 8.1 | PASS | POST /api/v1/imports | preview: canCommit=true, creates {"guardians":1,"children":1,"links":1,"obligations":0,"employees":0,"logins":1,"assignments":0} |
| 8.1b | PASS | POST /api/v1/imports/:id/commit | import committed (replayed=false) |
| 8.2-setup | PASS | POST /api/v1/support/backups | backup requested, id=65cfee1f-8b78-4147-a0b4-c577a15ae5cb, status=REQUESTED |
| 8.2-setup-b | PASS | GET /api/v1/support/backups | backup SUCCEEDED, archive backup-59ae7d0f-20260915T060217Z-manual-65cfee1f.tar.enc, 2 file(s) |
| 8.2 | PASS | POST /api/v1/support/restore-validations | restore validation requested id=d43f6901-08d5-457e-af14-5818896aaab0, status=REQUESTED |
| 8.2b | PASS | GET /api/v1/support/restore-validations | restore validation SUCCEEDED; report: {"mode":"validate","files":{"missing":0,"extracted":2,"mismatched":0,"referenced":2},"checks":{"accounts":5,"children":3,"nurseryName":"Walkthrough Nursery","licenseValidUntil":"2027-09-15","outstandingDebtPiastres":"181667","treasuryBalancePiastres":"1555333"},"archive":{"name":"backup-59ae7d0f-20260915T060217Z-manual-65cfee1f.tar.enc","bytes":782368,"sha256":"7f440b09f352777f0de04219661383227db5f10bf43246bcaddc8696ab0d7310"},"database":{"name":"nursery_uat_restore_check","schemaVersion":"0023_support_backups.sql","sessionsRevoked":4,"migrationsApplied":[]},"manifest":{"kind":"MANUAL","files":2,"runId":"65cfee1f-8b78-4147-a0b4-c577a15ae5cb","createdAt":"2026-09-15T06:02:17.765Z","fileBytes":218860,"schemaVersion":"0023_support_backups.sql","installationId":"59ae7d0f-a59e-458d-ae43-6db1bca4c221","releaseVersion":"uat-walkthrough"},"durationMs":1829} |


## Notable real behavior observed (not fabricated, not assumed)

- **A12 live delivery, genuinely tested for reactivity, not just connection**: row 4.1 opens a real SSE stream as the
  guardian, explicitly waits for the initial `snapshot` event the server always sends on connect
  (`apps/api/src/modules/communication/live.ts`), *then* opens a second wait for a distinct `invalidate` event,
  *then* triggers a real teacher attendance correction, and only counts the run as PASS if `invalidate` arrives
  after that trigger — so this does not just confirm the handshake works, it confirms the server actually reacts to
  a real business change within 8 seconds.
- **A09 missing vs. zero (row 3.2/3.2b)**: child one's exam score was explicitly set to `0` and independently
  re-read from the roster as `0`, and read the roster back to confirm it was **not** silently treated the same as
  child two's genuinely unrecorded (missing) result — the two states remain visibly distinct in the API response.
- **A20 bus full-settlement-only (row 5.2)**: a partial bus-fee payment was submitted and rejected server-side
  (`VALIDATION_ERROR finance.invalid`) before the full amount was submitted and accepted once; eligibility flips to
  `true` only after the full settlement.
- **A21 branch transfer moves debt, not cash (row 5.6/5.6b)**: the branch A cash balance was compared before and
  after the transfer and found unchanged, while the transfer record shows the outstanding amount now attributed to
  branch B.
- **A38 backup/restore (row 8.2/8.2b)**: a real manual backup request was picked up by the real worker process,
  produced an actual encrypted `.tar.enc` archive, and a real restore validation ran `pg_restore` into the isolated
  `nursery_uat_restore_check` database, reporting exact account/child counts, outstanding debt, treasury balance,
  and 4 sessions revoked — this is the same code path Phase 23/24 validated, exercised again here end-to-end through
  the real HTTP API rather than direct service calls.
- **N25-01 regression is implicitly covered**: this walkthrough's own admin/finance flow uses `/administration/*`
  screens' underlying APIs throughout; the actual breadcrumb-link fix itself was verified separately in
  `tests/e2e/closing.test.tsx`/`corrections.test.tsx` (see the `fix: resolve treasury breadcrumb route` commit).

## No application defects found

Every issue this driver hit during development (documented candidly, not hidden) traced back to the **driver
script's own misunderstanding of the request contract**, never to a defect in `apps/api`/`apps/web`/`packages/*`:
wrong `expectedVersion` semantics for a first-time settings save, a role name colliding with a pre-seeded default
role, a missing `users.create_parent` capability on the test's own custom role, calling a SYSTEM-only endpoint
(`learning/configure`) from a teacher session, misreading a nested response shape (`ExamClassroomDraft.entries`),
and not accounting for two endpoints that correctly return HTTP 204 (which `AuthClient.business()`'s generic
`.data` unwrap does not handle — `AuthClient.licensing()` already has this exact guard for its own namespace, which
is how the gap was found). None of these represent a security, financial, or authorization defect: every rejection
observed was the server correctly enforcing its own rules. No fix was needed in application code as a result of
this walkthrough; Step 4 of the release-closure task (fix real defects) is therefore not applicable — none were
found.

## What this does not replace

Five rows are explicitly **NOT EXECUTED**, and remain the tech lead's own required manual work, matching
[KNOWN_ISSUES.md](../../KNOWN_ISSUES.md) M24-01 and the Phase 12 conflict analysis in
[DECISIONS.md](../../DECISIONS.md):

- **7.1–7.4**: physical 360px layout, keyboard focus order, `prefers-reduced-motion` behavior, and RTL visual
  alignment all require a real rendered browser or device; no browser automation is permitted in this repository.
- **4.2b**: the *visual* rendering of dd/MM/yyyy dates and Latin-digit EGP amounts in the Arabic (RTL) layout
  requires a real rendered browser; the locale switch itself (row 4.2) and the underlying bilingual rendering logic
  are covered by the real-HTTP DOM suite (`tests/e2e/collections.test.tsx`, `tests/e2e/parent-hub.test.tsx`), which
  is re-run as part of Step 5's final gates.

This walkthrough execution also does not constitute Docker/Dokploy/TLS/reverse-proxy qualification (B24-01) or real
VPS/off-host backup destination qualification (B24-02) — see Step 6 for what those native-equivalent local checks
did and did not cover.

## Teardown

The `nursery_uat` and `nursery_uat_restore_check` databases were dropped, the api/worker processes stopped, and all
scratch directories (`private-files`, `backups`, `offsite`, `restore-check`) removed after this evidence was
captured. No production data, host, or service was touched at any point.
