# Phase 07 — Health notes, authorized pickup, and incidents

Status: implementation not started in the delivered plan. Current execution status belongs in [PROJECT_STATE.md](../docs/PROJECT_STATE.md).

## Model and purpose

Select **Terra**, **Medium reasoning** (closest available UI setting) before starting. These are bounded records and forms with explicit access and workflow checks. This is a workload recommendation, not a guaranteed token estimate. See [model/context guidance](../docs/MODEL_AND_CONTEXT_GUIDE.md).

Provide the limited safety records staff and parents need while external calls remain part of the real process.

## Prerequisites and context

Prerequisites: [Phase 06](../phases/PHASE_06_children_guardians_onboarding.md)

The supported execution order is 01 through 25. Dependency links identify the closest technical prerequisites; do not skip earlier phases just because every earlier number is not repeated here.

Requirements: R08, U19.

Always read [AGENTS.md](../AGENTS.md), [PROJECT_STATE.md](../docs/PROJECT_STATE.md), and [HANDOFF.md](../docs/HANDOFF.md). Then read relevant sections of:

- [PRODUCT_REQUIREMENTS.md](../docs/PRODUCT_REQUIREMENTS.md)
- [ACCESS_AND_LICENSING.md](../docs/ACCESS_AND_LICENSING.md)
- [API_AND_DATA_CONTRACTS.md](../docs/API_AND_DATA_CONTRACTS.md)
- [TESTING_AND_ACCEPTANCE.md](../docs/TESTING_AND_ACCEPTANCE.md)

## Implementation scope and checkpoints

1. Implement health notes, allergy alerts, and emergency contacts with staff/guardian permissions and a clear staff emergency view. Respect the documented health feature-disable exception for retained emergency information.

2. Implement parent-managed authorized pickup people with name, phone, relationship, date validity, and one-day authorization. Management may record restrictions/prohibited collectors without exposing private custody notes to unrelated users.

3. Create a staff pickup recording action that requires a valid permitted collector and explicit confirmation of a call to a linked guardian. Record the business date and internal audit event, without child arrival/departure time fields.

4. Implement incident description, occurrence date/time, action taken, guardian-informed status/contact method, and follow-up. Produce a durable notification event for Phase 12; preserve the record if live delivery is unavailable.

5. Add scoped WhatsApp chat links using normalized guardian numbers. Opening a link is user initiated; the application never sends a message automatically.

## Acceptance gate

- A33: invalid/expired/prohibited collector, missing call confirmation, and unresolved restriction conflict reject release recording.
- A01/A03: health and pickup views respect current child, branch, and classroom access.
- A37: private safety attachments, if present through generic documents, use the same secure download service.
- A31: disabling optional screens preserves history and the documented staff emergency view.
- Run the applicable established build/type/lint gate for changed packages. Record exact commands/results and migration implications. Do not repeat unrelated suites without a concrete risk or required gate.
- Update state/handoff after verification. Do not continue automatically into the next phase.

## Boundary

Outside this phase: Medication scheduling, medical advice, biometric pickup, injury photos, and physical verification of a guardian call.

When an upstream defect prevents this phase, fix the narrow prerequisite and record the reason. A product change requires an explicit decision entry; do not silently expand scope.

## Required handoff

Record safety permissions, pickup rules, incident event contract, and any operator wording needing final review.

Include changed files, migration status, actual checks, unresolved issues, and the next executable action. Use the repository state files, not assumed chat memory.

## Copy-and-paste Codex prompt

The model is selected in Codex; text inside this prompt cannot change it.

~~~text
Implement Phase 07: Health notes, authorized pickup, and incidents.

Read AGENTS.md, docs/PROJECT_STATE.md, docs/HANDOFF.md, and phases/PHASE_07_health_pickup_incidents.md completely. Read only the reference documents/sections listed in this phase plus code needed for its scope. Inspect the repository and current diff before editing; the planning files do not prove earlier phases were implemented.

Check the prerequisites against actual evidence. Outline a small sequence of implementation checkpoints, then execute this phase's scope and acceptance checks. Reuse existing contracts, components, services, and tests. Preserve unrelated user changes. Apply documented defaults in docs/DECISIONS.md; ask only if a material conflict cannot be resolved from the requirements and actual code.

Implement real working behavior for this phase. Do not add fake success paths, duplicate financial formulas, permissive authorization fallbacks, or features from later phases. Keep all applicable AGENTS.md invariants. Add focused tests for consequential rules and use real PostgreSQL for transaction/concurrency checks. Do not deploy to a live nursery or introduce subagents as a side effect.

At each meaningful checkpoint, update docs/PROJECT_STATE.md with actual progress and evidence. Before a context boundary, finish a safe checkpoint and update docs/HANDOFF.md with precise files, commands/results, unresolved work, and the next action; a phase may span multiple sessions. Never claim the phase is complete simply because context is running low.

When the phase's gate is satisfied, mark it complete with evidence and stop. Report what changed, actual verification, remaining limitations, and the next phase. If blocked, preserve completed work and describe the concrete blocker without marking checks passed.
~~~

