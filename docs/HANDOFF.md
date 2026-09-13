# Current handoff

Updated: 2026-09-14 — Phase 07 complete.

## Next executable action

Phase 07 acceptance gate is satisfied. Stop. Begin Phase 08 (Versioned checkpoints and publication engine) only when requested; read its required files/references and inspect actual code/diff. No Phase 08+ behavior, browser automation, subagents or deployment was introduced. All Phase 07 work is uncommitted in the working tree (17 modified files, 11 new paths).

[SAFETY.md](SAFETY.md) contains the safety permissions, pickup rules, incident event contract, WhatsApp normalization, migration/operator wording and detailed evidence. D33 and API_AND_DATA_CONTRACTS.md reference the implementation. Phase 06 details remain in CHILDREN_AND_DOCUMENTS.md.

## Changed files and integration

- Schema/contracts: packages/db/src/migrations/0005_safety.sql (six delegable capabilities health.read/manage, pickup.record/manage, incidents.read/manage; module_settings check widened with PICKUP/INCIDENTS rows; health_entries, pickup_authorizations, pickup_restrictions, append-only pickup_records, incidents, append-only notification_events). packages/contracts/src/safety.ts (+ safety.unit.test.ts), children.ts exports mobileSchema, organization.ts capability catalog, licensing.ts moduleKeys/impacts, index.ts MODULE_DISABLED code and export. packages/domain/src/index.ts normalizeWhatsAppNumber/whatsAppLink (+ phone.unit.test.ts).
- API: apps/api/src/modules/safety/{policy,service,routes}.ts registered in app.ts after children. SafetyService reuses ChildService.withPolicy (same license/organization/guardian-scope locks), ChildService.audit (child_audit_events), resolveChild/requireChild for staff scope and requireGuardianChild for link permissions; loadModules/requireModule gate writes with MODULE_DISABLED; blockers computed per authorization (INACTIVE, REJECTED, NOT_YET_VALID, EXPIRED, PROHIBITED_COLLECTOR, REVIEW_REQUIRED).
- Web: apps/web/src/features/safety/{copy.ts,screens.tsx} (ChildSafetyPanel inside ChildDetailScreen, GuardianSafetyPanel inside GuardianChildScreen); apps/web/src/features/children/scoped.ts extracts useScoped/errorKey from children/screens.tsx (behavior unchanged); i18n/catalogs.ts merges safety copy; licensing/copy.ts adds PICKUP/INCIDENTS module labels. wa.me links are user-initiated anchors built client-side from server-normalized digits.
- Tests: tests/helpers/safety.ts (fixture: safety staff roles, two-guardian family, module toggles); tests/integration/safety.test.ts (4); tests/e2e/safety.test.tsx (2, bilingual); tests/integration/organization-migration.test.ts expects 0005 and 6 applied migrations; tests/helpers/auth.ts close() calls server.closeAllConnections() before app.close() (fixture-only fix for the Fastify 72 s keepAliveTimeout teardown hang).
- Docs: SAFETY.md (new), DECISIONS D33, API_AND_DATA_CONTRACTS Phase 07 section, ACCESS_AND_LICENSING disabled-behavior sentence, TRACEABILITY R08 row, PROJECT_STATE and HANDOFF.

## Actual final verification

Node 24.19.0/npm 11.1.0 from %TEMP%/nursery-phase07-tools (npm invoked as `node .../npm-cli.js` because the Git Bash shim mis-resolves its path); disposable real PostgreSQL 18.4 at 127.0.0.1:55407 (%TEMP%/nursery-phase07-pg, trust, nursery_test, `DATABASE_URL=postgresql://postgres@127.0.0.1:55407/nursery_test`). No .env present or created; system PostgreSQL service on 5432 untouched. The cluster is left running (pid recorded in its postmaster.pid); stop with `pg_ctl -D %TEMP%/nursery-phase07-pg stop -m fast` when no longer needed.

- Prerequisite: npm run test:integration -- tests/integration/children.test.ts → 10/10 before editing.
- npm run test:unit → 47/47.
- npm run test:integration -- tests/integration/safety.test.ts tests/integration/organization-migration.test.ts → 6/6; npm run test:integration (all 8 files) → 45/45 after restarting the cluster (first all-files attempt failed uniformly because the PostgreSQL process died mid-run; WAL redo on restart; orphaned auth_test_* schemas dropped).
- npm run test:e2e -- tests/e2e/safety.test.tsx → 2/2; npm run test:e2e -- tests/e2e/children.test.tsx → 3/3 (after the fixture teardown fix; before it, every children DOM test hit the 30 s afterEach hook timeout); npm run test:e2e (all) → 11/13, failing only tests/e2e/authentication.test.tsx:52 (assisted-reset warning within the default 1 s findByText after two scrypt operations) in both locales; verified identical failure on the pristine Phase 06 tree via git stash, so not a Phase 07 regression and not fixed here.
- npm run typecheck; npm run lint; npm run build → passed for all workspaces. npm audit; npm audit --omit=dev → 0 vulnerabilities. git -c core.whitespace=cr-at-eol diff --check → passed.

Interim failures were corrected, never marked passed: e2e exact-string matchers on multi-node list items (regex), a textarea/list race (wait for the rendered item), api lint unused symbols, a web hook-order shortcut replaced by a wrapper component. Existing pg parallel-query deprecation warning remains unrelated.

## Operational limits and future hooks

Apply 0005 and assign the six capabilities to roles before staff see safety sections; PICKUP/INCIDENTS start enabled. Phase 12 consumes notification_events (kind incident.reported/incident.updated, recipient snapshot to be revalidated against current links, hint payload without narrative) and owns dispatch/read state; do not mutate the append-only log. Guardian-facing pickup state is limited to pendingNurseryConfirmation; restriction kinds/notes never leave staff responses. Release recording cannot verify a caller physically and stores no arrival/departure times. Known open item outside this phase: authentication e2e reset timing (raise the findByText timeout or reduce test scrypt cost when Phase 22/24 hardening touches auth tests). No phase gate blocker remains.
