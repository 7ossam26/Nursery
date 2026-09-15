# Final local verification gates (post-Phase-25 release closure)

Implements Step 5 of the release-closure task. All gates re-run for real on 2026-09-15 against candidate commit
`4a634f0b41445f9823adb8dd35564269200c0b7d` (after the N25-01 fix, Phase 12 conflict analysis, and the executed
acceptance walkthrough), using the same disposable PostgreSQL 18.4 cluster at `127.0.0.1:55421` Phase 24 used
(`DATABASE_URL=postgresql://jo@127.0.0.1:55421/postgres`, isolated random schemas per test). Host: Windows 11
(10.0.22621), Node v25.2.1 / npm 11.6.2 (pins remain 24.19.0/11.1.0 — E24-01 unchanged, unaffected by this work).

## Results versus the Phase 24 baseline

| Gate | Phase 24 baseline | This run | Result |
|---|---|---|---|
| PostgreSQL integration (`npm run test:integration -- --maxWorkers=2`) | 33 files / 185 tests, 561.12s | 33 files / **185 tests**, 383.10s | PASS — identical count |
| Unit (`npm run test:unit`) | 31 files / 118 tests, 37.66s | 31 files / **119 tests** (+1 from the N25-01 regression test), 6.53s | PASS |
| DOM/UI (`npm run test:e2e -- --maxWorkers=1`) | 24 files / 62 tests, 697.56s, 2 residual support-fixture error logs | 24 files / **62 tests**, 574.67s, **0** error-level logs | PASS — identical count, cleaner logs |
| Recovery (`npm run test:recovery`) | 1 file / 3 tests, 75.59s | 1 file / **3 tests**, 50.06s | PASS |
| Performance (`npm run test:release`, run alone) | attendance p95 260.90ms, collection p95 132.75ms | attendance p95 **162.08ms**, collection p95 **98.43ms**, outstanding p95 163.91ms, guardian-history p95 57.27ms, live publish→fresh-read p95 1154.93ms | PASS, all targets met (<500ms reads, <1000ms collection, <5000ms live) — see [performance.json](performance.json) |
| `npm run typecheck` | PASS | PASS | PASS |
| `npm run lint` | PASS | PASS | PASS |
| `npm run build` | PASS (pre-existing >500kB chunk warning) | PASS (same pre-existing warning) | PASS |
| `git diff --check` | PASS | PASS | PASS |
| `npm audit --omit=dev` | exit 1: 2 moderate, 0 high/critical (S24-01) | exit 1: **2 moderate, 0 high/critical** (unchanged) | Same open advisory, not a regression |
| `npm run env:check` / `npm run release:prepare` (fresh + idempotent rerun) | PASS (Phase 23/24 evidence) | PASS — re-executed in Step 3 as part of standing up the walkthrough environment; see [operator-sequence.txt](operator-sequence.txt) | PASS |

No gate regressed. Test counts are identical to the Phase 24 baseline except the one new regression test added by the
N25-01 fix. Performance is measurably better than the baseline sample (expected run-to-run variance on a shared
local machine, not a claimed permanent improvement) and every target still passes with margin. The one open item —
`npm audit`'s 2 moderate ExcelJS→uuid findings — is unchanged from Phase 24 and remains reviewed-but-open per
[KNOWN_ISSUES.md](../../KNOWN_ISSUES.md) S24-01; it is not a new finding from this work.

## What this does and does not establish

This is the strongest available **local** verification: real PostgreSQL, real HTTP/DOM, real backup/restore, real
measured latency. It does not establish container/Dokploy/TLS behavior (B24-01), real VPS capacity or an off-host
backup destination (B24-02), or the pinned-Linux-runtime/SIGTERM behavior (E24-01) — those remain exactly as
recorded in KNOWN_ISSUES.md. See Step 6 in the final report for what could and could not be qualified natively.

Raw evidence: [performance.json](performance.json), [query-plans.json](query-plans.json) (EXPLAIN ANALYZE plans
captured after latency sampling, same method as Phase 24). Full suite transcripts are not attached verbatim (they
are very large); the counts above are the actual final lines of each real command's own summary, run in this
session and not copied from Phase 24's evidence.
