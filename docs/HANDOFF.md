# Current handoff

Updated: 2026-09-14 — Phase 12 implementation checkpoint; IN PROGRESS.

## Next executable action

Continue Phase 12, not Phase 13. Implementation and automated gates passed. Inspect the preserved diff and resolve the user clarification: phase handoff requires screenshots, while AGENTS.md prohibits browser automation. Offered waive screenshots/keep script-only, or explicitly allow screenshot-only local browser automation. No reply or authorization received. Elapsed time is not permission. No screenshots/manual phone layout verification have run; phase remains IN PROGRESS until resolved.

## Files and actual behavior

- packages/contracts/src/communication.ts and communication.unit.test.ts; organization.ts/index.ts: strict notice/target/page/date inputs, delegable announcements.manage, notice/notification DTOs; no role grants.
- packages/db/src/migrations/0010_communication.sql: immutable notices/private recipient witnesses/acknowledgments/planned-absence event source; unique event/guardian inbox/read state; source view over immutable learning/homework/incident/attendance histories. Upgrade expected count now 11.
- apps/api/src/modules/communication/{service,routes,live}.ts and app.ts: publication/current target/options/read/ack/inbox/contact and empty-payload SSE. Reuse ChildService.withPolicy/current capability-child-link policy/LearningService.operation. Selected-parent account locks protect target-link races; parent reads lock current child/link witnesses. Notice reads require original witness/current read/current branch-classroom; notifications add notify/module checks. One notice notification per guardian across siblings, independent read/ack state.
- apps/api/src/modules/attendance/service.ts: atomic submitting-guardian confirmation for each changed absence range; identical retry none, no attendance inference.
- packages/contracts/src/homework.ts and apps/api/src/modules/homework/service.ts: optional on history filter assigned-or-due day before pagination.
- apps/web/src/features/communication/{ParentLive,screens,copy}.tsx/ts; App.tsx; auth/{client,screens}; children/{scoped,screens}; exams/homework/attendance/safety screens; catalogs/styles: compact bilingual five-link navigation/Today/child switching/date-specific details/grouped history/notices/ack/inbox/read state/publish form/safe profile and enabled safety entry points/user-clicked WhatsApp. Parent root redirects to Today; notification dates open a scoped dated daily view. Attendance form now waits for enabled authorized report. Shared useScoped discards obsolete reads, queues invalidations and tags records by path.
- tests/helpers/http-client.ts: optional scripted EventSource adapter consumes real authenticated TCP stream; production native EventSource. No browser automation/mocked PostgreSQL.
- tests/integration/communication.test.ts, organization-migration.test.ts, tests/e2e/parent-hub.test.tsx: actual PG privacy/races/rollback/scope/producers/SSE/reconnect/license and bilingual real HTTP/SSE DOM/publish tests. Teardown counts either response or socket close once: aborted SSE may not fire normal onResponse.
- docs/PARENT_HUB_AND_NOTIFICATIONS.md, API_AND_DATA_CONTRACTS.md, DECISIONS.md D38, PROJECT_STATE.md: current contract/default/evidence. Previous Phase 11 details in HOMEWORK.md; historical Phase 10 auth DOM timing defect in EXAMS.md.

## Producers/privacy/live

Sources: learning_change_outbox, homework_content_outbox, incident notification_events, attendance_absence_alerts, new planned-absence events, announcements/dated holiday notices. Unexpected absence replaces generic learning notification for same event; content/outcomes keep independent identities. Actual Phase 09 lacks a holiday store: narrow addition is dated holiday notices, never auto-No-class or calendar editor. Parent DTOs contain only generated safe local target and current permitted metadata, no descriptions/instructions/recipient lists/audit times. Targets fetch through fresh auth.

