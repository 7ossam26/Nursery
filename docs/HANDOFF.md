# Current handoff

Updated: 2026-09-13 — Phase 01 complete.

## Current task

Phase 01 is complete. Do not begin Phase 02 until the user explicitly requests it.

## Read next

1. ../AGENTS.md
2. PROJECT_STATE.md
3. ../phases/PHASE_02_bilingual_design_system.md when Phase 02 is requested
4. Relevant Phase 02 reference sections only

## Next executable action

When requested, begin Phase 02 from its stated prerequisites. Preserve the Phase 01 baseline and do not alter the local `.env` or migration history.

## Confirmed latest decisions

Three billing arrangements are supported. Monthly fees automatically generate charges; additional charges can be one-time or period-labeled without automatic recurrence. Staff record actual collection. Parent access blocking is manual and displays a nursery-contact message; blocking does not stop charges or release slots.

Homework is published by teachers, who record each child's completion. New custom checkpoints use configurable status plus optional note.

## Evidence and open work

Changed files: workspace `package.json`/`package-lock.json`, `.nvmrc`, `.env.example`, `.gitignore`, TypeScript/Vite/ESLint/Vitest/Playwright configuration, minimal `apps/api`, `apps/web`, `apps/worker`, `packages/contracts`, `packages/domain`, `packages/db`, `packages/ui`, `tests/`, `README.md`, and `docs/DEPENDENCIES.md`.

Installed runtime: Node 24.19.0 and npm 11.1.0 locally with Windows Package Manager. Local PostgreSQL service: `postgresql-x64-17`, version 17.9; target production major remains PostgreSQL 18. The ignored local `.env` contains the developer-supplied connection configuration; no credential was committed. No Docker assets were added. API port is 3000; web port is 5173.

Actual passed checks: `npm install`; `npm audit --omit=dev` (zero vulnerabilities); `npm run db:migrate` (first run applied `0000_installation_baseline.sql`, second and final runs applied nothing); `npm run test:integration` (one real PostgreSQL connectivity/rollback test passed); `npm run build`; `npm run lint`; `npm run typecheck`; `npm run test:unit` (one readiness test passed); `npm run test:e2e` (one Vitest Vite/HTTP startup test passed); and `npm run db:seed:demo` (intentionally no data). U24 explicitly forbids Playwright/browser automation in phases, so Playwright/config/spec were removed.

Remaining limitations: Phase 01 intentionally has only the installation baseline; business schemas and production deployment are later phases. PostgreSQL 17.9 is an acceptable local verifier for this foundation only; PostgreSQL 18 remains the deployment target. Persistent verification rule: use script test files only; do not use Playwright/browser automation unless the user explicitly reverses U24.

Routine implementation defaults are documented in DECISIONS.md. No additional product clarification is required to start. Exact supported dependency versions are a Phase 01 verification step.

Replace this file after the next meaningful checkpoint with changed files, actual commands/results, remaining work, and the next precise action.
