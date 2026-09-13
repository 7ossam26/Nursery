# Resume the current phase

Use the model/effort recommended in the active phase. This prompt resumes work; it does not start the entire plan.

~~~text
Continue the nursery project from the repository's recorded state.

Read AGENTS.md, docs/PROJECT_STATE.md, docs/HANDOFF.md, and the active phase file. Inspect the current diff and relevant code. Reconcile the handoff with actual files and verification evidence; do not repeat completed work or assume a planned phase ran.

Summarize the current checkpoint briefly, then execute the next unfinished part of the active phase using only its relevant domain references. Preserve unrelated user work and the product invariants. Apply documented defaults rather than reopening resolved questions.

Run the checks needed for the changed behavior and the phase's gate. Record exact commands/results. Update PROJECT_STATE.md and HANDOFF.md at a safe checkpoint, especially before a context boundary.

Complete this phase if possible, then stop. If a concrete blocker remains, preserve the finished work and explain it without claiming completion. Do not automatically start the next numbered phase.
~~~
