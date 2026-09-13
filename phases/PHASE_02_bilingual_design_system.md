# Phase 02 — Bilingual design system and navigation

Status: implementation not started in the delivered plan. Current execution status belongs in [PROJECT_STATE.md](../docs/PROJECT_STATE.md).

## Model and purpose

Select **Sol**, **High reasoning** (closest available UI setting) before starting. Visual hierarchy, responsive behavior, and bilingual polish need careful design judgment. This is a workload recommendation, not a guaranteed token estimate. See [model/context guidance](../docs/MODEL_AND_CONTEXT_GUIDE.md).

Establish the simple, readable visual system that every later feature reuses.

## Prerequisites and context

Prerequisites: [Phase 01](../phases/PHASE_01_repository_foundation.md)

The supported execution order is 01 through 25. Dependency links identify the closest technical prerequisites; do not skip earlier phases just because every earlier number is not repeated here.

Requirements: R04, U06, U07.

Always read [AGENTS.md](../AGENTS.md), [PROJECT_STATE.md](../docs/PROJECT_STATE.md), and [HANDOFF.md](../docs/HANDOFF.md). Then read relevant sections of:

- [UX_AND_BRANDING.md](../docs/UX_AND_BRANDING.md)
- [ARCHITECTURE.md](../docs/ARCHITECTURE.md)

## Implementation scope and checkpoints

1. Implement Egyptian Arabic and English message catalogs, per-user/local language preference, RTL/LTR direction, Cairo date display helpers, and EGP formatting. Keep codes and persisted values language-independent.

2. Create semantic theme tokens using the supplied palette, readable foregrounds, neutral surfaces, validation colors, focus rings, and reduced-motion support. Add a contrast validation helper that later Superadmin theme forms can reuse.

3. Build reusable forms, fields, date inputs, large labeled buttons, modals, skeletons, empty/error states, cards, accessible tables, and mobile alternatives. Use icons with short purposeful animation; never rely on icons or color alone.

4. Create role-specific shell components and route groupings: compact parent bottom navigation, teacher daily tasks, grouped administration navigation, and a clearly distinct support area. Actual access decisions will use server capabilities in later phases.

5. Add a development-only component preview with synthetic content to inspect density and interaction. Do not expose demo data as real dashboard metrics or enable fake authenticated production screens.

## Acceptance gate

- Inspect representative screens at 360px, 768px, and desktop in both directions; controls remain readable with no horizontal page overflow.
- Check keyboard focus, field labels, modal focus restoration, reduced motion, and the pink palette's text contrast.
- Language switch changes UI direction and display without changing stored business values.
- Build/typecheck and focused component accessibility checks pass; save relevant screenshots only as implementation evidence.
- Run the applicable established build/type/lint gate for changed packages. Record exact commands/results and migration implications. Do not repeat unrelated suites without a concrete risk or required gate.
- Update state/handoff after verification. Do not continue automatically into the next phase.

## Boundary

Outside this phase: Persistent theme settings, business forms, authorization logic, and decorative dashboard analytics.

When an upstream defect prevents this phase, fix the narrow prerequisite and record the reason. A product change requires an explicit decision entry; do not silently expand scope.

## Required handoff

List shared components, token names, navigation conventions, translation pattern, and visual checks.

Include changed files, migration status, actual checks, unresolved issues, and the next executable action. Use the repository state files, not assumed chat memory.

## Copy-and-paste Codex prompt

The model is selected in Codex; text inside this prompt cannot change it.

~~~text
Implement Phase 02: Bilingual design system and navigation.

Read AGENTS.md, docs/PROJECT_STATE.md, docs/HANDOFF.md, and phases/PHASE_02_bilingual_design_system.md completely. Read only the reference documents/sections listed in this phase plus code needed for its scope. Inspect the repository and current diff before editing; the planning files do not prove earlier phases were implemented.

Check the prerequisites against actual evidence. Outline a small sequence of implementation checkpoints, then execute this phase's scope and acceptance checks. Reuse existing contracts, components, services, and tests. Preserve unrelated user changes. Apply documented defaults in docs/DECISIONS.md; ask only if a material conflict cannot be resolved from the requirements and actual code.

Implement real working behavior for this phase. Do not add fake success paths, duplicate financial formulas, permissive authorization fallbacks, or features from later phases. Keep all applicable AGENTS.md invariants. Add focused tests for consequential rules and use real PostgreSQL for transaction/concurrency checks. Do not deploy to a live nursery or introduce subagents as a side effect.

At each meaningful checkpoint, update docs/PROJECT_STATE.md with actual progress and evidence. Before a context boundary, finish a safe checkpoint and update docs/HANDOFF.md with precise files, commands/results, unresolved work, and the next action; a phase may span multiple sessions. Never claim the phase is complete simply because context is running low.

When the phase's gate is satisfied, mark it complete with evidence and stop. Report what changed, actual verification, remaining limitations, and the next phase. If blocked, preserve completed work and describe the concrete blocker without marking checks passed.
~~~