Recipient-local dispatch inserts at most 200 candidates/transaction, event/guardian uniqueness, no source mutations, retained independent read state. Later financial/event adapters must add real module/link permission rules through this source boundary; none implemented here. SSE reconstructs current session/license/link/scope each second, sends only {} snapshot/invalidate/revoked/reconnect, heartbeats ten ticks, three streams/account/API process, 15-minute reconnect. Signatures remain private. Scope/policy loss closes on next tick; normal requests deny immediately. Client focus/reconnect fetch scoped snapshots, backoff 1–10 seconds; foreground polling five seconds remains fallback. Hidden tabs drop queries/close streams, logout closes. Final accessible new-update announcement passed focused DOM rerun. Streams close in preClose before HTTP/database shutdown; disconnected handshakes reserve no slot, verified in final real HTTP/PG check.

## Commands/results and runtime

Pinned Node 24.19.0/npm 11.1.0 from phase04 tools. PostgreSQL 18.6 disposable cluster %TEMP%/nursery-phase12-pg, loopback 55412, nursery_test STOPPED after verification. No .env, live services/deployment/dependency/model/subagents changed. Initial diff clean, work uncommitted.

PowerShell runner prefix:
```powershell
$env:DATABASE_URL='postgresql://postgres@127.0.0.1:55412/nursery_test'
$env:PATH="$env:TEMP/nursery-phase04-tools/node_modules/node/bin;$env:PATH"
$phaseNode="$env:TEMP/nursery-phase04-tools/node_modules/node/bin/node.exe"
$phaseNpm="$env:TEMP/nursery-phase04-tools/node_modules/npm/bin/npm-cli.js"
```

- run test:integration -- tests/integration/safety.test.ts tests/integration/homework.test.ts --maxWorkers=1: prerequisite 12/12 passed.
- run test:integration -- tests/integration/communication.test.ts tests/integration/organization-migration.test.ts --maxWorkers=1: interim backend 8/8 passed.
- run test:integration -- tests/integration/communication.test.ts tests/integration/homework.test.ts tests/integration/attendance.test.ts tests/integration/organization-migration.test.ts --maxWorkers=1: current 24/24 passed, 72.81s, real incident/absence/reconnect/license cases. Existing pg concurrent-query deprecation warning, no failed checks.
- run test:unit -- packages/contracts/src/communication.unit.test.ts packages/contracts/src/homework.unit.test.ts --maxWorkers=1: 3/3 passed.
- run test:e2e -- tests/e2e/parent-hub.test.tsx --maxWorkers=1: FINAL 3/3 passed, 31.52s after accessible announcement edit, RTL/axe/no server errors/real SSE visible refresh under five seconds. Initial fixture wait and SSE socket accounting failures fixed. No active exec session remains.
- run test:integration -- tests/integration/communication.test.ts --maxWorkers=1: FINAL 9/9 passed, 29.27s after shutdown/disconnected-handshake fix, includes active-stream graceful shutdown. pg concurrent-query deprecation warning observed; origin not traced.
- run typecheck; run lint; run build: FINAL passed after all code edits. Build main 590.69 kB/164.63 kB gzip, existing >500 kB warning. Do not repeat unless new changes justify it.
- run db:migrate: fresh 0000–0010 applied to disposable public schema; rerun no Applied lines. Upgrade preserves identities/reservations/edited roles. Fixtures use isolated generated schemas.
- git diff --check: FINAL passed using repository configuration (core.autocrlf=true; CRLF normalization notices only). An attempted core.autocrlf=false command override reported carriage returns as trailing whitespace; no files/config were changed, and the normal required command passed.

Stop only the disposable cluster after checks:
```powershell
& 'C:/Program Files/PostgreSQL/18/bin/pg_ctl.exe' -D "$env:TEMP/nursery-phase12-pg" -m fast -w stop
```
Resume with same verified -D, -l "$env:TEMP/nursery-phase12-pg/server.log", -o '-h 127.0.0.1 -p 55412', -w start. Never touch system services. No production/manual layout/screenshot claims. Do not mark Phase 12 complete until remaining gate/handoff conflict is resolved.
