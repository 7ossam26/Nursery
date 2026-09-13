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
| `npm run db:migrate` | Applies each checked-in migration once under a PostgreSQL advisory lock. |
| `npm run db:seed:demo` | Reports that Phase 01 has no demo data and makes no changes. |
| `npm run auth:bootstrap` | Consumes private stdin JSON to create the one-time SYSTEM account. |
| `npm run auth:recover-system` | Consumes private stdin JSON to replace the existing SYSTEM credential and revoke sessions. |

Migration `0001_authentication.sql` adds accounts, sessions, the one-time bootstrap marker, status history, redacted auth audits and rate counters. Tests create and remove isolated schemas; their database role needs schema-creation permission. No future business-domain tables or production accounts are seeded.
