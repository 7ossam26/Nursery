# Current handoff

## Active change — ERP-V2-inspired frontend layout (2026-09-21)

COMPLETE. The standard desktop sidebar is replaced by a centered ERP-style top header; `/support/*` has a route-specific dark desktop sidebar and accessible narrow-screen drawer; parent/teacher retain the five-item mobile navigation; and the staff/system Home dashboard is split from Account profile/security controls. Nursery tokens, themes, bilingual copy, capabilities, routes and backend contracts remain authoritative; no ERP assets, dependencies, branch-switcher state or vendor footer were imported. Canonical UX/decision/PWA/user-guide documentation now reflects the current shell. Final gates: unit **153/153**, serial real-HTTP/PostgreSQL DOM **62/62**, workspace typecheck, workspace lint, production build and diff check passed. An intermediate full DOM run failed **4/62** only because old parent-flow tests still queried the removed desktop `nav.main`; the two affected files passed **7/7** after using `nav.mobile`, followed by the clean **62/62** run. The build keeps the pre-existing 904.58 kB chunk-size advisory. No browser automation or physical visual check was performed; manually review real 360px, wide desktop, English/Arabic, light/dark and keyboard behavior before deployment.

## Completed follow-up — UI consistency (2026-09-17–18)

COMPLETE. Presentation consistency was applied across every existing frontend route and nested panel; [UI_CONSISTENCY.md](UI_CONSISTENCY.md) contains the route checklist and evidence. The in-app Chromium matrix ran 1,211 checks across 38 distinct route/fallback views, System/teacher/parent sessions, en/ar-EG, light/dark, and widths 360–1920 with no measured overflow or off-screen main content. Final gates: unit 152/152; focused real-HTTP/PostgreSQL DOM 6/6; typecheck, lint, build, and diff check passed; full serial DOM 61/62, with only the same A36/A18 network-recovery dialog-timing failure reproduced on the untouched baseline. The 221 request/auth/navigation call expressions match the captured pre-pass source exactly. No backend, contracts, routes, permissions, payloads, database, dependencies, or loading/performance architecture changed. The browser, active disposable fixture, and uniquely identified abandoned preview fixture were cleaned up. No staging, commit, deployment, subagent, or direct `pgdata/` access occurred.

Updated: 2026-09-15 — Phase25 COMPLETE (documentation only); post-Phase-25 release closure COMPLETE in the same
session (N25-01 fixed, Phase 12 conflict analyzed, user acceptance walkthrough executed, final gates re-run,
Dokploy qualification recorded — detailed sections below). No live deployment, migration, subagent or browser
automation was performed at any point.

## Release candidate

Unchanged from Phase 24: base f108715f20f3d614643c4f92ad8ef61ceeba6459 (phase23) plus the phase24 diff (candidate hash in [candidate.json](evidence/phase24/candidate.json)). Phase 25 adds no application code, dependency, or schema change; schema remains 0023 (24 migrations including 0000). The post-Phase-25 release-closure work adds the N25-01 fix (two one-line screen changes plus tests) as the only application-code change; schema remains 0023.

## Final summary (post-Phase-25 release closure)

**1. VERIFIED** (real evidence, this session or reconfirmed unchanged):
- N25-01 fixed and regression-tested (real HTTP/PostgreSQL, en+ar-EG).
- User acceptance walkthrough executed for real: 88 PASS / 0 FAIL / 5 NOT EXECUTED (manual-only) — [evidence/final/WALKTHROUGH_RESULTS.md](evidence/final/WALKTHROUGH_RESULTS.md).
- Final gates re-run, none regressed: PostgreSQL 185/185, unit 119/119, DOM/UI 62/62 (0 error logs), recovery 3/3, performance all targets met, typecheck/lint/build/diff-check all passed — [evidence/final/FINAL_GATES.md](evidence/final/FINAL_GATES.md).
- Native (non-Docker) operator sequence: fresh install (24 migrations) + idempotent rerun, bootstrap, API/worker startup, health/readiness, real backup creation + real `pg_restore` restore validation with data/files/session-revocation confirmed — [evidence/final/operator-sequence.txt](evidence/final/operator-sequence.txt), [evidence/final/DOKPLOY_QUALIFICATION.md](evidence/final/DOKPLOY_QUALIFICATION.md).
- No application defect was found by the executed walkthrough.

