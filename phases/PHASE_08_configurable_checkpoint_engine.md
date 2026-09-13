# Phase 08 — Versioned checkpoints and publication engine

Status: implementation not started in the delivered plan. Current execution status belongs in [PROJECT_STATE.md](../docs/PROJECT_STATE.md).

## Model and purpose

Select **Astra**, **High reasoning** (closest available UI setting) before starting. Versioned configuration, immutable history, and concurrency underpin the full learning module. This is a workload recommendation, not a guaranteed token estimate. See [model/context guidance](../docs/MODEL_AND_CONTEXT_GUIDE.md).

Create flexible daily checkpoint definitions and an immutable publication system with stable historical meaning.

## Prerequisites and context

Prerequisites: [Phase 06](../phases/PHASE_06_children_guardians_onboarding.md)

The supported execution order is 01 through 25. Dependency links identify the closest technical prerequisites; do not skip earlier phases just because every earlier number is not repeated here.

Requirements: R06, U09, U10, U13.

Always read [AGENTS.md](../AGENTS.md), [PROJECT_STATE.md](../docs/PROJECT_STATE.md), and [HANDOFF.md](../docs/HANDOFF.md). Then read relevant sections of:

- [DAILY_LEARNING.md](../docs/DAILY_LEARNING.md)
- [API_AND_DATA_CONTRACTS.md](../docs/API_AND_DATA_CONTRACTS.md)
- [DECISIONS.md](../docs/DECISIONS.md)
- [TESTING_AND_ACCEPTANCE.md](../docs/TESTING_AND_ACCEPTANCE.md)

## Implementation scope and checkpoints

1. Implement Superadmin checkpoint creation, ordering, enabled dates, translated labels, and customizable statuses. Seed Attendance, Exam result, and Homework; additional checkpoints accept only a status and optional note.

2. Assign stable progress meanings pending/resolved/not-applicable and required built-in mappings. Validate unsafe deletion/remapping of referenced statuses and create a new configuration version for changes.

3. Create child/date snapshots and one slot per enabled definition. New configuration starts next Cairo date; published history keeps old definitions and labels. Current module disable respects the separate immediate visibility rules.

4. Implement publish, append transition, and reasoned correction services with expected revision, actor scope, operation ID, unique successor constraints, and audit. Drafts may be editable; published data is never destructively patched.

5. Build Superadmin configuration screens and a working teacher custom-checkpoint form/daily bar read model. Built-in adapters are added in Phases 09–11 using the same engine.

6. Add a durable scoped change-event/outbox boundary for Phase 12 and deterministic progress calculations including zero enabled checkpoints.

## Acceptance gate

- A08: changing label/order/status availability affects new days and leaves historical snapshots unchanged.
- A09: unresolved, resolved, and N/A produce distinct labels with the right completion count.
- A10: concurrent corrections have one effective successor; retry returns the original successful publication.
- A02/A31: publication outside assigned classes or into disabled modules is rejected; no arbitrary custom payload fields are accepted.
- Run the applicable established build/type/lint gate for changed packages. Record exact commands/results and migration implications. Do not repeat unrelated suites without a concrete risk or required gate.
- Update state/handoff after verification. Do not continue automatically into the next phase.

## Boundary

Outside this phase: Specialized attendance, grade, and homework forms; a generic field/form builder; automatic end-of-day publication.

When an upstream defect prevents this phase, fix the narrow prerequisite and record the reason. A product change requires an explicit decision entry; do not silently expand scope.

## Required handoff

Document version/snapshot schema, status semantic mapping, publication API, correction chain, and built-in adapter contract.

Include changed files, migration status, actual checks, unresolved issues, and the next executable action. Use the repository state files, not assumed chat memory.

## Copy-and-paste Codex prompt

The model is selected in Codex; text inside this prompt cannot change it.

~~~text
Implement Phase 08: Versioned checkpoints and publication engine.

Read AGENTS.md, docs/PROJECT_STATE.md, docs/HANDOFF.md, and phases/PHASE_08_configurable_checkpoint_engine.md completely. Read only the reference documents/sections listed in this phase plus code needed for its scope. Inspect the repository and current diff before editing; the planning files do not prove earlier phases were implemented.

Check the prerequisites against actual evidence. Outline a small sequence of implementation checkpoints, then execute this phase's scope and acceptance checks. Reuse existing contracts, components, services, and tests. Preserve unrelated user changes. Apply documented defaults in docs/DECISIONS.md; ask only if a material conflict cannot be resolved from the requirements and actual code.

Implement real working behavior for this phase. Do not add fake success paths, duplicate financial formulas, permissive authorization fallbacks, or features from later phases. Keep all applicable AGENTS.md invariants. Add focused tests for consequential rules and use real PostgreSQL for transaction/concurrency checks. Do not deploy to a live nursery or introduce subagents as a side effect.

At each meaningful checkpoint, update docs/PROJECT_STATE.md with actual progress and evidence. Before a context boundary, finish a safe checkpoint and update docs/HANDOFF.md with precise files, commands/results, unresolved work, and the next action; a phase may span multiple sessions. Never claim the phase is complete simply because context is running low.

When the phase's gate is satisfied, mark it complete with evidence and stop. Report what changed, actual verification, remaining limitations, and the next phase. If blocked, preserve completed work and describe the concrete blocker without marking checks passed.
~~~

