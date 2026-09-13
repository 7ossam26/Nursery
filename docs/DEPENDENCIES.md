# Phase 01 dependencies

Verified on 2026-09-13 against official project documentation and the npm registry. All package versions are exact pins in `package.json`; transitive dependencies are frozen in `package-lock.json`.

| Component | Pin | Evidence / rationale |
|---|---:|---|
| Node.js | 24.19.0 | Current LTS major from the Node release schedule; installed locally with Windows Package Manager. |
| npm | 11.1.0 | Bundled project package-manager pin. |
| PostgreSQL | 18 (target); 17.9 local verification instance | PostgreSQL 18 remains the production target. The existing local service is PostgreSQL 17.9, so it is used only for Phase 01 development verification. |
| React / React DOM | 19.3.0 | React 19 current documented line. |
| React Router | 7.18.3 | Fixed patch selected after `npm audit --omit=dev` identified high-severity advisories in 7.13.0. |
| TypeScript | 5.9.3 | Exact stable pin compatible with the selected TypeScript ESLint toolchain; TypeScript 7.0.2 was tested and rejected because that ESLint integration crashed. |
| Vite | 8.3.0 | Current compatible Vite toolchain line. |
| Fastify | 5.12.4 | Latest verified Fastify 5 patch line. |
| Drizzle ORM / kit | 0.45.2 / 0.31.10 | PostgreSQL driver integration selected in architecture; migration runner remains deliberately explicit and lock-protected. |
| node-postgres | 8.23.0 | Drizzle PostgreSQL driver. |
| Zod | 4.6.4 | Runtime contract validation. |
| dotenv | 17.4.2 | Loads an ignored local `.env` for the API and migration runner. |
| Vitest | 5.0.0 | Unit, integration, and local startup smoke tests. |

Sources: [Node releases](https://nodejs.org/en/about/previous-releases), [React versions](https://react.dev/versions), [Fastify LTS](https://fastify.dev/docs/latest/Reference/LTS/), [PostgreSQL versioning](https://www.postgresql.org/support/versioning/), and [Drizzle PostgreSQL setup](https://orm.drizzle.team/docs/get-started-postgresql).

`drizzle-kit` is intentionally not installed in Phase 01: migrations are checked-in SQL and executed by the repository's lock-protected runner, which avoids an unreviewed generated schema baseline. Add it only when a later phase needs reviewed schema generation. Playwright was removed at the user's direction; the Phase 01 startup smoke is an HTTP/Vite script test, not browser automation.
