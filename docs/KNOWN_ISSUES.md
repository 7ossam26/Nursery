# Known issues — Phase24 candidate

Updated2026-09-15. Phase24 verification is complete; live-release qualifications remain open. Severity describes release impact, not whether a script is green. No issue below authorizes live deployment.

## Found during Phase 25, fixed in release closure

| ID | Severity/status | Reproduction/evidence | Resolution |
|---|---|---|---|
| N25-01 | LOW / FIXED (2026-09-15, post-Phase-25 release closure) | `apps/web/src/features/finance/closing-screen.tsx:28` and `apps/web/src/features/finance/corrections-screen.tsx:33` linked to `/administration/finance`, which is not a route registered in `apps/web/src/App.tsx` (the actual Treasury accounts screen is `/administration/treasury`). A staff account with full Treasury permission that followed this link landed on the generic "You cannot view this section" screen instead, which misreported a routing bug as a permission problem. No data was at risk; no financial/authorization logic was involved. | Both links now point at `/administration/treasury`. Regression coverage: `apps/web/src/layout/navigation.unit.test.ts` (new test statically extracts every registered `<Route path="...">` from `App.tsx` and every literal `Link to="/..."` target across `apps/web/src/features/**` and asserts each target resolves to a registered route — this test fails on the pre-fix source and passes after it) plus explicit breadcrumb `href` assertions in `tests/e2e/closing.test.tsx` and `tests/e2e/corrections.test.tsx` (real HTTP/PostgreSQL, en and ar-EG). Verified: `npm run test:unit` 119/119 (+1 over the Phase24 baseline), the two focused e2e files 4/4 real HTTP/PG in en+ar-EG, `npm run typecheck`/`lint`/`build` and `git diff --check` all passed. No permission or financial logic changed. |

## Open external/manual items

| ID | Severity/status | Reproduction/evidence | Required resolution |
|---|---|---|---|
| B24-01 | HIGH / BLOCKED environment; live release withheld | `Get-Command docker` finds no executable. Phase23+24 cannot run actual image build, compose startup/entrypoints, Dokploy/Traefik TLS/SSE or container PostgreSQL tools on this host. YAML/static checks are not container execution. | Operator provides a Docker/Dokploy test host; build pinned image, start a fresh isolated deployment and exercise health/auth/worker/tooling/TLS/SSE. No live nursery action is implied. |
| B24-02 | HIGH / NOT RUN target-environment qualification | No actual VPS/domain/operator secrets/remote backup service was supplied. Local latency and directory-copy tests cannot establish target capacity or off-host failure recovery. | Measure target fixture/concurrency, configure encrypted off-host backup and validate isolated restore there. |
| M24-01 | MEDIUM / NOT RUN manual product review | Repository prohibits browser automation. jsdom/CSS tests cannot establish physical360px layout, screenshots, browser paint latency, PWA install/update/offline shell or cache contents. Phase12 screenshot handoff remains unresolved. | User-led Phase25 walkthrough in English/Egyptian Arabic on actual devices; record observed results/screenshots. Do not mark Phase12 complete merely because Phase24 scripts pass. |
| E24-01 | MEDIUM / NOT RUN pinned-runtime gate | Host Node25.2.1/npm11.6.2 differ from Node24.19.0/npm11.1.0 pins. Windows cannot deliver the target SIGTERM drain semantics. | Re-run release gate inside pinned Linux image; exercise SIGTERM draining. Existing HTTP/SSE close/restart tests cover only their observed paths. |
| L24-01 | LOW / known validation limit | Performance fixture has one active staff session, one guardian session,100-row attendance and small homework history; cold snapshot creation still invokes shared per-child snapshot work. | Expand workload/retained history and distinct active sessions during actual installation sizing. Local results are not unspecified VPS promises. |
| S24-01 | MODERATE / OPEN dependency advisory | `npm audit --omit=dev` exits1 with2 moderate package findings,0 high/critical: ExcelJS→uuid, [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq), missing buffer bounds checks in v3/v5/v6. Actual installed ExcelJS source imports only v4 in `lib/xlsx/xform/sheet/cf-ext/cf-rule-ext-xform.js`; no affected-call use was found in that source scan. This is a bounded call-site observation, not a clean dependency audit. | Review a compatible upstream fix/override before release; do not blindly apply npm's proposed major downgrade to ExcelJS3.4.0. Audit remains nonzero. |

## Resolved diagnostic issue

- T24-01 — MEDIUM / FIXED: the second full DOM run reproduced an exams request reaching an ended fixture pool. Server-side counters missed requests still connecting over TCP. Shared test HTTP transport now tracks outbound requests and fixture close drains them after React cleanup. New roster assertions check zero500s after close. Children/rosters passed5/5; the full suite passed62/62 with two remaining logs from support's separate API. Its own teardown now reuses the same drain and its final focused rerun passed2/2 with zero500s asserted after closure and no internal-error logs. Production shutdown/error handling is unchanged.

## Reproduced and fixed during Phase24

| ID | Severity | Reproduction before fix | Resolution/evidence |
|---|---|---|---|
| R24-01 | HIGH performance | Run `npm run test:release` with defaults: attendance p95=2346.44ms, failing500ms; each child calculated a full daily report including homework. | Bounded attendance projection, shared policy/child/configuration locks and existing lazy snapshots; candidate p95=260.90ms after fix. Existing history/configuration/correction-race/rollback tests pass. |
| R24-02 | HIGH missing workflow | Put101 active children in the first classroom plus a child in a second authorized class. Attendance/exam screens derived classes from `learning/roster?offset=0`; both drafts capped at100 without paging. Exam result validation and reopening also considered only that first page. | Scoped classroom metadata, bounded page offsets and UI controls, submitted-child roster validation and all-page aggregate reopening. PG release-rosters2/2 and bilingual DOM release-rosters2/2 passed; final PostgreSQL185/185 passed; full DOM62/62 passed. No permission relaxation or destructive history rewrite. |
| R24-03 | LOW compatibility | Loading licensing context emits pg8.23 deprecation because Promise.all issues concurrent queries on one transaction client. | Serial awaits on the same connection; licensing7/7 and full focused29/29 pass; final PostgreSQL185/185 passed. |

## Test-development failures (not hidden passes)

Initial performance fixture403 was an incorrect guardian use of a staff-only history endpoint; corrected to permitted homework history. The first attendance optimization had an ambiguous SQL join:6 failed/14 passed, corrected, then29/29 passed. New DOM fixture initially logged teardown500s; final shared fixture now drains pending outbound HTTP requests and asserts zero server500s after closing. Their logs and final results are listed in [ACCEPTANCE_EVIDENCE.md](ACCEPTANCE_EVIDENCE.md).
