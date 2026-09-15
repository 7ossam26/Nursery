# Phase 24 acceptance evidence

Verification date: 2026-09-15. **Phase24 gate COMPLETE. Live release remains withheld for the documented qualifications.** This is verification evidence, not authorization to deploy.

## Candidate and environment

- Base commit: `f108715f20f3d614643c4f92ad8ef61ceeba6459` (`phase 23`), initially clean. Candidate is that commit plus the Phase24 working-tree changes; no commit or live release was created. The 359-file source/test/configuration manifest is [candidate.json](evidence/phase24/candidate.json), SHA-256 `c6697d361125bf1b5602ae2b427227cbe2ecf183f8f4443b69f8fc67988732a6` (excludes documentation/phase files; hashing method included).
- Windows10 kernel10.0.22621, Intel Core i7-7820HQ2.90GHz,8 logical CPUs,15.86GiB RAM; host Node25.2.1/npm11.6.2. Production pins remain Node24.19.0/npm11.1.0. Runtime mismatch is explicitly outstanding.
- Real disposable PostgreSQL18.4 on `127.0.0.1:55421`, database `postgres`, isolated random schemas for ordinary tests; separate disposable databases/directories for recovery. `max_locks_per_transaction=512` inherited from the verified Phase23 cluster. No production data. API service tests use real transactions; DOM tests use jsdom plus loopback HTTP, not a browser.
- Schema remains `0023_support_backups.sql` (24 migrations including0000). No migration was added or rewritten. The final manifest adds test-only teardown tracking after the latency run; measured production files are unchanged.
- No Docker executable, Dokploy endpoint, live nursery domain/credentials or actual VPS is available. Those checks are BLOCKED, not inferred from YAML or tests. No subagent, browser automation, live deployment or real external message was used.

## Commands and results

All database commands below used `$env:DATABASE_URL='postgresql://jo@127.0.0.1:55421/postgres'`. Logs are `%TEMP%/nursery-phase24-*.log`; durable [command transcripts](evidence/phase24/verification.txt), summary and measurements are retained beside this document. Exit codes, counts and timings are observed, not planned.

| Command | Result | Log suffix |
|---|---|---|
| `npm run test:integration` on the starting source | PASS,32 files/183 tests,240.51s | integration-baseline |
| `node node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts tests/integration/attendance.test.ts tests/integration/learning.test.ts tests/integration/licensing.test.ts tests/integration/exams.test.ts tests/integration/release-rosters.test.ts` | PASS,5 files/29 tests,68.27s | focused2 |
| `npm run test:release` before the attendance fix | FAIL: attendance p95 exceeded500ms; other targets passed | performance-baseline2 |
| `npm run test:release` after the attendance fix | PASS,1/1,69.95s | performance-final |
| `npm run test:release` with final query-plan capture, run alone | PASS,1/1,74.26s; every target passed | performance-candidate |
| `npm run test:e2e -- --maxWorkers=1 tests/e2e/release-rosters.test.tsx tests/e2e/attendance.test.tsx tests/e2e/exams.test.tsx` | PASS,3 files/6 tests,176.73s; teardown subsequently drained pending requests | dom-focused |
| `npm run test:unit` | PASS,31 files/118 tests,37.66s | unit |
| `npm run typecheck` | PASS, final source | typecheck-final |
| `npm run lint` | PASS | lint |
| `npm run test:integration -- --maxWorkers=2` | PASS,33 files/185 tests,561.12s | integration-final |
| `npm run test:e2e -- --maxWorkers=1` first full run | FAIL,22 files passed/2 failed,60 tests passed/2 failed,764.11s; test-only timing fixes below | dom-final |
| `node node_modules/vitest/vitest.mjs run --config vitest.e2e.config.ts tests/e2e/authentication.test.tsx tests/e2e/network-recovery.test.tsx --maxWorkers=1` | PASS,2 files/8 tests,72.84s | dom-fixes |
| `npm run test:e2e -- --maxWorkers=1` second full run | INTERRUPTED exit1 after fixture diagnostics proved a request reached an ended pool; no final pass count | dom-candidate |
| `node node_modules/vitest/vitest.mjs run --config vitest.e2e.config.ts tests/e2e/release-rosters.test.tsx tests/e2e/children.test.tsx --maxWorkers=1` | PASS,2 files/5 tests,74.18s; zero internal-error logs | dom-drain |
| `npm run test:e2e -- --maxWorkers=1` final full run with shared client drain | PASS,24 files/62 tests,697.56s; two logs from the separate support fixture, addressed below | dom-release |
| `node node_modules/vitest/vitest.mjs run --config vitest.e2e.config.ts tests/e2e/support.test.tsx --maxWorkers=1` | PASS,1 file/2 tests,49.69s; zero500s asserted after shutdown, no internal-error logs | dom-support-final |
| `npm run build` | PASS; existing Vite >500kB chunk warning | build |
| `npm run test:recovery` | PASS,1 file/3 tests,75.59s | recovery |
| `git diff --check` | PASS, final reviewed diff | direct output |
| `node node_modules/typescript/bin/tsc -p output/phase24/tsconfig.json` | PASS for new release/PG test harness and query-plan helper | harness-types-final |
| `npm audit --omit=dev --json` | FAIL exit1:2 moderate package findings,0 high/critical; S24-01 remains open | audit.json |

