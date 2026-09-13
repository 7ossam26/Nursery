# Phase 03 — Authentication, sessions, and account security

Status: implementation not started in the delivered plan. Current execution status belongs in [PROJECT_STATE.md](../docs/PROJECT_STATE.md).

## Model and purpose

Select **Astra**, **High reasoning** (closest available UI setting) before starting. Authentication and session revocation create security boundaries used by every module. This is a workload recommendation, not a guaranteed token estimate. See [model/context guidance](../docs/MODEL_AND_CONTEXT_GUIDE.md).

Provide secure username/password login, Superadmin bootstrap and recovery, and revocable server sessions.

## Prerequisites and context

Prerequisites: [Phase 01](../phases/PHASE_01_repository_foundation.md), [Phase 02](../phases/PHASE_02_bilingual_design_system.md)

The supported execution order is 01 through 25. Dependency links identify the closest technical prerequisites; do not skip earlier phases just because every earlier number is not repeated here.

Requirements: R02, U03.

Always read [AGENTS.md](../AGENTS.md), [PROJECT_STATE.md](../docs/PROJECT_STATE.md), and [HANDOFF.md](../docs/HANDOFF.md). Then read relevant sections of:

- [ACCESS_AND_LICENSING.md](../docs/ACCESS_AND_LICENSING.md)
- [API_AND_DATA_CONTRACTS.md](../docs/API_AND_DATA_CONTRACTS.md)
- [ARCHITECTURE.md](../docs/ARCHITECTURE.md)

## Implementation scope and checkpoints

1. Create account/session/status-history schema and a one-time Superadmin bootstrap command that consumes secrets safely. Store strong password hashes and hashed session tokens; never commit or log bootstrap credentials.

2. Implement normalized usernames, login/logout, session rotation/expiry, secure HTTP-only cookies, same-origin protections including CSRF on mutations, rate limiting, safe errors, and redacted audit events.

3. Create the login and session-expired screens using shared bilingual components. Add current-account/capability response contracts for later policy integration. Production protected routes deny access until authenticated.

4. Implement Superadmin-assisted reset with temporary credentials or equivalent one-time local setup, forced password change, and existing-session revocation. Recovery stays with Superadmin; do not add email/SMS recovery or public signup.

5. Implement account-status enforcement and safe contact messages across request middleware. Establish revocation hooks for later SSE/download integration; ordinary admins cannot gain reserved Superadmin identity by editing a role.

## Acceptance gate

- Real API checks cover successful login, invalid credentials without account enumeration, logout, expired sessions, password reset, and revoked-session reuse.
- CSRF and unauthorized mutation attempts are rejected; cookies and response headers match production HTTPS requirements.
- Reusing a bootstrap action cannot create an additional unrestricted root account accidentally.
- Browser login/logout/reset flow works in both languages; blocked accounts reveal only the intended public message.
- Run the applicable established build/type/lint gate for changed packages. Record exact commands/results and migration implications. Do not repeat unrelated suites without a concrete risk or required gate.
- Update state/handoff after verification. Do not continue automatically into the next phase.

## Boundary

Outside this phase: General user provisioning, seat reservation UI, branch roles, and automated recovery messages.

When an upstream defect prevents this phase, fix the narrow prerequisite and record the reason. A product change requires an explicit decision entry; do not silently expand scope.

## Required handoff

Document session lifetime defaults, bootstrap/reset procedure, auth middleware, security checks, and revocation integration points.

Include changed files, migration status, actual checks, unresolved issues, and the next executable action. Use the repository state files, not assumed chat memory.

## Copy-and-paste Codex prompt

The model is selected in Codex; text inside this prompt cannot change it.

~~~text
Implement Phase 03: Authentication, sessions, and account security.

Read AGENTS.md, docs/PROJECT_STATE.md, docs/HANDOFF.md, and phases/PHASE_03_authentication_sessions.md completely. Read only the reference documents/sections listed in this phase plus code needed for its scope. Inspect the repository and current diff before editing; the planning files do not prove earlier phases were implemented.

Check the prerequisites against actual evidence. Outline a small sequence of implementation checkpoints, then execute this phase's scope and acceptance checks. Reuse existing contracts, components, services, and tests. Preserve unrelated user changes. Apply documented defaults in docs/DECISIONS.md; ask only if a material conflict cannot be resolved from the requirements and actual code.

Implement real working behavior for this phase. Do not add fake success paths, duplicate financial formulas, permissive authorization fallbacks, or features from later phases. Keep all applicable AGENTS.md invariants. Add focused tests for consequential rules and use real PostgreSQL for transaction/concurrency checks. Do not deploy to a live nursery or introduce subagents as a side effect.

At each meaningful checkpoint, update docs/PROJECT_STATE.md with actual progress and evidence. Before a context boundary, finish a safe checkpoint and update docs/HANDOFF.md with precise files, commands/results, unresolved work, and the next action; a phase may span multiple sessions. Never claim the phase is complete simply because context is running low.

When the phase's gate is satisfied, mark it complete with evidence and stop. Report what changed, actual verification, remaining limitations, and the next phase. If blocked, preserve completed work and describe the concrete blocker without marking checks passed.
~~~