**2. BLOCKED BY ENVIRONMENT** (unchanged from Phase 23/24, re-confirmed still true):
- B24-01: no Docker on this host — image build, Compose startup, TLS/reverse-proxy, container network isolation.
- B24-02: no real VPS/domain/off-host backup destination supplied.
- E24-01: host Node/npm differ from the pinned Linux target; SIGTERM graceful-drain untested on Windows.

**3. MANUAL CHECK REQUIRED** (the tech lead's own required action; cannot be done by this session):
- Phase 12's screenshot handoff — conflict analyzed in [DECISIONS.md](DECISIONS.md), exact capture action named there; still BLOCKED, not waived.
- The walkthrough's 5 physical-browser rows: 360px layout, keyboard focus order, `prefers-reduced-motion`, RTL visual alignment, and visual dd/MM/yyyy+EGP rendering (M24-01).
- Production-mode environment validation, an installation-ID mismatch refusal, rollback-from-older-schema, the support bundle, and maintenance-lock concurrency were not re-executed this session (their Phase 23/24 evidence stands) — a future session with Docker/VPS access should re-verify these together with the Docker items.

**4. KNOWN LIMITATIONS** (documented, not defects):
- S24-01: `npm audit` reports 2 moderate ExcelJS→uuid findings, 0 high/critical; reviewed, not blindly "fixed."
- L24-01: local performance fixture is small; re-measure at real installation scale.

**5. REMAINING DEPLOYMENT REQUIREMENTS** (before any live nursery deployment):
- A Docker/Dokploy host to actually build and run the pinned image and Compose stack.
- Real deployment inputs: domain, fresh `INSTALLATION_ID`, `SESSION_SECRET`, `POSTGRES_PASSWORD`, `BACKUP_ENCRYPTION_KEY` (kept off-server), an off-host backup destination, support contact text, and license validity/grace/capacities — see OPERATIONS.md "Required deployment inputs".
- The tech lead's device/browser pass over the walkthrough's manual rows and the Phase 12 screenshot capture.

**Final repository status: READY FOR DEPLOYMENT QUALIFICATION** — every gate this environment can run passed with real evidence; live deployment is gated only on Docker/Dokploy/VPS availability and the deployment inputs above, not on any known defect.

## Post-Phase-25 release closure — N25-01 fixed

Immediately after Phase 25, in the same release-closure session: `apps/web/src/features/finance/closing-screen.tsx:28` and `apps/web/src/features/finance/corrections-screen.tsx:33` now link to `/administration/treasury` (previously the unregistered `/administration/finance`). Regression coverage added: a new test in `apps/web/src/layout/navigation.unit.test.ts` statically extracts every registered `<Route path="...">` from `App.tsx` and every literal `Link to="/..."` target across `apps/web/src/features/**`, and asserts every target resolves to a registered route (verified to fail on the pre-fix source, pass after); explicit breadcrumb `href` assertions were added to `tests/e2e/closing.test.tsx` and `tests/e2e/corrections.test.tsx` (real HTTP/PostgreSQL, en and ar-EG, both already-existing bilingual suites). Verified: `npm run test:unit` 119/119 (Phase24 baseline 118 + 1 new), the two focused e2e files 4/4 real HTTP/PG passed in both locales, `npm run typecheck`, `npm run lint`, `npm run build` and `git diff --check` all passed on the actual candidate. No permission or financial business logic was touched. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) "Found during Phase 25, fixed in release closure".

## Post-Phase-25 release closure — user acceptance walkthrough executed

