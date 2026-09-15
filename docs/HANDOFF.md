# Current handoff

Updated: 2026-09-15 — Phase25 COMPLETE (documentation only); post-Phase-25 release closure in progress in the same session (N25-01 fixed below). No live deployment, migration, subagent or browser automation.

## Release candidate

Unchanged from Phase 24: base f108715f20f3d614643c4f92ad8ef61ceeba6459 (phase23) plus the phase24 diff (candidate hash in [candidate.json](evidence/phase24/candidate.json)). Phase 25 adds no application code, dependency, or schema change; schema remains 0023 (24 migrations including 0000).

## Post-Phase-25 release closure — N25-01 fixed

Immediately after Phase 25, in the same release-closure session: `apps/web/src/features/finance/closing-screen.tsx:28` and `apps/web/src/features/finance/corrections-screen.tsx:33` now link to `/administration/treasury` (previously the unregistered `/administration/finance`). Regression coverage added: a new test in `apps/web/src/layout/navigation.unit.test.ts` statically extracts every registered `<Route path="...">` from `App.tsx` and every literal `Link to="/..."` target across `apps/web/src/features/**`, and asserts every target resolves to a registered route (verified to fail on the pre-fix source, pass after); explicit breadcrumb `href` assertions were added to `tests/e2e/closing.test.tsx` and `tests/e2e/corrections.test.tsx` (real HTTP/PostgreSQL, en and ar-EG, both already-existing bilingual suites). Verified: `npm run test:unit` 119/119 (Phase24 baseline 118 + 1 new), the two focused e2e files 4/4 real HTTP/PG passed in both locales, `npm run typecheck`, `npm run lint`, `npm run build` and `git diff --check` all passed on the actual candidate. No permission or financial business logic was touched. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) "Found during Phase 25, fixed in release closure".

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

Unchanged live-release qualifications from Phase 24 (Docker/Dokploy build and TLS/SSE, real VPS/domain/off-host backup qualification, pinned Linux Node/npm + SIGTERM check, physical 360px/RTL/keyboard/screenshot/PWA manual review) are listed in [KNOWN_ISSUES.md](KNOWN_ISSUES.md) and carried into [USER_ACCEPTANCE_WALKTHROUGH.md](USER_ACCEPTANCE_WALKTHROUGH.md). Phase 12's screenshot handoff remains unresolved under the same conflict recorded since Phase 12 (browser automation is prohibited and no waiver was given); Phase 25 does not resolve it and its ledger status stays IN PROGRESS.

This is the last planned phase (01–25); N25-01 is now fixed. The next real operator actions are, in order: (1) the tech lead executes `docs/USER_ACCEPTANCE_WALKTHROUGH.md` on an actual device/browser and records results; (2) a decision on the Phase 12 screenshot conflict (waive and accept scripted evidence, or authorize a specific local screenshot method) recorded in `docs/DECISIONS.md`; (3) when a Docker/Dokploy host and real deployment inputs (domain, `INSTALLATION_ID`, secrets, off-host backup destination — see OPERATIONS.md "Required deployment inputs") become available, the actual Dokploy deployment and its smoke checks. No further numbered phase is defined in this plan; a new requirement should go through `prompts/CHANGE_REQUEST.md`. This release-closure session continues past N25-01 into the Phase 12 conflict, an executed walkthrough and further gates; see PROJECT_STATE.md's active summary for the current point reached.
