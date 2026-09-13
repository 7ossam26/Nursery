# Targeted fix prompt

Use Luna for straightforward copy/docs, Terra for established isolated behavior, Sol for connected UI/workflows, and Astra for money, authorization, concurrency, data integrity, or risky migrations. Select the model yourself.

Fill in the reproduction and expected behavior; attach only relevant evidence.

~~~text
Fix this issue in the nursery application.

Issue:
[What happened.]

Expected behavior:
[What should happen, with the relevant requirement/decision if known.]

Reproduction and evidence:
[Role, permitted branch/classroom or child, steps, date/amount if relevant, error, screenshot, or failing check.]

Read AGENTS.md, docs/PROJECT_STATE.md, docs/HANDOFF.md, and the domain specification relevant to this issue. Inspect actual code, current diff, and any existing test that should cover it.

Reproduce or isolate the cause before changing code. Implement the smallest complete fix at the shared service/component boundary. Preserve unrelated changes and existing architecture. Do not rewrite surrounding features or reinterpret equal discounts, slot reservation, manual blocking, immutable publication, or finance rules to make the issue disappear.

For consequential behavior, add or adjust a focused regression check that fails for the defect and passes after the fix. Use real PostgreSQL for financial, quota, scope, and concurrency behavior. For a low-impact copy/layout fix, use appropriate visual/build checks rather than inventing a broad test suite.

If a schema change is necessary, explain its effect and provide a safe forward migration. Update contracts/docs if behavior intentionally changes. Do not alter production data or deploy as a side effect.

Run affected checks, record actual results, update state/handoff, and report the root cause, changed behavior, verification, and any remaining limitation. Stop when the issue is sufficiently verified.
~~~