Earlier failed attempts are preserved: the initial performance fixture incorrectly called staff-only attendance history using a guardian session (403); it was changed to the actual permitted homework-history endpoint without weakening authorization. The first bounded attendance query used an ambiguous `USING(configuration_id,definition_id)` join (6 failed attendance tests/14 passed); explicit join columns corrected it, and the focused final gate passed29/29. The new DOM fixture initially closed while requests were pending and logged teardown500s despite assertions passing; the new fixture now drains requests and asserts zero server500s; diagnostic rerun passed2/2 in47.98s. The first full DOM run failed the English password-reset assertion at the default1s deadline and the Arabic reconnect click after a background poll had already closed the dialog. A focused auth diagnostic failed2/4 at the same deadline. The password-reset assertion now waits up to15s for real success; reconnect opens the simulated transport and dispatches the Retry click in the same turn before awaiting recovery. No production fallback or assertion removal. The affected suites passed8/8. The second full run proved the server-only counter could be zero while a TCP request was still connecting: a late exams request reached an ended pool. It was interrupted to fix shared test teardown. The HTTP adapter now tracks requests by origin before they connect; fixture close drains these requests after React cleanup, then closes the API/database. The new roster test asserts zero500s after closure. Focused children/roster checks passed5/5 with no internal-error logs; the full suite passed62/62 with only two remaining support-fixture errors. That test owns a separate API; its teardown now reuses the same drain and checks zero500s after close. Its focused rerun passed2/2 with zero500s asserted after shutdown and no internal-error logs. No unrelated suite was repeated for that isolated test-only teardown change. Production behavior is unchanged. Manual/target review remains open.

## A01–A38 scenario matrix

