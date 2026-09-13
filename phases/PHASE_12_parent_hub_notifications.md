# Phase 12 — Parent hub, announcements, and live notifications

Status: implementation not started in the delivered plan. Current execution status belongs in [PROJECT_STATE.md](../docs/PROJECT_STATE.md).

## Model and purpose

Select **Sol**, **High reasoning** (closest available UI setting) before starting. Live delivery, privacy, and a very simple parent experience must work together. This is a workload recommendation, not a guaranteed token estimate. See [model/context guidance](../docs/MODEL_AND_CONTEXT_GUIDE.md).

Deliver the core parent experience: child switching, live daily progress, learning history, and relevant notices.

## Prerequisites and context

Prerequisites: [Phase 07](../phases/PHASE_07_health_pickup_incidents.md), [Phase 11](../phases/PHASE_11_homework_completion.md)

The supported execution order is 01 through 25. Dependency links identify the closest technical prerequisites; do not skip earlier phases just because every earlier number is not repeated here.

Requirements: R04, R06, R09, U20.

Always read [AGENTS.md](../AGENTS.md), [PROJECT_STATE.md](../docs/PROJECT_STATE.md), and [HANDOFF.md](../docs/HANDOFF.md). Then read relevant sections of:

- [UX_AND_BRANDING.md](../docs/UX_AND_BRANDING.md)
- [DAILY_LEARNING.md](../docs/DAILY_LEARNING.md)
- [ACCESS_AND_LICENSING.md](../docs/ACCESS_AND_LICENSING.md)
- [API_AND_DATA_CONTRACTS.md](../docs/API_AND_DATA_CONTRACTS.md)

## Implementation scope and checkpoints

1. Build the parent Today page with a simple child selector, live daily checkpoint bar, readable cards for exam/homework/attendance, and grouped history. Add profile, authorized pickup, health, and notices entry points only when available.

2. Implement nursery/branch/classroom/selected-parent/child announcement targeting and optional acknowledgment. Keep recipient lists private and revalidate current scope when reading a target.

3. Implement durable in-app notification records, read/unread state, recipient deduplication, safe deep links, and integrations for incidents, learning, holidays, and planned absence. Add financial/event producers through the same interface later.

4. Implement authenticated SSE invalidations with heartbeats, reconnect snapshot refresh, bounded polling fallback, and immediate scope/block/license revocation. Do not broadcast full records or trust stale recipient snapshots.

5. Expose WhatsApp chat links for user-initiated external conversations. Ensure paid-module disable and blocked-child/account messages remove unavailable content without stale data flashes.

## Acceptance gate

- A12: a teacher publication becomes visible after commit and reconnect fetches the latest permitted report.
- A06/A34: block/link removal closes access and live delivery; no sensitive notification payload or inaccessible target leaks.
- A03: two guardians see their allowed child data with independent notification read state.
- A35: parent navigation stays compact and readable in RTL on a narrow phone; announcements are understandable without charts.
- Run the applicable established build/type/lint gate for changed packages. Record exact commands/results and migration implications. Do not repeat unrelated suites without a concrete risk or required gate.
- Update state/handoff after verification. Do not continue automatically into the next phase.

## Boundary

Outside this phase: Internal chat, complaints, WhatsApp sending API, SMS/email, and native push notifications.

When an upstream defect prevents this phase, fix the narrow prerequisite and record the reason. A product change requires an explicit decision entry; do not silently expand scope.

## Required handoff

Record notification producers, event payload policy, SSE/reconnect behavior, and screenshots of the parent flow.

Include changed files, migration status, actual checks, unresolved issues, and the next executable action. Use the repository state files, not assumed chat memory.

## Copy-and-paste Codex prompt

The model is selected in Codex; text inside this prompt cannot change it.

~~~text
Implement Phase 12: Parent hub, announcements, and live notifications.

Read AGENTS.md, docs/PROJECT_STATE.md, docs/HANDOFF.md, and phases/PHASE_12_parent_hub_notifications.md completely. Read only the reference documents/sections listed in this phase plus code needed for its scope. Inspect the repository and current diff before editing; the planning files do not prove earlier phases were implemented.

Check the prerequisites against actual evidence. Outline a small sequence of implementation checkpoints, then execute this phase's scope and acceptance checks. Reuse existing contracts, components, services, and tests. Preserve unrelated user changes. Apply documented defaults in docs/DECISIONS.md; ask only if a material conflict cannot be resolved from the requirements and actual code.

Implement real working behavior for this phase. Do not add fake success paths, duplicate financial formulas, permissive authorization fallbacks, or features from later phases. Keep all applicable AGENTS.md invariants. Add focused tests for consequential rules and use real PostgreSQL for transaction/concurrency checks. Do not deploy to a live nursery or introduce subagents as a side effect.

At each meaningful checkpoint, update docs/PROJECT_STATE.md with actual progress and evidence. Before a context boundary, finish a safe checkpoint and update docs/HANDOFF.md with precise files, commands/results, unresolved work, and the next action; a phase may span multiple sessions. Never claim the phase is complete simply because context is running low.

When the phase's gate is satisfied, mark it complete with evidence and stop. Report what changed, actual verification, remaining limitations, and the next phase. If blocked, preserve completed work and describe the concrete blocker without marking checks passed.
~~~

