# Current handoff

Updated: 2026-09-14 — Phase 08 complete.

## Next executable action

Stop. Begin Phase 09 — Attendance and daily classroom reports — only when requested. Read AGENTS.md, PROJECT_STATE.md, this handoff, the Phase 09 file and its named references. Reuse the adapter transaction protocol in CHECKPOINT_ENGINE.md. All Phase 08 changes remain uncommitted; the repository was clean before this phase (the older Phase 07 handoff's uncommitted-work claim was stale).

## Delivered contracts

CHECKPOINT_ENGINE.md documents configuration/status identities and immutable versions, next-Cairo-date selection, lazy historical snapshots and progress, publication API, correction chain, operation replay, scoped outbox, adapter protocol and limitations. D34 records concrete defaults, including CUSTOM_CHECKPOINTS immediate visibility control. API_AND_DATA_CONTRACTS.md and DAILY_LEARNING.md link the implemented engine.

Migration 0006_learning.sql follows 0005: checkpoint_configurations, checkpoint_definitions, checkpoint_versions, checkpoint_statuses, checkpoint_status_versions, daily_snapshots, daily_slots, learning_events, learning_operations and learning_change_outbox. Immutable triggers retain history; composite predecessor FK and unique slot/revision/successor constraints enforce one correction chain. Seeded outcomes match DAILY_LEARNING.md. Config and snapshot history do not change on module disable; current daily responses hide disabled slots, explicit staff history retains access.

SYSTEM alone has learning.configure. Assign learning.read and learning.publish to authorized roles through existing role management; migration does not broaden roles. New CUSTOM_CHECKPOINTS module starts enabled. Public learning mutation endpoints accept custom status and optional note only; specialized built-in payloads remain unavailable. Future built-in services call ChildService.withPolicy, LearningService.operation, authorizePublications and appendInTransaction in one transaction, including their specialized payload and extra authorization. Do not bypass replay authorization or independently commit detailed records.

## Changed files

- packages/contracts/src/learning.ts and learning.unit.test.ts: strict bounded inputs, mappings, response types and progress; index.ts exports; organization.ts capability keys; licensing.ts new module and disable impact.
- packages/db/src/migrations/0006_learning.sql: schema, constraints, immutable triggers, capabilities/module, bilingual built-in seeds.
- apps/api/src/modules/learning/{service,routes}.ts and apps/api/src/app.ts: configuration, current context/roster, scoped day/history reads, publish/transition/correction/batch actions, idempotency, audit/outbox and internal adapter contract.
- apps/web/src/features/learning/{copy,screens}.tsx/ts (copy.ts and screens.tsx): bilingual configuration, day bar, individual publish/correction, history, classroom review/exception form; App.tsx routes; auth/screens.tsx navigation; licensing/copy.ts module labels; i18n/catalogs.ts merges; components/Icon.tsx safe star icon; styles.css reuses status/theme tokens and responsive fields.
- tests/helpers/learning.ts; tests/integration/learning.test.ts; tests/e2e/learning.test.tsx; tests/integration/organization-migration.test.ts updates expected migration output/count.
- docs/CHECKPOINT_ENGINE.md, DECISIONS.md (D34), DAILY_LEARNING.md, API_AND_DATA_CONTRACTS.md, PROJECT_STATE.md and HANDOFF.md.

## Actual verification

Node 24.19.0/npm 11.1.0 in %TEMP%/nursery-phase07-tools. Prepend that directory to PATH and invoke npm with `node %TEMP%/nursery-phase07-tools/node_modules/npm/bin/npm-cli.js`. Nested workspace scripts require npm.cmd alongside that node.exe; copied the installed npm/bin/npm.cmd there. Adding npm/bin itself to PATH mis-resolves npm's relative installation paths; the system npm shim otherwise uses Node 25.2.1. Final workspace gates ran with the corrected pinned launcher.

DATABASE_URL=postgresql://postgres@127.0.0.1:55407/nursery_test. PostgreSQL 18.4 disposable cluster in %TEMP%/nursery-phase07-pg, existing process left running (PID 19720 at final check); system PostgreSQL service untouched. Fixtures create/drop isolated synthetic schemas and private temporary files. No .env was created.

- `npm run test:integration -- tests/integration/children.test.ts`: prerequisite 10/10 before edits.
- `npm run test:unit`: 49/49, latest run after note normalization.
- `npm run test:integration -- tests/integration/learning.test.ts tests/integration/organization-migration.test.ts`: 9/9, latest captured run 104.37 s. Learning 7/7 covers A08/A09/A10/A02/A31, real separate-actor concurrency, replay/conflict, strict HTTP rejection, disabled adapter replay, scoped guardians/outbox, batch exceptions and failure rollback. Migration 2/2 upgrades actual Phase 03/05 schemas through 0006 and reruns with no reseeding or extra applications.
- `npm run test:e2e -- tests/e2e/learning.test.tsx`: final 2/2, 67.23 s, English/Arabic with real HTTP/PostgreSQL; create configuration, next-day behavior, publish, reasoned correction, classroom exceptions and open-form module hiding. Axe passes with color contrast excluded in jsdom. Final fixture waits for in-flight requests and asserts no HTTP 5xx. No browser automation or visual-review claim.
- `npm run typecheck`: all workspaces passed, final exit 0.
- `npm run lint`: all workspaces passed, final exit 0.
- `npm run build`: all workspaces passed. Vite main chunk 522.71 kB / 150.46 kB gzip triggers the 500 kB warning; no build failure.
- `git -c core.whitespace=cr-at-eol diff --check`: passed.

Interim failures were corrected: test helper used changeModule rather than saveModuleSetting and initially omitted its required reason; progress translation mistakenly passed a boolean in interpolation values; two API type errors corrected; Windows npm launcher path repaired. An interrupted run had no recoverable result and was repeated. Earlier DOM runs passed but logged late requests during fixture shutdown; final teardown waits and rejects any HTTP 5xx, and the final run had none. Log-redirection typo was fixed before checks ran. No failures were marked skipped/passed.

## Migration and remaining limits

Apply 0006 after 0005 before running the updated app. It was applied only in disposable verification schemas, never an operator/live nursery database. No deployment, dependency changes, subagents or later-phase implementation.

No Phase 08 gate blocker remains. The prior authentication DOM assisted-reset timing failure documented in SAFETY.md remains outside scope and was not rerun. Manual responsive/visual walkthrough and bundle splitting remain later review/hardening. The guardian daily read contract exists; parent hub UI/SSE and outbox delivery/acknowledgments belong to Phase 12. Built-in attendance/exam/homework forms and data tables belong to Phases 09–11. Each classroom batch reviews up to the current 100-child roster page; subsequent pages are separate explicit publications. Drafts are UI memory only. Do not claim measured five-second live delivery, persistent draft recovery or specialized learning functionality yet.
