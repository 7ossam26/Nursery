# Current handoff

Updated: 2026-09-15 — Phase25 COMPLETE (documentation only). No live deployment, migration, subagent or browser automation.

## Release candidate

Unchanged from Phase 24: base f108715f20f3d614643c4f92ad8ef61ceeba6459 (phase23) plus the phase24 diff (candidate hash in [candidate.json](evidence/phase24/candidate.json)). Phase 25 adds no application code, dependency, or schema change; schema remains 0023 (24 migrations including 0000).

## Files and behavior changed (Phase 25)

- New: [docs/USER_GUIDES.md](USER_GUIDES.md) — Superadmin, nursery admin/finance, teacher, and parent guides built from the real registered routes (`apps/web/src/App.tsx`), the real navigation groups (`apps/web/src/layout/navigation.ts`), and each screen's actual English/Egyptian Arabic title strings (`apps/web/src/features/*/copy.ts`, `apps/web/src/i18n/catalogs.ts`).
- New: [docs/USER_ACCEPTANCE_WALKTHROUGH.md](USER_ACCEPTANCE_WALKTHROUGH.md) — blank-result manual scenario (Superadmin setup → nursery admin setup → teacher daily work → parent experience → finance operations → access blocking → responsive/RTL/accessibility → import/restore), an A01–A38 cross-reference against ACCEPTANCE_EVIDENCE.md, every open Phase24 known issue carried forward verbatim, and the unresolved Phase12 screenshot handoff called out explicitly.
- Edited: [docs/OPERATIONS.md](OPERATIONS.md) — added a Troubleshooting table mapping the actually-implemented backup/restore/release error codes (`TARGET_NOT_CONFIGURED`, `ARCHIVE_INVALID`, `SCHEMA_AHEAD`, `CROSS_INSTALLATION`, `PG_RESTORE_FAILED`, `VERIFICATION_FAILED`, `PG_DUMP_FAILED`, `FILES_FAILED`, `ARCHIVE_FAILED`, `OFFSITE_FAILED`, `RETENTION_FAILED`, `CONFIG_MISSING`, `WORKER_RESTARTED`) to cause/action, sourced from [DEPLOYMENT_AND_BACKUP.md](DEPLOYMENT_AND_BACKUP.md).
- Edited: [README.md](../README.md) — added "For developers and future Codex sessions" (module map pointer to ARCHITECTURE.md, contracts/migrations location, `tests/helpers/*.ts` fixture reuse, and FIX/CHANGE_REQUEST/RESUME prompt usage).
- Edited: [START_HERE.md](../START_HERE.md), [docs/TRACEABILITY.md](TRACEABILITY.md) — added the two new documents to the canonical reading map / traceability note.
- Edited: [docs/KNOWN_ISSUES.md](KNOWN_ISSUES.md) — added N25-01 (see below).

## New defect found (not fixed — outside this phase's boundary)

**N25-01** (LOW, OPEN): `apps/web/src/features/finance/closing-screen.tsx:28` and `.../corrections-screen.tsx:33` link to `/administration/finance`, a route that does not exist in `apps/web/src/App.tsx` (the real Treasury accounts screen is `/administration/treasury`). A fully permitted staff account following that link lands on the generic "You cannot view this section" screen, misreporting a routing bug as a permission denial. No financial or authorization logic is involved. Recommended: `prompts/FIX.md`, Terra/Medium, in a separate session.

## Actual verification

- `git status --short` / `git diff --stat`: only the files listed above changed; two new files. No package source touched.
- `git diff --check`: clean (no whitespace errors).
- All Markdown relative links added or edited in this phase were checked programmatically to resolve to existing files (`docs/*.md`, `../README.md`, `prompts/*.md`, one code reference `../apps/web/src/App.tsx`).
- No build/type/lint/test gate was run: no `apps/*` or `packages/*` source changed, and AGENTS.md/the phase acceptance gate call for the *applicable* gate for *changed packages* — none applies here. Phase 24's full suite (PostgreSQL 185/185, units 118/118, DOM 62/62 + support 2/2, recovery 3/3, release 1/1, typecheck/lint/build/diff) remains the last executed evidence and is unaffected by this phase.
- Route/label claims in USER_GUIDES.md were verified by reading `App.tsx`, `navigation.ts`, and the relevant `copy.ts`/`catalogs.ts` source rather than assumed from the phase plan; the access-block and license-suspension message text quoted is copied verbatim from `apps/web/src/features/auth/screens.tsx` and its i18n keys.

## Remaining qualifications and next action

Unchanged live-release qualifications from Phase 24 (Docker/Dokploy build and TLS/SSE, real VPS/domain/off-host backup qualification, pinned Linux Node/npm + SIGTERM check, physical 360px/RTL/keyboard/screenshot/PWA manual review) are listed in [KNOWN_ISSUES.md](KNOWN_ISSUES.md) and carried into [USER_ACCEPTANCE_WALKTHROUGH.md](USER_ACCEPTANCE_WALKTHROUGH.md). Phase 12's screenshot handoff remains unresolved under the same conflict recorded since Phase 12 (browser automation is prohibited and no waiver was given); Phase 25 does not resolve it and its ledger status stays IN PROGRESS.

This is the last planned phase (01–25). The next real operator actions are, in order: (1) the tech lead executes `docs/USER_ACCEPTANCE_WALKTHROUGH.md` on an actual device/browser and records results; (2) a decision on the Phase 12 screenshot conflict (waive and accept scripted evidence, or authorize a specific local screenshot method) recorded in `docs/DECISIONS.md`; (3) a short `prompts/FIX.md` session for N25-01; (4) when a Docker/Dokploy host and real deployment inputs (domain, `INSTALLATION_ID`, secrets, off-host backup destination — see OPERATIONS.md "Required deployment inputs") become available, the actual Dokploy deployment and its smoke checks. No further numbered phase is defined in this plan; a new requirement should go through `prompts/CHANGE_REQUEST.md`.
