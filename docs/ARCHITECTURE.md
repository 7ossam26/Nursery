# Architecture

This is a selected implementation architecture, not a claim that it has already been built.

## Runtime and dependencies

| Layer | Choice | Purpose |
|---|---|---|
| Language/runtime | TypeScript; Node.js 24 LTS | Shared language, supported server runtime |
| Web client | React 19, Vite, React Router | Responsive client with explicit routes and later reusable API |
| Server | Fastify 5, Zod, OpenAPI generation | Modular HTTP API and runtime boundary validation |
| Persistence | PostgreSQL 18; Drizzle with node-postgres | Relational constraints, transactions, explicit migrations |
| Server state/forms | TanStack Query, React Hook Form | Scoped query invalidation and approachable forms |
| UI | CSS-variable tokens, Tailwind, accessible Radix/shadcn-style components, Lucide icons, Motion | Consistent RTL/LTR design and controlled animations |
| Background work | pg-boss using the installation PostgreSQL | Recurring billing, reminder processing, export jobs; no Redis service required |
| Files | Private persistent volume behind authorized API | Generic administrative attachments and generated documents |
| Documents | ExcelJS; server HTML-to-PDF through Playwright/Chromium | Excel templates/exports and Arabic-capable A4 receipts |
| Verification | Vitest, real PostgreSQL integration tests, Playwright, axe | Business rules, permissions, transactions, and critical UI workflows |
| Delivery | One application image used for API/worker; PostgreSQL; Dokploy routing | Repeatable independent installations |

These are recommendations grounded in the [primary sources](REFERENCE_SOURCES.md). The selected runtime/release lines were checked against the [Node release schedule](https://nodejs.org/en/about/previous-releases), [React versions](https://react.dev/versions), and [Fastify LTS policy](https://fastify.dev/docs/latest/Reference/LTS/). Phase 01 verifies compatible stable versions and pins exact versions/lockfile. Do not use floating latest tags or silently substitute an unrelated framework.

Node runs the backend and frontend tooling; browser UI is React. A future React Native client reuses API contracts and appropriate pure utilities; mobile screens will still require implementation.

## Repository map

| Path | Responsibility |
|---|---|
| apps/api/src/modules/<domain> | routes, service, repository, policy, schemas |
| apps/api/src/plugins | database, auth, request context, errors, security headers |
| apps/web/src/features/<domain> | screens, forms, query hooks |
| apps/web/src/components | shared UI and layout |
| apps/web/src/i18n | English and Egyptian Arabic messages |
| apps/worker/src | billing/reminder/export/backup job entry points |
| packages/contracts | public DTOs, validation, error codes, OpenAPI |
| packages/domain | pure money, date, status, and permission helpers |
| packages/db | schema, SQL migrations, test factories |
| packages/ui | reusable web components/tokens; no backend dependencies |
| tests/integration | PostgreSQL integration and concurrency checks |
| tests/e2e | user-visible critical scenarios |
| infra | reproducible installation and upgrade assets |
| docs | product rules, decisions, state, operator/developer guides |

Route handlers validate and authorize, then call a domain service. Services own transactions and invariants. Repositories perform parameterized persistence. Jobs and imports call the same services under an explicit service/operator context. Do not embed SQL in React or copy business formulas into several endpoints.

Domain ownership: identity/access, organization, guardians/children, safety, learning, communication, billing, treasury, expenses, payroll, activities/transport, reports/imports, installation/support.

## Installation isolation

Each deployment has an installation ID, database credentials, independent database, session secret, private volume, branding, and backup prefix. Never query another customer's database from a request. Avoid a speculative shared-tenant data model. A future SaaS migration is a separate design/data migration project; these boundaries reduce coupling without promising a free conversion.

Serve the web build and /api/v1 from the same origin. Dokploy terminates HTTPS. The API may serve built assets directly; a dedicated Nginx container is unnecessary for this application. Configure proxy trust narrowly, secure cookies, and SSE proxy behavior. Deployment is explained in OPERATIONS.md.

## Request context and permission checks

Resolve session, installation license, account status, capability set, branch/classroom assignments, and guardian links on every protected request. Pass a typed actor context into services. Support scopes explicitly; never trust a client branchId without checking it. Reports, files, exports, background job results, and SSE have the same checks.

Use deny-by-default policies and positive capability checks. Role names are editable records. Stable capability keys and reserved system identities are infrastructure. Sensitive financial edits require the ordinary capability plus a per-user grant controlled by Superadmin.

## Consistency and money

Use transactions, row locking/atomic updates, unique constraints, and bounded retries. Do not assume a transaction alone prevents duplicate business actions. Every payment, salary settlement, import commit, recurrence occurrence, and debt transfer has a stable idempotency/business key. Request payload hash conflicts return a clear conflict, not a second mutation.

Use integer piastres in PostgreSQL BIGINT and domain BigInt/decimal-safe arithmetic. JSON amount fields are integer strings. Formatting is presentation-only. Never use binary floating point for stored money or round each arithmetic step independently.

## Live updates and background work

Mutation transaction inserts durable state, audit, recipient notification records where appropriate, and a lightweight change event. PostgreSQL NOTIFY may wake listeners after commit; it is an invalidation hint, not durable application history. Reconnecting clients fetch a fresh scoped snapshot.

SSE sends only authorized invalidations and safe IDs; re-check account/license/recipient scope before dispatch and close invalid sessions. Heartbeat and a bounded fallback refresh handle proxy/network failures. Never send an unfiltered global event stream. Auth/scope changes invalidate existing connections.

pg-boss runs bounded jobs. Charge generation has a separate unique occurrence key in the billing schema, even if the queue retries. Crash after commit and before acknowledgment must not create a second charge or reminder. Worker start-up catches up valid missed active periods without billing paused/ended agreement gaps.

## Files, imports, and exports

Database stores file metadata and scope; bytes stay outside the public web directory. Check ownership on each download. Validate content signature, MIME, size, and filename; sanitize generated names; reject executable/HTML/SVG uploads. Avoid including child names in public URLs.

Imports stage validated data, show errors, and commit through shared services. Exports query only authorized rows and retain creator/scope metadata until download. Use short retention for generated downloads; original business documents follow archive policy.

## Development and configuration

Phase 01 must create root commands: dev, build, lint, typecheck, test:unit, test:integration, test:e2e, db:migrate, db:seed:demo. The commands do not exist in the planning package. Use cross-platform development scripts without assuming the tech lead's local operating system. Production start and worker start are separate.

Configuration validates DATABASE_URL, APP_ORIGIN, SESSION_SECRET, INSTALLATION_ID, BUSINESS_TIMEZONE, PRIVATE_FILES_DIR, support contact, and deployment-specific backup settings. Secrets never go into frontend environment variables or committed examples.

Incremental migrations add each phase's schema. Never generate the entire application schema in Phase 01. Upgrade migrations run once under a migration lock before starting compatible workers.
