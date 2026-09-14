# PWA, network recovery, and usability hardening

Phase 22 implements R04/R16 (installable PWA, online-only operation with safe recovery, responsive grouped navigation) using the defaults recorded as D50 in DECISIONS.md. No schema change: migration status stays at 0022.

## Service-worker strategy

- `apps/web/public/manifest.webmanifest` (standalone display, `id`/`scope`/`start_url` `/`, brand theme colour) with PNG icons in `apps/web/public/icons/` (192, 512, maskable 512, Apple touch 180) generated once from the favicon glyph with sharp. `index.html` links the manifest, the touch icon and `theme-color`; `BrandingProvider` updates `theme-color` and the document title from the nursery branding.
- `apps/web/src/pwa/service-worker.js` is a plain script. `serviceWorkerPlugin` in `apps/web/vite.config.ts` emits it as `/sw.js` during `vite build` with the exact hashed bundle, `index.html`, the manifest and icons as its precache list and a content-derived version. There is no runtime dependency (no Workbox).
- Install: `cache.addAll(PRECACHE)` into `nursery-shell-<version>`; no `skipWaiting`. Activate: delete other `nursery-shell-*` caches and claim clients. Message `SKIP_WAITING` is sent only when the person presses **Update now** in the `UpdateNotice` banner; only then does `controllerchange` reload, so in-memory form input is never discarded by an update. A bounded `registration.update()` runs when the app returns to the foreground after an hour.
- Fetch: non-GET, cross-origin and every `/api` or `/api/...` request (authenticated data, SSE, receipts/exports/templates) are left to the browser untouched. Navigations are network-first and fall back to the cached `index.html` when offline. Precached hashed assets are served cache-first. Nothing else is intercepted and **no response is ever written to a cache at runtime**, so a revoked or expired session leaves no private data in the service-worker cache. `apps/web/src/pwa/service-worker.unit.test.ts` executes the shipped script in a scripted worker environment and asserts exactly these rules.
- Registration (`apps/web/src/pwa/register.ts`) is production-only (`import.meta.env.PROD`) and optional: the site works without a service worker. The API keeps `Cache-Control: no-store` on every API response.
- Offline shell: the cached document boots the React app, `/api/v1/auth/me` fails, the connectivity dialog explains the problem and no data is shown. Phase 23 serves `dist/` (including `/sw.js`, `/manifest.webmanifest` and `/icons/`) from the API origin with the SPA fallback; until then the build output is verified by `npm run build` (sw.js precache list inspected).

## Network recovery

- `AuthClient` routes every request through one `send()` boundary. A transport failure, a 502/503/504 gateway answer or an unreadable body throws `NetworkError` (not an `AuthError`) and marks the framework-free `connectivity` bus offline; any successful response marks it online. `health()` probes the public `/api/v1/health` with no credentials.
- `ConnectivityProvider` (mounted in `App`) opens the connection-problem modal on the first failure or on the browser `offline` event. Its **Try to reconnect** button runs the health probe; on success it closes the dialog, announces "Connection restored" politely and dispatches `nursery:reconnect` so every `useScoped` read fetches a fresh snapshot without unmounting the stale one. **Keep editing** closes the dialog while a persistent stale/offline notice with the same retry stays visible.
- Memory-only preservation: `useScoped` keeps its last in-memory record (flagged `stale`) on a `NetworkError` instead of clearing it, so forms rendered under loaded options are not unmounted. Authorization errors still drop visible data immediately; hidden-tab/focus revalidation is unchanged. Nothing is written to browser storage.
- Mutation controls: financial submits (`useFinancialOperation`, collections) refuse a new operation while the bus is offline (`network.offline`), and every operation-based screen keeps its frozen `operationId` for status lookup and the identical retry. Publication screens keep their operation ID until the roster is edited, so a republish after a dropped response is idempotent. No write is queued and no payment is resubmitted under a new ID.

## Access revocation audit

| Surface | Behaviour on logout / block / expiry / scope loss |
|---|---|
| In-memory reads (`useScoped`) | Component state under `AuthGate`; a recognised auth error clears the record and the gate unmounts the screen. Client revision bump discards in-flight responses. |
| Live stream (`ParentLive`) | Closed when the session leaves; `revoked` triggers `client.current()` and the resulting auth error signs out. Server closes streams on the next policy tick. |
| Other tabs | `AuthProvider` posts `{type:'revalidate'}` on the `nursery-session` BroadcastChannel after sign-in, sign-out or revocation; every tab re-asks `/auth/me` and drops its own view. The message carries no session data. |
| History / bfcache | `pageshow` with `persisted` revalidates the session before a restored page is trusted. |
| Private downloads | Receipt PDFs use the authenticated client (`downloadFile`) and a temporary object URL that is revoked immediately; a blocked session receives `ACCOUNT_BLOCKED` in-app. Report exports and templates already used the client. Server checks apply to every download request. |
| Service-worker caches | Only the versioned public shell; no API response is ever cached. |
| Session clear event | `nursery:session-cleared` lets long-lived listeners release object URLs or streams. |

## Layout and navigation

`AuthGate` wraps every authenticated screen in `SessionShell`, which picks the persona from the account (`GUARDIAN` → parent; `STAFF` with `CLASSROOM` scope → teacher; branch-wide staff and `SYSTEM` → administration with a separately styled support group). `navigation.ts` items carry `when` predicates over the session capabilities/scope; the parent **Payments** item follows the server's `parent/payment-options`. Hidden destinations are a convenience only — routes and APIs enforce the same rules. Parent and teacher keep five labeled destinations (sidebar on wide screens, fixed bottom strip under 768px); administration uses grouped sidebar sections that become a horizontally scrollable strip on phones. Screens no longer repeat language switchers or account links; the header carries branding, language and the account link. Frames rendered inside the shell use an embedded card variant.

## Theme validation

`features/licensing/theme.ts` derives, from the stored theme, `--color-action-foreground`/`--color-error-foreground` (best of surface/text), `--color-brand-foreground`, a darkened `--color-action-hover`, and per-status surfaces that fall back to the theme surface when the fixed pastel would drop below 4.5:1. Buttons and the brand mark use these variables. `theme.unit.test.ts` checks every default token pair and a valid-but-light theme. Status badges, state panels and learning statuses always carry text or an icon; receipt/report PDFs use the accent only for decorative rules (text stays #111827).

## Verification

Commands, results and remaining limits are recorded in PROJECT_STATE.md and HANDOFF.md for this phase. Browser installability, the offline shell in a real browser and network-tool inspection of cached responses were **not** executed (no browser automation per AGENTS.md; the manual walkthrough covers them). Supported-browser notes: the worker uses only `caches`, `fetch`, `clients.claim`, `skipWaiting` and `Response.error()` (all browsers with service workers); `BroadcastChannel` and `<dialog>` are guarded so older engines degrade to single-tab revalidation and an `open`-attribute dialog.

## Remaining usability items

- The account page doubles as the **More** destination and still lists every reachable screen as plain links.
- Tables/cards from earlier phases keep their own copy; no visual pass on a physical 360px device was run.
- Update checks depend on browser navigation/foreground heuristics; there is no push-based version signal.
