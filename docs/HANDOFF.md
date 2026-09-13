# Current handoff

Updated: 2026-09-13 — Phase 02 complete.

## Current task

Phase 02 is complete. Do not begin Phase 03 until the user explicitly requests it.

## Read next

1. ../AGENTS.md
2. PROJECT_STATE.md
3. ../phases/PHASE_03_authentication_sessions.md when Phase 03 is requested
4. Relevant Phase 03 reference sections only

## Next executable action

When requested, begin Phase 03 from its stated prerequisites. Preserve the Phase 02 design contracts, the local `.env`, and migration history.

## Confirmed latest decisions

UI locale values are `en` and `ar-EG`; a supplied user preference wins over local storage, with English as fallback. Business values remain language-independent. Business dates persist as ISO date-only values, display as `dd/MM/yyyy` with Latin digits, and instants use `Africa/Cairo`. Money remains integer piastres and displays as exact Latin-digit EGP.

The bright brand pink uses dark `#111827` text; white text is reserved for the strong `#BE185D` action. Persistent theme settings and server capability filtering remain later-phase work.

## Evidence and open work

Changed files: root `package.json`/`package-lock.json`, `vitest.unit.config.ts`, `README.md`, `tests/e2e/startup.test.ts`; `packages/domain/src/index.ts` plus display tests; `packages/ui/src/index.ts` plus theme tests; and the web app entry, styles, bilingual catalogs/provider, component library, navigation metadata/shells, development preview, and component/responsive tests under `apps/web/src`. `docs/PROJECT_STATE.md` and this handoff contain the phase evidence.

Shared components: `Button`, `TextField`, `SelectField`, `DateField`, `ErrorSummary`, `Modal`, `Card`, `Skeleton`, `StatePanel`, `ResponsiveTable`, and labeled inline `Icon`. The modal uses native dialog behavior and explicitly restores focus. Tables use semantic desktop markup and a mobile definition-list card alternative. All controls target at least 44px and icons supplement text rather than replacing it.

Semantic token names: brand, brandSoft, peach, notice, text, textMuted, surface, surfaceSubtle, background, action/actionHover, success/successSurface, warning/warningSurface, error/errorSurface, info/infoSurface, border, focus, and support/supportSurface; also shared radius, shadow, motion, minimum-control, and maximum-content tokens. `contrastRatio`, `validatesTextContrast`, and `readableForeground` are reusable by the later persistent theme form. CSS-token alignment is tested.

Navigation conventions: production-neutral route groups are `/parent/*`, `/teacher/*`, `/administration/*`, and `/support/*`. Parent and teacher narrow navigation is limited to five labeled destinations; administration is grouped into daily and management sections; support has a distinct indigo shell. `ParentShell`, `TeacherShell`, `AdministrationShell`, and `SupportShell` wrap the common `AppShell`. These are navigation/presentation contracts only; Phase 04 must hide and enforce destinations from server capabilities. The development preview adds `/__preview` as a path prefix and is lazy-imported only in development.

Translation pattern: add each key to the typed English catalog and matching Egyptian Arabic `Record<MessageKey, string>`, then call `useLocale().t`. `LocaleProvider` updates `html[lang]`/`html[dir]`, accepts a per-user locale, and persists the local selection under `nursery.locale`. Keep persisted codes/slugs outside catalogs. Synthetic preview records live inside the development-only module rather than the production catalog.

Actual final passed checks: `npm run lint`; `npm run typecheck`; `npm run build`; `npm run test:unit` (6 files, 29 tests); `npm run test:e2e` (1 file, 1 scripted Vite history-fallback test); `npm audit --omit=dev` (zero vulnerabilities); production bundle scan for synthetic `Mariam Hassan`/`child-001` records; and `git diff --check`. The responsive repository checks cover 360px, 768px, and 1280px contracts in LTR and RTL, page overflow containment, mobile table cards, focus styles, 44px controls, and reduced motion. Bilingual DOM renders passed axe with color contrast handled by exact token-ratio tests. No browser automation or screenshots were used because U24 prohibits them. Interim test-harness failures (a TypeScript import shape and Vite teardown after transformed CSS requests) were fixed; the final gate above passed.

Migration status: no migration was added or required. Database integration/concurrency tests were not run because Phase 02 adds no persistence, transaction, scope, quota, or billing behavior. Nothing was deployed.

Remaining limitations: authentication-backed profile persistence is Phase 03+, capability enforcement is Phase 04, and persistent nursery theme editing/audit is Phase 05. Nuanced Egyptian Arabic copy still requires the planned tech-lead manual review. PostgreSQL 18 remains the production target; the existing local PostgreSQL 17.9 evidence belongs to Phase 01.

Next action: on explicit request, read Phase 03 and its named references, verify prerequisites from the code/diff, and implement authentication only through its gate.
