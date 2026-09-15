# Current handoff

Updated: 2026-09-15 — Phase24 COMPLETE. Phase25 NOT STARTED. No live deployment, migration, subagent or browser automation.

## Release candidate

Base: f108715f20f3d614643c4f92ad8ef61ceeba6459 (phase23), initially clean. Candidate is the uncommitted phase-owned diff. [candidate.json](evidence/phase24/candidate.json) hashes359 source/test/configuration files, aggregate SHA-256 c6697d361125bf1b5602ae2b427227cbe2ecf183f8f4443b69f8fc67988732a6; documentation/phase files are excluded. Schema remains0023 (24 migrations including0000); dependencies unchanged.

## Files and behavior changed

- API attendance routes/service and contracts: bounded attendance-only page projection with existing child/policy/configuration locks and lazy snapshots; optional draft/no-class offset. Learning service: scoped classroom metadata independent of child pagination. Exam routes/service/contracts: paged rosters, submitted-child validation beyond100, all-page aggregate reopening, page-scoped no-exam. Licensing service: serial queries on one transaction client.
- Web attendance/exams screens: existing classroom controls now reach every authorized classroom and successive100-child pages. Existing publication, idempotency and bilingual controls retained; no financial formulas changed.
- Verification: package.json test:release; vitest.release.config.ts; tests/release/performance.test.ts; tests/helpers/query-plans.ts; integration/e2e release-rosters tests. New HTTP drain helper plus auth/http-client helper changes handle requests still connecting at cleanup. Authentication/network tests fix real-hashing deadline and reconnect-event races. Support UI's separate API also drains and asserts zero500s after closure.
- Docs: DECISIONS D52, TRACEABILITY, PROJECT_STATE, ACCEPTANCE_EVIDENCE, KNOWN_ISSUES and docs/evidence/phase24 candidate/measurement/query-plan/transcript artifacts.

## Actual verification

Commands and failed/interrupted attempts are fully listed in [ACCEPTANCE_EVIDENCE.md](ACCEPTANCE_EVIDENCE.md); durable output in [verification.txt](evidence/phase24/verification.txt). Logs remain in %TEMP%/nursery-phase24-*.log.

- DATABASE_URL=postgresql://jo@127.0.0.1:55421/postgres; disposable PostgreSQL18.4, isolated schemas plus separate whole databases/files for recovery. Cluster remains running; no live data used.
- npm run test:integration -- --maxWorkers=2:33 files/185 passed,561.12s. Baseline183 and focused29 also passed.
- npm run test:unit:31/118,37.66s. npm run test:recovery:1/3,75.59s. npm run test:release alone:1/1,74.26s. Local p95ms: outstanding264.61, attendance260.90 (before2346.44 failed), guardian67.04, collection132.75, live1196.90; all measured targets passed, no VPS/paint claim.
- npm run test:e2e -- --maxWorkers=1:24/62,697.56s. Two logged errors came from support's separate API shutdown; subsequent isolated support.test.tsx rerun1/2,49.69s passed with zero500s after closure. Shared drain focused children/rosters2/5 and authentication/network2/8 passed. Product source unchanged by these final teardown fixes.
- npm run typecheck, npm run lint, npm run build, focused harness tsc and git diff --check passed. Build retains Vite's existing >500kB warning. Final review found only phase-owned changes and no accidental secrets.
- npm audit --omit=dev --json exits1:2 moderate ExcelJS→uuid findings,0 high/critical. S24-01 remains open; installed ExcelJS calls v4 while the advisory concerns v3/v5/v6 buffer bounds. No claim of a clean audit.

## Remaining qualifications and next action

Live release remains withheld: Docker/Dokploy image/entrypoint/TLS/SSE checks, actual VPS/domain/off-host backup qualification, pinned Node24.19.0/npm11.1.0 Linux runtime and SIGTERM checks remain blocked/not run. Host is Windows with Node25.2.1/npm11.6.2. Physical360px RTL/LTR/keyboard/screenshots/PWA install-update-offline/private-cache checks remain user-led; Phase12 screenshots remain unresolved under D39. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

The next executable phase is25 when requested: read its phase file and listed references, create operator guides and the user-led final walkthrough using this evidence, and keep the unresolved qualifications visible. Record actual device/environment outcomes; do not pre-mark manual or live release checks passed. Do not deploy or start Phase25 automatically.
