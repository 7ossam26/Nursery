# Intentional requirement change

Use this when the tech lead changes the product, rather than reporting a defect. Select the model for the highest-risk affected area.

~~~text
Apply this nursery product change:
[New requirement and a concrete example.]

Read AGENTS.md, docs/PROJECT_STATE.md, docs/HANDOFF.md, the affected domain rules, and relevant code. The new user instruction takes precedence over an older plan. Identify affected requirements, defaults, data/API contracts, screens, permissions, jobs, reports/imports, tests, and phase prerequisites.

Write a dated decision entry explaining what changes and why. Update the canonical specification and affected remaining phase files so future Codex sessions use the same rule. Preserve old decision context rather than claiming the original plan already said this.

Implement the authorized change in bounded checkpoints using existing services. For a material unresolved conflict, complete useful analysis and ask one focused question; do not ask the user to reapprove routine choices already covered by their request.

Include safe migration/compatibility handling for existing data where needed. Verify consequential rules with focused checks and record actual evidence. Update PROJECT_STATE.md/HANDOFF.md and report resulting behavior, migration impact, checks, and remaining work.

Do not restart the project, revive unrelated excluded features, or execute later phases automatically.
~~~
