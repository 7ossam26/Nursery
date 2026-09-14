# Current handoff

Updated: 2026-09-15 — Phase22 implemented; strategy, revocation audit and limits in [PWA_AND_NETWORK.md](PWA_AND_NETWORK.md); evidence in PROJECT_STATE.md.

## Phase22 summary and precise files

PWA, network recovery and usability hardening (R04/R16, D50). No migration: schema stays at 0022.

- PWA: `apps/web/public/manifest.webmanifest`, `apps/web/public/icons/{icon-192,icon-512,icon-maskable-512,apple-touch-icon}.png` (generated once with sharp), `apps/web/index.html` (manifest/theme-color/touch icon), `apps/web/src/pwa/service-worker.js` (precache-only shell worker; `/api` never intercepted; no runtime cache writes; `SKIP_WAITING` only on request), `apps/web/vite.config.ts` (`serviceWorkerPlugin` emits `/sw.js` with the built file list and a content version), `apps/web/src/pwa/register.ts` (production-only registration, user-driven update, bounded foreground update check), `apps/web/src/pwa/UpdateNotice.tsx`, `apps/web/src/main.tsx`, `apps/web/src/pwa/service-worker.unit.test.ts`.
- Network recovery: `apps/web/src/features/connectivity/bus.ts` (framework-free online/offline state), `apps/web/src/features/auth/client.ts` (`NetworkError`, single `send()` boundary, gateway statuses, public `health()`), `apps/web/src/features/connectivity/ConnectivityProvider.tsx` (connection-problem modal, keep-editing, stale/offline notice, `nursery:reconnect` refresh), `apps/web/src/features/children/scoped.ts` (stale in-memory records on `NetworkError`, reconnect re-read without unmount), `apps/web/src/features/finance/use-operation.ts` and `collections-screen.tsx` (refuse new operations while offline; frozen operation ID unchanged), `apps/web/src/components/Modal.tsx` (dialog API guard), `apps/web/src/App.tsx` (providers, update notice).
- Revocation audit: `apps/web/src/features/auth/AuthProvider.tsx` (`nursery-session` BroadcastChannel revalidation on sign-in/sign-out/revocation, bfcache `pageshow` revalidation, `nursery:session-cleared` event), `apps/web/src/features/finance/receipt-card.tsx` (authenticated PDF download with revoked object URL).
- Layout/navigation: `apps/web/src/layout/navigation.ts` (capability/scope-aware items, `shellRoleFor`, `visibleGroups`), `apps/web/src/layout/AppShell.tsx` (filtered navigation, support group, account link, shell context; content wrapper is a `div` so each screen keeps its single `main`), `apps/web/src/layout/SessionShell.tsx`, `apps/web/src/features/auth/screens.tsx` (`AuthGate` wraps screens in the shell; embedded frame variant), 19 feature screens with redundant language switchers/account links removed (`attendance`, `children`, `communication` ParentFrame, `exams`, `finance/*`, `homework`, `imports`, `learning`, `licensing`, `organization`, `reports`), `design-system/ComponentPreview.tsx`, `apps/web/src/styles.css`, `apps/web/src/i18n/catalogs.ts` (`network.*`, `pwa.*`, `nav.*` keys in both languages), `apps/web/src/layout/navigation.unit.test.ts`.
- Theme: `apps/web/src/features/licensing/theme.ts` (derived action/error/brand foregrounds, hover, status surfaces), `BrandingProvider.tsx` (applies them and `theme-color`), `styles.css` variables, `theme.unit.test.ts`.
- Tests: `tests/helpers/http-client.ts` (optional offline gate), `tests/e2e/network-recovery.test.tsx` (4), `tests/e2e/collections.test.tsx` and `tests/e2e/parent-hub.test.tsx` (shell navigation queries; A06 API/download/SSE refusal after block).
- Docs: DECISIONS D50, PWA_AND_NETWORK.md, TESTING_AND_ACCEPTANCE (Phase22 evidence pointer), UX_AND_BRANDING (implementation note), OPERATIONS (PWA asset serving), PROJECT_STATE.

## Actual commands/results

Disposable PostgreSQL18.4 UTF8 cluster `C:/Users/jo/AppData/Local/Temp/nursery-phase19-pg-utf8` on 127.0.0.1:55421 (`DATABASE_URL=postgresql://jo@127.0.0.1:55421/postgres`), fresh isolated schemas per fixture. No live nursery database, deployment, browser automation or subagent.

    $env:DATABASE_URL='postgresql://jo@127.0.0.1:55421/postgres'
    node node_modules/vitest/vitest.mjs run --config vitest.e2e.config.ts tests/e2e/network-recovery.test.tsx --maxWorkers=1
    node node_modules/vitest/vitest.mjs run --config vitest.e2e.config.ts tests/e2e/collections.test.tsx tests/e2e/parent-hub.test.tsx --maxWorkers=1
    node node_modules/vitest/vitest.mjs run --config vitest.e2e.config.ts --maxWorkers=1
    npm run test:unit; npm run typecheck; npm run lint; npm run build; git diff --check

Results: network-recovery 4/4 (33.6s standalone); collections 4/4 and parent-hub 3/3; full DOM suite on the final source 22 files/58 tests in 492.62s; units 27 files/103; typecheck/lint/build/diff-check exit 0 (existing Vite chunk warning). Integration (PostgreSQL service) suites were not re-run: no API, service or schema code changed in this phase.

## Remaining limitations and unchanged work

Browser installability, the offline shell in a real browser, DevTools network/cache inspection and a physical 360px visual pass were not executed (manual walkthrough items; no browser automation per AGENTS.md). The receipt PDF download button is exercised in DOM tests only up to the authenticated request: vitest's jsdom realm breaks pdf-lib's `Uint8Array` check, so rendering evidence stays in the node-environment receipts suite. The account page still serves as the **More** destination with plain links. Host Node25.2.1/npm11.6.2 differ from pins; no pinned-runtime certification, performance or live deployment claim. Unresolved Phase12 screenshot handoff is unchanged.

## Next executable action

Phase22 is COMPLETE (evidence in PROJECT_STATE.md). The disposable cluster on 55421 was left running for optional inspection; stop it with `pg_ctl -D C:/Users/jo/AppData/Local/Temp/nursery-phase19-pg-utf8 stop`. Next phase: 23 — Dokploy deployment assets, backup, restore, and support (must serve `dist/` including `/sw.js`, `/manifest.webmanifest`, `/icons/` with the SPA fallback). Do not begin it unless explicitly requested.
