# Versioned checkpoints and publication engine

Phase 08 implements R06/U09/U10/U13. D34 records the concrete defaults. No specialized attendance, exam or homework forms, generic field designer, automatic publication or notification dispatcher is implemented here.

## Configuration and snapshots

Migration `0006_learning.sql` follows 0005. It seeds Attendance, Exam result and Homework with stable UUIDs and the mappings in DAILY_LEARNING.md. `learning.configure` is reserved to SYSTEM; `learning.read` and `learning.publish` are delegable capabilities requiring explicit role assignment. Existing roles are not broadened. The new `CUSTOM_CHECKPOINTS` module starts enabled and shares the existing nursery-wide module settings workflow.

`checkpoint_configurations` is an immutable numbered configuration set with an effective Cairo date. `checkpoint_definitions` and `checkpoint_statuses` retain stable identities; `checkpoint_versions` and `checkpoint_status_versions` retain immutable bilingual labels, order, enabled state, icon/theme tokens and semantics. Definitions have optional inclusive enabled-from/until dates. Saving requires the latest `expectedVersion`; the new set starts tomorrow. Several changes on one day retain all versions; the highest eligible version is selected. Even never-published saved IDs cannot be removed or repurposed. Retirement uses `enabled=false`. Each definition keeps an enabled pending status, and required built-in outcome mappings remain enabled.

`daily_snapshots` is unique on child/date and freezes configuration, branch and classroom. Lazy creation uses date-effective child lifecycle/classroom history, rejects future dates, and creates no report for an inactive/unplaced historical child. Existing snapshots never change. `daily_slots` has one row per enabled, date-applicable definition, even if its immediate module switch is currently off. This preserves the denominator in storage. Ordinary daily reads remove disabled modules at every date; the filtered response computes its own progress without leaking hidden data. Re-enabling restores the retained slots. Authorized staff can read disabled publication chains through the explicit history endpoint.

Progress counts published `RESOLVED` and `NOT_APPLICABLE` slots, while unrecorded and published `PENDING` remain incomplete. N/A has a distinct label. Zero visible slots returns `{completed:0,total:0,hidden:true}`; the UI hides the bar and explains unavailability. Attendance absent and present both resolve. Exam missing remains pending; result-published resolves independently of a numeric score, whose validation belongs to Phase 10. Homework completed and not-completed resolve; excused/no-work are N/A. Labels/colors never determine meaning.

## Publication API

All paths below start with `/api/v1/learning` and require the existing authenticated session/CSRF machinery. Runtime schemas reject unknown fields.

| Method/path | Contract |
|---|---|
| GET/PUT `/configuration` | SYSTEM reads/saves `{expectedVersion,definitions}`; up to 50 definitions and 30 statuses each. |
| GET `/context` | Current staff learning permission, policy revision and enabled module keys; used for form revalidation. |
| GET `/roster?offset=0` | Current permitted active children, 100 per page, stable classroom/name/ID ordering. |
| GET `/children/:id/daily?date=YYYY-MM-DD` | Scoped day snapshot/slots, effective events, deterministic progress and advisory canPublish. Guardians need the current active child/read link. |
| POST `/publications` | Initial custom checkpoint publication at expectedVersion 0. |
| POST `/transitions` | Append a changed custom status; previous note is preserved. |
| POST `/corrections` | Append replacement status/note with a required nonblank reason. |
| POST `/classroom-publications` | Atomic selected-child initial publications with individual status/note exceptions; at most 100 entries. |
| GET `/children/:id/history?date=...&definitionId=...` | Current scoped staff only; ordered retained publication chain, including disabled module history. |

Single-write input: `{childId,date,definitionId,statusId,note?,expectedVersion,operationId}`; correction also requires `reason`. Custom fields are only status plus optional plain-text note (2,000 characters). Empty/omitted notes normalize to null. Batch input is `{classroomId,operationId,entries}` with the single-write fields except per-entry operationId. Each entry must be unique and currently belong to the requested classroom. The form reviews children in the current roster page; larger rosters can be processed in further pages. Existing publications are excluded from this initial-publication form and corrected individually.

`learning_events` retains revision, previous event/revision, status version, action, note, reason and private actor/audit time. There are no destructive publication routes. Unique `(slot_id,revision)` and `previous_id`, plus a same-slot predecessor foreign key and sequential revision check, enforce one successor and prevent cross-slot chains. Database triggers reject updates/deletes on learning/configuration/snapshot/operation/outbox history.

`ChildService.withPolicy` provides license, organization, guardian-link, account and session protection. Learning locks the actor/operation, configuration, children in stable UUID order and then slots. The current assigned child/classroom and active status are required for every write, including replay; losing assignment does not preserve correction authority. An authorized manager can act through current branch scope. Module disable is serialized with publication by the existing license lock. Unknown statuses or wrong-kind public submissions are rejected.

