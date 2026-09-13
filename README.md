# Nursery

Modular TypeScript workspace for one independently deployed nursery per installation. Phase 01 provides only the startup foundation; business modules are introduced incrementally in later phases.

## Prerequisites

- Node.js 24.19.0 (`.nvmrc`)
- npm 11.1.0
- A locally running PostgreSQL server. PostgreSQL 18 is the target line; the current local verification service is 17.9.

## Local setup

1. Copy `.env.example` to `.env` and set `DATABASE_URL` to a local database account you control. The API and migration runner load this ignored file automatically; keep it uncommitted.
2. Install exactly pinned dependencies: `npm ci`.
3. Apply the migration: `npm run db:migrate`.
4. Start the API with `npm run dev -w @nursery/api` (port 3000), web app with `npm run dev -w @nursery/web` (port 5173), and worker with `npm run dev -w @nursery/worker`.

The API provides `GET /api/v1/health` and `GET /api/v1/readiness`. Readiness returns HTTP 503 and the safe `not_ready` state if PostgreSQL cannot be reached. Runtime configuration is server-only; never expose `DATABASE_URL`, session secrets, or support configuration through `VITE_*` variables.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Starts all workspace development entries. |
| `npm run build` / `lint` / `typecheck` | Builds and validates all packages. |
| `npm run test:unit` | Runs unit tests (there are no Phase 01 unit specs yet). |
| `npm run test:integration` | Runs real local PostgreSQL checks when `DATABASE_URL` is provided; otherwise reports its test as skipped. |
| `npm run test:e2e` | Scripted Vite startup/HTTP smoke; it starts an isolated local Vite server and verifies its application document. |
| `npm run db:migrate` | Applies each checked-in migration once under a PostgreSQL advisory lock. |
| `npm run db:seed:demo` | Reports that Phase 01 has no demo data and makes no changes. |

The schema baseline has only `installation_baseline` and `schema_migrations`; it intentionally does not create future business-domain tables.