Built [tests/scripts/acceptance-walkthrough.ts](../tests/scripts/acceptance-walkthrough.ts) (real HTTP via the unmodified web client's `AuthClient`, no browser automation) and ran it against real standalone `api`+`worker` processes and a fresh disposable PostgreSQL database. Result: **88 PASS, 0 FAIL, 5 NOT EXECUTED** (physical-browser-only rows, correctly deferred to the tech lead). Covers the full cross-module story: Superadmin setup, nursery admin setup, teacher daily work (including exam zero-vs-missing), parent experience (a real SSE reactivity check), finance operations (collection, bus full-settlement rejection, expenses, transfers, payroll, branch debt transfer, closing, PDF/XLSX exports), access blocking, and import/backup/restore-validation. **No application defect was found.** Also exercised, as part of standing up the environment, the native (non-Docker) operator sequence (`env:check`, fresh `release:prepare`, idempotent rerun, `auth:bootstrap`, API/worker startup, health/readiness/static-serving) — see Step 6/KNOWN_ISSUES for how this does and does not bear on Dokploy qualification. Evidence: [docs/evidence/final/WALKTHROUGH_RESULTS.md](evidence/final/WALKTHROUGH_RESULTS.md), [walkthrough-run.log](evidence/final/walkthrough-run.log), [operator-sequence.txt](evidence/final/operator-sequence.txt). Environment fully torn down afterward.

## Post-Phase-25 release closure — final local gates re-run, none regressed

All established gates were re-run for real against the same candidate: PostgreSQL integration 33 files/**185 tests**
(identical to the Phase24 baseline), unit 31 files/**119 tests** (118 + the 1 new N25-01 regression test), DOM/UI 24
files/**62 tests** with **zero** error-level logs (Phase24's residual 2 support-fixture logs no longer appear),
recovery **3/3**, performance every target met (attendance p95 162.08ms, collection p95 98.43ms — both improved on
Phase24's 260.90ms/132.75ms baseline samples; ordinary run-to-run variance, not a claimed permanent gain),
`typecheck`/`lint`/`build`/`git diff --check` all passed, `npm audit --omit=dev` unchanged at 2 moderate/0
high-critical (S24-01, still open, still reviewed as a non-affected call path). No gate regressed. Full comparison
table: [docs/evidence/final/FINAL_GATES.md](evidence/final/FINAL_GATES.md).

## Post-Phase-25 release closure — Dokploy/production qualification (native items only)

`docker` remains absent on this host (B24-01 unchanged) — image build, Compose startup, TLS/reverse-proxy and
container network isolation could not be exercised, exactly as in Phase23/24. The native (non-Docker) run of the
real application code did newly verify, end-to-end, this session: PostgreSQL/API/worker startup, health/readiness,
real queue processing (a real backup plus two real report exports), and a real encrypted backup restored via a real
`pg_restore` into an isolated database with restored data/files and session revocation confirmed. Production-mode
environment validation, an installation-ID mismatch refusal, rollback-from-an-older-schema, the support bundle, and
maintenance-lock concurrency were **not** re-executed this session — their Phase23/24 evidence stands unchanged and
is not re-claimed here. Full itemized result: [docs/evidence/final/DOKPLOY_QUALIFICATION.md](evidence/final/DOKPLOY_QUALIFICATION.md).
**No live deployment was performed or is claimed.**

## Files and behavior changed (Phase 25)

- New: [docs/USER_GUIDES.md](USER_GUIDES.md) — Superadmin, nursery admin/finance, teacher, and parent guides built from the real registered routes (`apps/web/src/App.tsx`), the real navigation groups (`apps/web/src/layout/navigation.ts`), and each screen's actual English/Egyptian Arabic title strings (`apps/web/src/features/*/copy.ts`, `apps/web/src/i18n/catalogs.ts`).
- New: [docs/USER_ACCEPTANCE_WALKTHROUGH.md](USER_ACCEPTANCE_WALKTHROUGH.md) — blank-result manual scenario (Superadmin setup → nursery admin setup → teacher daily work → parent experience → finance operations → access blocking → responsive/RTL/accessibility → import/restore), an A01–A38 cross-reference against ACCEPTANCE_EVIDENCE.md, every open Phase24 known issue carried forward verbatim, and the unresolved Phase12 screenshot handoff called out explicitly.
- Edited: [docs/OPERATIONS.md](OPERATIONS.md) — added a Troubleshooting table mapping the actually-implemented backup/restore/release error codes (`TARGET_NOT_CONFIGURED`, `ARCHIVE_INVALID`, `SCHEMA_AHEAD`, `CROSS_INSTALLATION`, `PG_RESTORE_FAILED`, `VERIFICATION_FAILED`, `PG_DUMP_FAILED`, `FILES_FAILED`, `ARCHIVE_FAILED`, `OFFSITE_FAILED`, `RETENTION_FAILED`, `CONFIG_MISSING`, `WORKER_RESTARTED`) to cause/action, sourced from [DEPLOYMENT_AND_BACKUP.md](DEPLOYMENT_AND_BACKUP.md).
- Edited: [README.md](../README.md) — added "For developers and future Codex sessions" (module map pointer to ARCHITECTURE.md, contracts/migrations location, `tests/helpers/*.ts` fixture reuse, and FIX/CHANGE_REQUEST/RESUME prompt usage).
- Edited: [START_HERE.md](../START_HERE.md), [docs/TRACEABILITY.md](TRACEABILITY.md) — added the two new documents to the canonical reading map / traceability note.
- Edited: [docs/KNOWN_ISSUES.md](KNOWN_ISSUES.md) — added N25-01 (see below).

## New defect found in Phase 25, fixed in release closure

**N25-01** (LOW, FIXED 2026-09-15): `apps/web/src/features/finance/closing-screen.tsx:28` and `.../corrections-screen.tsx:33` linked to `/administration/finance`, a route that did not exist in `apps/web/src/App.tsx` (the real Treasury accounts screen is `/administration/treasury`). A fully permitted staff account following that link landed on the generic "You cannot view this section" screen, misreporting a routing bug as a permission denial. No financial or authorization logic was involved. Fixed above in this same session's release-closure work; see the section above for evidence.

## Actual verification

- `git status --short` / `git diff --stat`: only the files listed above changed; two new files. No package source touched.
- `git diff --check`: clean (no whitespace errors).
- All Markdown relative links added or edited in this phase were checked programmatically to resolve to existing files (`docs/*.md`, `../README.md`, `prompts/*.md`, one code reference `../apps/web/src/App.tsx`).
- No build/type/lint/test gate was run: no `apps/*` or `packages/*` source changed, and AGENTS.md/the phase acceptance gate call for the *applicable* gate for *changed packages* — none applies here. Phase 24's full suite (PostgreSQL 185/185, units 118/118, DOM 62/62 + support 2/2, recovery 3/3, release 1/1, typecheck/lint/build/diff) remains the last executed evidence and is unaffected by this phase.
- Route/label claims in USER_GUIDES.md were verified by reading `App.tsx`, `navigation.ts`, and the relevant `copy.ts`/`catalogs.ts` source rather than assumed from the phase plan; the access-block and license-suspension message text quoted is copied verbatim from `apps/web/src/features/auth/screens.tsx` and its i18n keys.

## Remaining qualifications and next action

Unchanged live-release qualifications from Phase 24 (Docker/Dokploy build and TLS/SSE, real VPS/domain/off-host backup qualification, pinned Linux Node/npm + SIGTERM check, physical 360px/RTL/keyboard/screenshot/PWA manual review) are listed in [KNOWN_ISSUES.md](KNOWN_ISSUES.md). The user acceptance walkthrough's script-executable rows are now done (see above); its 5 physical-browser rows and Phase 12's screenshot handoff remain the tech lead's own required manual work. Phase 12's screenshot handoff remains unresolved under the same conflict recorded since Phase 12 (browser automation is prohibited and no waiver was given); Phase 25 does not resolve it and its ledger status stays IN PROGRESS. A post-Phase-25 conflict analysis in [DECISIONS.md](DECISIONS.md) confirms it cannot be resolved from existing repository evidence and names the exact manual capture action; it remains BLOCKED (manual), not waived.

This is the last planned phase (01–25); N25-01 is now fixed. The next real operator actions are, in order: (1) the tech lead performs the exact manual screenshot capture named in `docs/DECISIONS.md` to close the Phase 12 conflict (or explicitly waives it there); (2) the tech lead performs the walkthrough's 5 remaining physical-browser rows (the script-executable rows are already done — see the Final summary above); (3) when a Docker/Dokploy host and real deployment inputs (domain, `INSTALLATION_ID`, secrets, off-host backup destination — see OPERATIONS.md "Required deployment inputs") become available, the actual Dokploy deployment and its smoke checks. No further numbered phase is defined in this plan; a new requirement should go through `prompts/CHANGE_REQUEST.md`. This release-closure session's achievable work is complete; see the Final summary above and PROJECT_STATE.md for the full evidence trail.

## UI/UX redesign handoff (2026-09-17)

The frontend now ships light and dark themes, a rebuilt shell and a shared primitive/motion system; see [PROJECT_STATE.md](PROJECT_STATE.md) "Frontend UI/UX redesign" for the verified gate numbers. Three things the next session should know:

1. Run the DOM suite **serially** for evidence: `npx vitest run --config vitest.e2e.config.ts --no-file-parallelism --maxWorkers=1`. The default 24-worker run produces contention failures on this host.
2. `tests/e2e/network-recovery.test.tsx` A36/A18 is a pre-existing timing flake (fails on the untouched baseline too). It is not caused by, and was not fixed by, the redesign.
3. Any new button in the shared header must have an accessible name distinct from every screen's own buttons — several e2e files use index-based `getAllByRole` queries that a colliding name silently shifts. `apps/web/src/layout/shell-copy.ts` holds the shell strings.

Suggested follow-up in a separate scoped session: replace the 23 `<p role="status">{t('state.loading')}</p>` placeholders with the already-built `Skeleton` (same role, same text, shimmer instead of plain text), then re-run the suite serially.