`learning_operations` uniquely identifies actor + client operation UUID and stores a canonical request hash and original result. A matching retry returns that original result even after a later correction; changed reuse returns `IDEMPOTENCY_CONFLICT`. Stale revision returns `STALE_VERSION`. Current scope/module checks run before replay, so a revoked user cannot recover protected records with an old operation ID. Publication, operation result, child audit and outbox commit or roll back together. Draft input stays in UI memory; there is no server draft persistence or offline mutation queue.

## Built-in adapter contract for Phases 09–11

Public Phase 08 writes accept only STATUS_NOTE. A built-in service must use a single `ChildService.withPolicy` transaction and call `LearningService.operation` with its entire canonical business request. Its authorization callback calls `authorizePublications(tx,policy,kind,entries)` plus any adapter-specific permission/resource checks. This callback runs on replay as well. Its work callback validates/writes the specialized relational payload and invokes `appendInTransaction(tx,policy,kind,input,action)` in the same transaction. No independent commit is allowed between detailed data and the learning event.

Select the status by the snapshotted outcome mapping, never a translated label or newest configuration. Aggregate multiple exams/homework records into one slot with appended transitions. Retain instructions/results in adapter-owned versioned tables; instruction/content correction needs a reason. The engine's transition currently requires a different status ID and unchanged note. If a future adapter needs an unchanged aggregate status for a new detailed event, extend that internal contract deliberately with focused tests; do not weaken the public custom correction rule. Dedicated built-in services remain responsible for score bounds, due dates and detailed lifecycle semantics.

## Durable event boundary for Phase 12

`learning_change_outbox` is an append-only transactionally written invalidation log: unique event ID, child, historical branch/classroom, date, module key, recipient UUID snapshot and private creation time. It contains no narrative, note or grade payload. Initial recipients have active links with both read and notify permission. Phase 12 must revalidate current account status, child status, license, module, links and staff scope before dispatch or fetch. A captured recipient list is not continuing authorization.

Delivery/acknowledgment rows and retries belong in separate Phase 12 tables, keyed by event/recipient for deduplication. Do not use only a timestamp or monotonic cursor that can skip transactions committing out of order; consume unacknowledged committed event IDs. Authoritative day reads remain available after reconnect even if invalidation delivery was missed. No SSE or five-second delivery performance claim is made in Phase 08; current screens use the established five-second scoped read/focus behavior.

## Verification and operational limits

Tests use synthetic data and isolated schemas on PostgreSQL 18.4 at `127.0.0.1:55407/nursery_test`, with Node 24.19.0 and npm 11.1.0 in `%TEMP%/nursery-phase07-tools`. Prefix PATH with that directory; its npm.cmd is copied from its installed npm/bin so nested workspace commands use the pinned Node. Invoke npm through `node %TEMP%/nursery-phase07-tools/node_modules/npm/bin/npm-cli.js`.

- Prerequisite `npm run test:integration -- tests/integration/children.test.ts`: 10/10 before editing.
- `npm run test:unit`: 49/49, including strict publication input and reporting meaning checks.
- `npm run test:integration -- tests/integration/learning.test.ts tests/integration/organization-migration.test.ts`: 9/9. Covers A08/A09/A10/A02/A31, separate-actor correction race, replay/conflicting reuse, append-only enforcement, snapshot creation race, scoped recipients, permission loss, module disable, batch exceptions, injected-outbox rollback, required mappings, and upgrade/rerun from Phase 03/05 schemas.
- `npm run build`: all workspaces passed. Vite reports a 522.71 kB minified main chunk (150.46 kB gzip), a warning rather than a failed gate. Bundle splitting remains later hardening.
- `npm run test:e2e -- tests/e2e/learning.test.tsx`: 2/2, English and Egyptian Arabic, real HTTP/PostgreSQL, configuration creation, next-day behavior, individual publication/correction, classroom exceptions and module-disable clearing. Axe checks report no violations with color-contrast disabled in jsdom. The final fixture waits for in-flight requests before teardown and asserts no HTTP 5xx responses.
- `npm run typecheck` and `npm run lint`: all workspaces passed. `git -c core.whitespace=cr-at-eol diff --check` passed. Final captured results are recorded in HANDOFF.md.

Migration was exercised only in disposable schemas, never an operator/live nursery database. Apply 0006 after 0005 before running this version, then assign learning capabilities explicitly. No dependency changes, .env changes, deployment, live database mutation, browser automation or subagents. The prior Phase 07 auth DOM reset timing issue remains outside this phase; unrelated suites were not repeated. Full manual responsive/visual review remains the user's later walkthrough; script accessibility checks do not claim visual inspection.
