# Phase 18 — Bus subscriptions, trips, and participation

Status: implementation not started in the delivered plan. Current execution status belongs in [PROJECT_STATE.md](../docs/PROJECT_STATE.md).

## Model and purpose

Select **Terra**, **Medium reasoning** (closest available UI setting) before starting. Bounded operational screens should reuse already verified finance and notification services. This is a workload recommendation, not a guaranteed token estimate. See [model/context guidance](../docs/MODEL_AND_CONTEXT_GUIDE.md).

Track bus fees/permission and trip eligibility with clear staff rosters.

## Prerequisites and context

Prerequisites: [Phase 17](../phases/PHASE_17_child_branch_debt_transfer.md)

The supported execution order is 01 through 25. Dependency links identify the closest technical prerequisites; do not skip earlier phases just because every earlier number is not repeated here.

Requirements: R14, U16, U20.

Always read [AGENTS.md](../AGENTS.md), [PROJECT_STATE.md](../docs/PROJECT_STATE.md), and [HANDOFF.md](../docs/HANDOFF.md). Then read relevant sections of:

- [FINANCE_RULES.md](../docs/FINANCE_RULES.md)
- [PRODUCT_REQUIREMENTS.md](../docs/PRODUCT_REQUIREMENTS.md)
- [ACCESS_AND_LICENSING.md](../docs/ACCESS_AND_LICENSING.md)
- [TESTING_AND_ACCEPTANCE.md](../docs/TESTING_AND_ACCEPTANCE.md)

## Implementation scope and checkpoints

1. Implement bus subscription period, fee, child, administrative permission, and linked financial obligation. Complete the bus onboarding step and derive paid state from the ledger.

2. Require full positive bus settlement per charge; reject partial/excess collection and duplicate settlement. Explicit zero-price service is No fee, not a fabricated receipt.

3. Implement the documented current-period eligibility rule and separate paid/permission states. A staff permission block may prohibit a paid child; it does not authorize an unpaid charge under the selected default.

4. Implement events/trips with date/details/fee, selected children, in-app invitations, externally obtained guardian consent, and payment links. Record actor/date for consent and route collections through existing services.

5. Build a teacher roster showing selected, paid/no-fee, permission, and participating states only for assigned children. Handle cancelation using reasoned credits/refunds and retain the event/receipt history.

6. Honor branch transfers and module dependencies; do not silently migrate an old trip invitation or duplicate a current bus obligation.

## Acceptance gate

- A20: 500 bus fee rejects 250, accepts 500 once, and duplicate retry creates no cash.
- A32: paid without consent and consent without paid fee are distinct ineligible states; explicitly free events work.
- A01/A02: teacher rosters, parent notices, and finance views retain their separate permissions.
- A31: transport/events disabled states stop dependent new actions and reminders while preserving permitted history.
- Run the applicable established build/type/lint gate for changed packages. Record exact commands/results and migration implications. Do not repeat unrelated suites without a concrete risk or required gate.
- Update state/handoff after verification. Do not continue automatically into the next phase.

## Boundary

Outside this phase: Bus attendance, routes/GPS, boarding/dropoff, parent approval forms, and online payment.

When an upstream defect prevents this phase, fix the narrow prerequisite and record the reason. A product change requires an explicit decision entry; do not silently expand scope.

## Required handoff

Record eligibility projections, zero-fee handling, event cancelation rules, and onboarding/transfer integrations.

Include changed files, migration status, actual checks, unresolved issues, and the next executable action. Use the repository state files, not assumed chat memory.

## Copy-and-paste Codex prompt

The model is selected in Codex; text inside this prompt cannot change it.

~~~text
Implement Phase 18: Bus subscriptions, trips, and participation.

Read AGENTS.md, docs/PROJECT_STATE.md, docs/HANDOFF.md, and phases/PHASE_18_bus_trips_activities.md completely. Read only the reference documents/sections listed in this phase plus code needed for its scope. Inspect the repository and current diff before editing; the planning files do not prove earlier phases were implemented.

Check the prerequisites against actual evidence. Outline a small sequence of implementation checkpoints, then execute this phase's scope and acceptance checks. Reuse existing contracts, components, services, and tests. Preserve unrelated user changes. Apply documented defaults in docs/DECISIONS.md; ask only if a material conflict cannot be resolved from the requirements and actual code.

Implement real working behavior for this phase. Do not add fake success paths, duplicate financial formulas, permissive authorization fallbacks, or features from later phases. Keep all applicable AGENTS.md invariants. Add focused tests for consequential rules and use real PostgreSQL for transaction/concurrency checks. Do not deploy to a live nursery or introduce subagents as a side effect.

At each meaningful checkpoint, update docs/PROJECT_STATE.md with actual progress and evidence. Before a context boundary, finish a safe checkpoint and update docs/HANDOFF.md with precise files, commands/results, unresolved work, and the next action; a phase may span multiple sessions. Never claim the phase is complete simply because context is running low.

When the phase's gate is satisfied, mark it complete with evidence and stop. Report what changed, actual verification, remaining limitations, and the next phase. If blocked, preserve completed work and describe the concrete blocker without marking checks passed.
~~~

