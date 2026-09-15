# Nursery

Modular TypeScript workspace for one independently deployed nursery per installation. Phases 01–03 provide the foundation, bilingual design system, and authentication; business modules are introduced incrementally in later phases.

## Prerequisites

- Node.js 24.19.0 (`.nvmrc`)
- npm 11.1.0
- A locally running PostgreSQL server. PostgreSQL 18 is the target line; the current local verification service is 17.9.

## Local setup

1. Copy `.env.example` to `.env` and set `DATABASE_URL` to a local database account you control. The API and migration runner load this ignored file automatically; keep it uncommitted.
2. Install exactly pinned dependencies: `npm ci`.
3. Apply the migration: `npm run db:migrate`.
4. Start the API with `npm run dev -w @nursery/api` (port 3000), web app with `npm run dev -w @nursery/web` (port 5173), and worker with `npm run dev -w @nursery/worker`.

During web development, open `/__preview` to inspect the bilingual component library and parent, teacher, administration, and support navigation shells. The route uses synthetic content and is unavailable in production builds.

Open `/login` to sign in. Bootstrap the installation's SYSTEM account through the private-stdin procedure in [Authentication operation](docs/AUTHENTICATION.md); there are no default credentials. The API and web app use the same browser origin via Vite's `/api` proxy. Account security supports forced password change, sign-out, saved language, and SYSTEM-assisted reset. Business routes remain denied pending Phase 04 capability integration.

The API provides `GET /api/v1/health` and `GET /api/v1/readiness`. Readiness returns HTTP 503 and the safe `not_ready` state if PostgreSQL cannot be reached. Runtime configuration is server-only; never expose `DATABASE_URL`, session secrets, or support configuration through `VITE_*` variables.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Starts all workspace development entries. |
| `npm run build` / `lint` / `typecheck` | Builds and validates all packages. |
| `npm run test:unit` | Runs domain, theme, localization, responsive-contract, and component accessibility unit checks. |
| `npm run test:integration` | Runs real PostgreSQL authentication, concurrency, transaction, and command checks. Authentication checks require `DATABASE_URL` and fail if it is absent. |
| `npm run test:e2e` | Runs bilingual React DOM authentication flows against real HTTP/PostgreSQL plus Vite startup smoke; no browser automation. |
| `npm run test:recovery` | Runs the backup/restore acceptance checks alone (they create/drop whole databases and run `pg_dump`/`pg_restore`); excluded from `test:integration` to avoid starving parallel fixtures. |
| `npm run db:migrate` | Applies each checked-in migration once under a PostgreSQL advisory lock. |
| `npm run db:seed:demo` | Reports that Phase 01 has no demo data and makes no changes. |
| `npm run auth:bootstrap` | Consumes private stdin JSON to create the one-time SYSTEM account. |
| `npm run auth:recover-system` | Consumes private stdin JSON to replace the existing SYSTEM credential and revoke sessions. |
| `npm run start:api` / `npm run start:worker` | Production entry points (validated configuration, schema compatibility check, graceful shutdown); the API serves `apps/web/dist` when `WEB_DIST_DIR` is set. |
| `npm run env:check` | Validates deployment configuration, storage permissions, PostgreSQL client tools and schema state without printing secret values. |
| `npm run release:prepare` | Start/upgrade sequence: environment check, pre-upgrade recovery set when data migrations are pending, migrations under the advisory lock. |
| `npm run backup:create -- --kind MANUAL` | Writes an encrypted recovery set (database + private files + manifest) and the off-host copy. |
| `npm run backup:restore -- --archive <set> --mode validate ...` | Restores a recovery set into an isolated target and verifies it; `--mode live` needs `--confirm-database`. |
| `npm run support:bundle` | Writes a redacted diagnostics JSON for support. |

Migration `0001_authentication.sql` adds accounts, sessions, the one-time bootstrap marker, status history, redacted auth audits and rate counters. Tests create and remove isolated schemas; their database role needs schema-creation permission (the backup/restore suite additionally creates and drops databases and needs `pg_dump`/`pg_restore` on PATH or `PG_BIN_DIR`). No future business-domain tables or production accounts are seeded.

Deployment: `infra/Dockerfile`, `infra/docker-compose.yml` and `infra/.env.production.example` are the Dokploy package; see [docs/OPERATIONS.md](docs/OPERATIONS.md) and [docs/DEPLOYMENT_AND_BACKUP.md](docs/DEPLOYMENT_AND_BACKUP.md).

## For developers and future Codex sessions

**Module map.** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) "Repository map" is authoritative: `apps/api/src/modules/<domain>` (routes/service/repository/policy/schemas), `apps/web/src/features/<domain>` (screens/forms/query hooks), `apps/worker/src` (job entry points), `packages/contracts` (shared DTOs, validation, error codes), `packages/domain` (pure money/date/status/permission helpers), `packages/db` (schema, SQL migrations under `packages/db/src/migrations`), `packages/ui` (reusable components/tokens). Each domain also has a written specification in `docs/` (for example [FINANCE_RULES.md](docs/FINANCE_RULES.md), [DAILY_LEARNING.md](docs/DAILY_LEARNING.md), [ACCESS_AND_LICENSING.md](docs/ACCESS_AND_LICENSING.md)) and, once implemented, an evidence document named after the module (for example [FINANCIAL_CORE.md](docs/FINANCIAL_CORE.md), [EXAMS.md](docs/EXAMS.md)) — read the specification for the rule, the evidence document for what was actually built and verified.

**Data and API contracts.** Request/response DTOs, Zod validation, and error codes live in `packages/contracts/src`; the database schema and every migration live in `packages/db/src/migrations` (applied in order by `npm run db:migrate` / `applyMigrations`, never edited after being checked in — a schema change is always a new migration file). [docs/API_AND_DATA_CONTRACTS.md](docs/API_AND_DATA_CONTRACTS.md) documents the shared contracts and invariants those packages implement.

**Fixture setup for tests.** Real PostgreSQL integration/e2e tests build state through shared, reusable helpers rather than hand-rolled SQL: `tests/helpers/*.ts` (`auth.ts`, `organization.ts`, `children.ts`, `finance.ts`, `learning.ts`, `safety.ts`, `licensing.ts`, `homework.ts`, `exams.ts`, `imports.ts`, plus `http-client.ts`/`http-drain.ts` for real HTTP and `query-plans.ts` for measured query-plan checks). A new test should reuse the closest existing helper rather than duplicating account/branch/child creation. `test:integration` and `test:e2e` require a reachable `DATABASE_URL` with schema-creation permission; `test:recovery` additionally needs `pg_dump`/`pg_restore` on `PATH` (or `PG_BIN_DIR`) because it creates and drops whole databases.

**Making a targeted fix or a product change with Codex.** Use [prompts/FIX.md](prompts/FIX.md) for a defect (pick Terra for an isolated bug, Astra for money/authorization/concurrency/migrations) or [prompts/CHANGE_REQUEST.md](prompts/CHANGE_REQUEST.md) for an intentional requirement change; both prompts already instruct Codex to read `AGENTS.md`, `docs/PROJECT_STATE.md`, `docs/HANDOFF.md`, the relevant domain specification, and the current diff before editing, and to add a focused regression check for consequential behavior. Use [prompts/RESUME.md](prompts/RESUME.md) to continue an interrupted phase from a fresh session. See [docs/MODEL_AND_CONTEXT_GUIDE.md](docs/MODEL_AND_CONTEXT_GUIDE.md) for model/reasoning selection and [docs/DECISIONS.md](docs/DECISIONS.md) before reopening a question that already has a recorded default.