`PG` below means files under `tests/integration/`; `DOM` means `tests/e2e/`. Final PG evidence is the actual185-test run, not a phase-plan claim. Final full DOM evidence is62/62; the isolated support teardown follow-up is reported separately. Every row inherits the candidate/environment above. Issue references resolve to [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

| ID | Executed scenario and source | Evidence/status |
|---|---|---|
| A01 | Foreign branch child/detail/list/file and scoped row+aggregate/export refusal: PG organization,children,finance,report-exports,reports | Final PG PASS |
| A02 | Exact teacher classes; no scope expansion; child101 and second-class reachability: PG organization,learning,release-rosters; DOM release-rosters | Final PG+focused PASS; R24-02 fixed |
| A03 | Siblings/shared child, distinct guardian links, one ledger: PG children,collections,imports | Final PG PASS |
| A04 | Last-slot concurrent onboarding/imports: PG licensing,children,imports | Final PG PASS; real competing transactions, one winner |
| A05 | Disable/reactivate/release/restore, archival reservations and credential expiry: PG licensing,children,authentication; DOM support | Final PG and DOM PASS |
| A06 | Block existing parent session; API/receipt/SSE/visible-data revocation; billing continues: PG billing,communication,collections; DOM parent-hub,collections,network-recovery | Final PG PASS; DOM PASS |
| A07 | Cairo grace/suspension/renewal, no seat/history loss: PG licensing; date-boundary domain units | Final PG+focused PASS |
| A08 | Configuration effective next date; old snapshot labels preserved, lazy historical reads: PG learning,attendance | Final PG+focused PASS |
| A09 | Present/Absent/N-A, missing versus zero, retained reporting: PG attendance,learning,exams,report-operational,release-rosters | Final PG+focused PASS |
| A10 | Two stale correcting teachers, immutable predecessor, one successor; exam reopening across pages: PG learning,attendance,exams,release-rosters | Final PG+focused PASS |
| A11 | Shared homework with child-specific outcomes and guardian read-only: PG homework,report-operational; DOM homework | Final PG PASS; DOM PASS |
| A12 | Actual HTTP SSE invalidation/reconnect/link loss and fresh reads: PG communication; DOM parent-hub | Final PG PASS; local measured publication-to-fresh-read <5s; browser paint NOT RUN |
| A13 |10,000→8,000 tuition, equal4,000 shares, no cash from approval: PG billing | Final PG PASS |
| A14 |100.01 divided into33.34/33.34/33.33; large exact integer amounts: PG billing,finance and money units | Final PG PASS |
| A15 |Due31 clamping/short months/leap year, fixture dates, duplicate workers and restart: PG billing,billing-worker; recurrence units | Final PG PASS |
| A16 |12,000 fixed agreement with3 subordinate installments, counted once: PG billing,finance | Final PG PASS |
| A17 |Additional service-period label never creates recurring charges: PG billing | Final PG PASS |
| A18 |Lost response, same-key retry/status returns original receipt and one cash posting: PG finance,collections; DOM finance,network-recovery | Final PG PASS; DOM PASS |
| A19 |Two collectors settle one remaining amount, no negative balance: PG finance | Final PG PASS; actual concurrent transactions |
| A20 |Bus500 rejects250, accepts500 once, replay adds no cash: PG transport,finance | Final PG PASS |
| A21 |4,000 charge, A collects1,500, debt2,500 moves to B; historical receipts/cash remain at source: PG child-transfers,reports | Final PG PASS |
| A22 |Payment/transfer and recurrence/transfer contention, consistent committed order: PG child-transfers | Final PG PASS; controlled PostgreSQL races |
| A23 |Pending expense has no cash effect; one later outflow under retries/races: PG spending | Final PG PASS |
| A24 |Paired transfer legs net zero; audit failure rolls back all legs: PG spending,reports | Final PG PASS |
| A25 |Refund available-credit bounds, append-only correction, counted-date integrity: PG corrections,closing | Final PG PASS |
| A26 |Salary5,000−advance1,000−deduction300=final3,700; actual cash4,700: PG payroll,reports | Final PG PASS, independent ledger reconciliation |
| A27 |Concurrent advances/deductions exceed cap together: PG payroll | Final PG PASS, no negative payable |
| A28 |One full payout/month and separate prior unpaid month: PG payroll | Final PG PASS |
| A29 |Opening debt import increases receivables only, no cash/receipt: PG imports | Final PG PASS |
| A30 |Preview drift in quota/scope/data, atomic commit/replay: PG imports | Final PG PASS |
| A31 |Finance/learning/transport/health disable governs writes/jobs/parent payloads and retains scoped history: PG billing,learning,safety,transport,finance-reminders,report-exports | Final PG PASS |
| A32 |Trip fee and consent independent; roster eligibility and cancellation credit: PG transport; DOM transport | Final PG PASS; DOM PASS |
| A33 |Unauthorized pickup/unconfirmed call/restriction conflict rejected; no departure field: PG safety | Final PG PASS |
| A34 |Deduplicated finance notices and current finance/notify links; no financial payload leaks: PG finance-reminders,communication | Final PG PASS |
| A35 |Theme contrast, scope guards, reduced-motion/responsive CSS, bilingual keyboard/axe DOM workflows: unit theme/navigation and DOM suites | PARTIAL: scripts passed; physical360px RTL/LTR, focus/layout/screenshots NOT RUN (M24-01) |
| A36 |Offline form state retained in memory, writes refused, uncertain payment resolved and original operation reused: DOM network-recovery; service-worker units | PARTIAL: units+focused DOM PASS; full DOM PASS; real browser offline shell/cache/update NOT RUN (M24-01) |
| A37 |Private IDs/path attacks, malformed documents, XLSX formulas/ZIP limits and safe exported cells: PG children,expense-documents,imports,report-exports; import units | Final PG PASS |
| A38 |Encrypted whole-database+file restore, populated target reset, valid archive missing-file refusal, login/ledger/settings, older-schema migration and worker restart | PASS, candidate recovery3/3 on separate disposable databases and file directories |

## Cross-module and privacy review

Actual installed modules in `apps/api/src/app.ts`, application routes in `apps/web/src/App.ts`, worker imports, contracts and migrations correspond to R01–R16. Requirement mapping remains in [TRACEABILITY.md](TRACEABILITY.md). Inspection and tests cover:

- Session/CSRF/origin guards before API handlers; services reconstruct policy inside transactions. Dynamic role names do not grant access; reserved SYSTEM capabilities, assigned branches/classrooms and guardian links remain distinct.
- Direct child/file IDs, historical receipt scopes, report aggregates, saved export creator/scope/current-child checks, expiry, private attachment headers and no public storage routes. Worker authorization is revalidated before generation. Account/scope/link revocation applies on subsequent reads/downloads; SSE sends only empty invalidations and closes on revalidation.
- Theme/module/support/release controls retain reserved capabilities. Slot expiry/block/archive do not invoke release; only explicit SYSTEM release does. Import/onboarding/payroll reuse provisioning services. Financial sums/allocations still use the existing exact canonical services/views and atomic operation records.
- Published learning chains, exam zero/missing values, per-child homework, bus full settlement, debt ownership and original cash attribution survive cross-module reporting. Focused release tests exercise pages omitted by earlier small fixtures.
- R17 search of routes/tables/source found no excluded camera/chat/complaints/meal/media/employee-attendance/GPS/shared-tenant/offline-write feature. Matches were comments, deny headers, animation names and onboarding identifiers. The `__preview` component gallery is development-only; production excludes it. `db:seed:demo` is an explicitly no-op command and is not evidence of demo data or implementation. Migration0004's old branch-transfer prohibition is superseded by0017; historical migrations were preserved.

## Measured performance

`npm run test:release` creates actual domain data, not mock query results. Defaults configurable via `PERF_CHILDREN`, `PERF_STAFF`, `PERF_CONCURRENCY`, `PERF_SAMPLES` (validated ranges). Fixture:2 branches,3 classes,300 children,30 guardian accounts,50 reserved staff accounts,300 obligations,100 attendance records,1 retained homework assignment. Active workload: five in-flight requests using one SYSTEM session for staff work and one guardian session for history,100 samples/type,5 warmups per read. Collections commit100 distinct receipts; independent finance reconciliation passes. Static staff count does not imply50 active sessions.

| Measure | Before p95(ms) | After p95(ms) | Target/result |
|---|---:|---:|---|
| Outstanding report20-row page |152.78|264.61|<500 PASS |
| Attendance100-row page |2346.44|260.90|<500 initially FAIL; fixed |
| Guardian homework history |68.15|67.04|<500 PASS |
| Actual collection commit |130.04|132.75|<1000 PASS |
| Publication→SSE invalidation→fresh scoped read (10 samples) |1152.16|1196.90|Every sample<5000 PASS |

Nearest-rank percentiles. Fastify inject timings include authentication, SQL, locks, commit and serialization; exclude network/TLS. Live measurement uses loopback HTTP and an authenticated service fresh read, excludes browser paint. This is warm local evidence with a small retained history, not cold-start capacity,50 active users or a Hostinger/VPS guarantee. Durable [baseline](evidence/phase24/performance-before.json), [candidate measurements](evidence/phase24/performance.json) and [EXPLAIN ANALYZE/BUFFERS plans](evidence/phase24/query-plans.json) include outstanding/attendance reports, actual attendance draft queries and guardian homework history. Plans are captured after latency sampling so instrumentation does not inflate request measurements. Observed EXPLAIN execution times: outstanding report47.84ms, attendance report4.98ms, the four attendance draft statements12.72/0.07/6.66/0.05ms, and three guardian-history statements0.07/0.09/0.03ms. These are isolated explain executions, not request percentiles. One report maximum was567.54ms while its measured p95 passed264.61ms; targets do not promise every request under500ms. The concrete bottleneck was repeated full daily/homework computation inside every attendance row. Cold missing snapshots intentionally continue through the shared snapshot service.

## Setup, migration, recovery and manual handoff

- Fresh isolated schemas are actually migrated from empty through0023 by every domain fixture. Auth-command tests execute bootstrap/recovery via private stdin; no secret is printed. Upgrade tests execute the migration CLI from six retained earlier schema states and rerun idempotently with identities/roles/reservations preserved.
- Core workflows are exercised through existing bilingual real-HTTP DOM suites (onboarding, learning, collections, expenses, payroll, transfer, closing, reports, import, support) and integrated PostgreSQL report/payroll/transfer fixtures. This does not claim a single completed human walkthrough.
- Candidate isolated whole-database restore passed3/3: database/files/login/settings/ledger and older-schema forward migration/worker restart, plus refusal paths. Container fresh install/entrypoint and target TLS/SSE are BLOCKED (B24-01). Real VPS capacity, remote backup destination and operator secrets remain deployment inputs (B24-02).
- Phase25 is still NOT STARTED. The user-led walkthrough should follow TESTING_AND_ACCEPTANCE's final manual sequence: Superadmin license/theme/custom roles; two branches/classrooms/families; attendance/exam/homework+correction; parent live/balances; collection/expense/advance/payroll/child transfer/closing/PDF-XLSX; block/unblock; import and isolated restore. Include en/ar-EG,360px, keyboard/focus, reduced motion, installation/update/offline shell/private-cache inspection, and the newly added second roster page. Record build, browser/device, steps, observed result and issue; nothing here pre-approves that walkthrough.

## Phase gate decision

Phase24 is COMPLETE: all38 scenarios have executed evidence or explicit partial/not-run reasons; the reproduced product defects R24-01–03 and test-fixture defect T24-01 are fixed and verified. Empty-schema migration, core HTTP/DOM workflows and isolated whole-database recovery were demonstrated. The final changed-file review found only phase-owned changes, no new migration/dependency version changes and no accidental secrets; a bounded private-key/provider-token/credential-bearing-URL scan found no matches. Source identity is retained above; documentation is excluded from its digest.

This closes the verification phase, with live-release blockers B24-01/B24-02 and manual/runtime/dependency qualifications retained in KNOWN_ISSUES. A35/A36 remain partial for physical browser review. Phase12 is still awaiting its screenshot handoff. Next is Phase25 operator guides, user walkthrough and final handoff; it has not started. No live deployment is authorized or claimed.
