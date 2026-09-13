# Sources and verification notes

Technical/model references were checked on 13 September 2026 while preparing the plan. Phase 01 must verify exact compatible dependency versions when implementation actually starts. Software support and client availability can change.

## Product sources and precedence

1. The tech lead's latest conversation decisions.
2. Earlier answers that were not superseded.
3. The uploaded Nursery_Management_Business_Requirements_V1.md for retained scope.
4. Explicit defaults in DECISIONS.md for unresolved routine implementation details.

The uploaded desktop/mobile examples inform simple grouping, spacing, and readable controls. Their hotel/parking content and excessive detail are not product requirements.

The supplied palette image provides #F13E93, #F891BB, #F9D0CD, and #FAFFCB. Additional neutral/text/status colors are deliberate implementation choices. Contrast ratios in UX_AND_BRANDING.md are calculated from the colors; they are not copied from the palette source.

## OpenAI / Codex

| Source | Supports |
|---|---|
| [Official model guidance](https://learn.chatgpt.com/docs/models) | Model profiles, model selection, reasoning tradeoffs |
| [AGENTS.md guidance](https://learn.chatgpt.com/docs/agent-configuration/agents-md) | Repository instructions and instruction loading/size behavior |
| [Codex usage guidance](https://learn.chatgpt.com/docs/pricing) | Usage efficiency considerations and model/context tradeoffs |

Phase assignments are our recommendations, not official per-feature prescriptions. No exact token window, dollar estimate, or guaranteed task count is asserted.

## Runtime, server, database, jobs

| Source | Supports |
|---|---|
| [Node.js release schedule](https://nodejs.org/en/about/previous-releases) | Node 24 LTS selection at planning time |
| [React versions](https://react.dev/versions) | React 19 release line |
| [Vite guide](https://vite.dev/guide/) | Frontend tooling and runtime requirements to verify |
| [Fastify LTS policy](https://fastify.dev/docs/latest/Reference/LTS/) | Fastify 5 supported line and runtime compatibility review |
| [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html) | Transaction/isolation behavior; current documentation is version-sensitive |
| [PostgreSQL NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html) | Transactional notification behavior; used as a wake-up hint alongside durable records |
| [Drizzle transactions](https://orm.drizzle.team/docs/transactions) | Transaction API for the selected data layer |
| [pg-boss repository](https://github.com/timgit/pg-boss) | PostgreSQL-backed job processing |

The particular monolith/module layout, lock strategy, idempotency keys, checkpoint engine, and financial ownership rules are the plan's design decisions. A database transaction alone does not make an entire business operation retry-safe.

React Native reuse is an architectural intention through stable API contracts and pure utilities; this does not assert that web screens convert automatically.

## Delivery and accessibility

| Source | Supports |
|---|---|
| [Dokploy Docker Compose documentation](https://docs.dokploy.com/docs/core/docker-compose) | Supported Compose deployment workflow |
| [W3C contrast minimum explanation](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) | Text contrast targets and large-text distinction |

The plan chooses Compose for repeatability on the supplied Dokploy environment. It does not depend on adding a separate Nginx service or assume undisclosed VPS specifications.

## Dependency verification policy

Use official package documentation and release notes when pinning versions. Record exact versions and compatibility decisions in DEPENDENCIES.md during Phase 01. Do not use unverified latest tags, invent an OpenAI model identifier, or copy an outdated install command merely because it appears in an old conversation.

When a documented source changes, preserve this planning baseline and append the necessary version decision. Do not silently rewrite business requirements in response to a library update.
