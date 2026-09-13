# Model choice and context management

These recommendations use the four models you said are available: Astra, Sol, Terra, and Luna. Model selection is a planning judgment based on task risk and ambiguity, not a benchmark result or an exact token-cost forecast.

## Model roles

| Model | Identifier when supported by the client | Assigned work |
|---|---|---|
| Astra | gpt-6-astra | Security boundaries, versioned learning engine, financial correctness/concurrency, imports, final integration review |
| Sol | gpt-5.6-sol | UI design/polish and substantial integration workflows with several interacting rules |
| Terra | gpt-5.6-terra | Structured implementation using established contracts and services |
| Luna | gpt-5.6-luna | Final documentation and consistency work after logic and evidence are fixed |

OpenAI describes these as different capability/cost profiles, with Astra aimed at the most demanding work and Terra/Luna useful for bounded routine tasks. The assignments above are our inference from those profiles. Availability and reasoning controls vary by client/account. [Official model guidance](https://learn.chatgpt.com/docs/models).

## Recommended phase allocation

| Model | Phases |
|---|---|
| Astra / High | 03, 04, 08, 13, 14, 17, 21, 24 |
| Sol / High | 02, 05, 12, 15, 16, 19, 23 |
| Sol / Medium | 06, 09, 10, 11, 22 |
| Terra / Medium | 01, 07, 18, 20 |
| Luna / Low | 25 |

Select the model in Codex before submitting a prompt. Where supported, CLI sessions expose /model; graphical clients use their model picker. A line saying Use Astra inside a task does not change the active model. Choose the closest offered reasoning setting. [Model selection documentation](https://learn.chatgpt.com/docs/models).

No phase automatically uses Max/Ultra reasoning. Higher reasoning can increase time and token consumption; use it when a concrete unresolved issue warrants it. Routine formatting should not consume a complex-reasoning session. [Official reasoning guidance](https://learn.chatgpt.com/docs/models).

## Escalation and smaller fixes

- Typo, label, or documentation correction: Luna / Low; inspect the relevant screen/doc and check consistency.
- Simple established form/report bug: Terra / Medium; preserve existing service contracts.
- UI/accessibility integration or several connected screens: Sol / Medium or High according to complexity.
- Authorization leakage, incorrect money, transaction races, recurring-charge duplication, risky schema migration, or unexplained cross-module failure: Astra / High.

Choose the stronger model at the beginning when the issue is consequential. Repeatedly asking a smaller model to guess through an unresolved financial race may cost more effort than a focused stronger-model session.

Do not hand a partially understood money/security bug to Luna merely because the remaining diff looks small. Do not switch models midway without preserving the current evidence and handoff.

## Context is maintained in files

Codex reads applicable AGENTS.md instructions; this does not mean it automatically reads every document or remembers every old conversation. Keep root guidance concise and explicitly name the active phase and relevant references. Official instructions document a default combined project-instruction size limit of 32 KiB; do not fill AGENTS.md with the entire product plan. [AGENTS.md guidance](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

Use these roles:

| File | Content | Suggested size discipline |
|---|---|---|
| AGENTS.md | Stable working rules and critical invariants | A few pages at most; current baseline is concise |
| docs/PROJECT_STATE.md | Phase status, current checkpoint, verified commands/evidence links | Short table plus active summary |
| docs/HANDOFF.md | Next precise action, changed files, actual checks, unresolved issue | Aim for roughly 300–600 words |
| docs/DECISIONS.md | Product decisions and explicit defaults | Append meaningful changes with affected IDs |
| Phase file | Scope, prerequisites, model, acceptance gate, prompt | Read only the active file |
| Domain specification | Exact rules for the area being changed | Read relevant sections rather than the entire package |
| Evidence/issue documents | Detailed actual command output or reproduction | Link from the short state instead of duplicating |

These size suggestions are organization choices, not model context limits.

## Session protocol

1. Read root instructions, state/handoff, active phase, and its relevant rules.
2. Inspect actual code and diff; confirm prerequisites from evidence.
3. Break the phase into several small implementation checkpoints.
4. Implement and verify each checkpoint, updating state with actual results.
5. Before context becomes tight, stop at a safe boundary, persist the handoff, and start a fresh session with RESUME.md.
6. Finish the current phase before moving to the next. Do not mark incomplete work complete to fit a context window.

Avoid repeatedly pasting this whole package, duplicating logs, or rereading unchanged large files. Smaller relevant context and an appropriate model can improve usage efficiency, but this plan makes no promises about fixed message limits, subscription consumption, dollar cost, or tokens per phase. [Codex usage guidance](https://learn.chatgpt.com/docs/pricing).

## What to report at the end of a session

Phase/checkpoint, files changed, migration effects, exact verification commands/results, unresolved risks, and the next concrete action. Never write tests passed without the evidence, and never confuse generated test files with executed tests.
