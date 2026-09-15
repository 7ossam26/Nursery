# Production / Dokploy qualification (post-Phase-25 release closure)

Implements Step 6 of the release-closure task. **This is qualification only — no live deployment was performed or
is claimed.** `docker` is not installed on this host (`which docker` finds nothing, same as Phase 23/24 — B24-01
unchanged), so every item that requires an actual container/Dokploy/Traefik environment is explicitly BLOCKED
below, exactly as it was in Phase 23/24. What follows separates that from what a native (non-Docker) run of the
same application code *could* verify, and states plainly which items were verified again this session versus which
still rest on the standing Phase 23/24 evidence.

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Docker image build | **BLOCKED** — no Docker on this host | Unchanged from B24-01. `infra/Dockerfile` re-read this session for consistency with OPERATIONS.md; no drift found. |
| 2 | Compose configuration | **BLOCKED** — no Docker | Unchanged from B24-01. `infra/docker-compose.yml` re-read this session (digest-pinned `postgres:18.4`, one-shot `migrate`, `api`/`worker`, no published ports, `dokploy-network` external) — static review only, not `docker compose config`. |
| 3 | Private PostgreSQL exposure (container network isolation) | **BLOCKED** — no Docker network to inspect | This is a container-topology property (`postgres` service has no `ports:` and sits only on the internal Compose network) that cannot be verified without actually starting Compose. Native equivalent (not the same claim): the disposable PostgreSQL used for all of Steps 3–5 this session was bound to `127.0.0.1` only, never exposed beyond the host. |
| 4 | PostgreSQL startup | **VERIFIED (native)** | Real PostgreSQL 18.4 reachable and used throughout Steps 3 and 5. |
| 5 | Migrations | **VERIFIED (native)** | Fresh install applied all 24 migrations (0000→0023) and an immediate rerun applied 0 — [operator-sequence.txt](operator-sequence.txt). |
| 6 | API startup | **VERIFIED (native)** | `npm run start:api` (the real compiled entry point, not a test fixture) started and logged "schema compatible" — [api-startup.log](api-startup.log). |
| 7 | API health/readiness | **VERIFIED (native)** | `GET /api/v1/health` → `ok`, `GET /api/v1/readiness` → `ready`, real HTTP against the running process — [operator-sequence.txt](operator-sequence.txt). |
| 8 | Worker startup | **VERIFIED (native)** | `npm run start:worker` started, registered schedules, logged `backupsConfigured:true` — [worker-startup.log](worker-startup.log). |
| 9 | Queue processing | **VERIFIED (native)** | The real worker's pg-boss queues actually processed a requested backup (`REQUESTED`→`SUCCEEDED`) and two report exports (`PDF`/`XLSX`, both reached `READY` and were downloaded and parsed) — [WALKTHROUGH_RESULTS.md](WALKTHROUGH_RESULTS.md) rows 5.8/8.2. |
| 10 | Installation-ID consistency | **NOT RE-EXECUTED this session** — `env:check`/`release:prepare` ran this session with a *matching* `INSTALLATION_ID` only; the specific mismatch-refusal path was not re-tested. Phase 23/24's own evidence (`DEPLOYMENT_AND_BACKUP.md`: "a mismatched `INSTALLATION_ID` run exited 1 with the explicit refusal") stands unchanged. | See DEPLOYMENT_AND_BACKUP.md |
| 11 | Production environment validation | **NOT RE-EXECUTED this session** — this session's `env:check`/`release:prepare`/API start ran with `NODE_ENV=development` (a local non-production run), so the production-only rules in `apps/api/src/config.ts` (HTTPS-only `APP_ORIGIN`, ≥32-character database password, `RELEASE_VERSION` not `development`, `BACKUP_DIR` required) were not exercised this session. Phase 23/24 evidence for these specific rules stands unchanged; this is a real gap this session did not close. | See DEPLOYMENT_AND_BACKUP.md |
| 12 | Backup creation | **VERIFIED (native)** | A real manual backup request was picked up by the real worker and completed `SUCCEEDED` — [WALKTHROUGH_RESULTS.md](WALKTHROUGH_RESULTS.md) row 8.2-setup-b. |
| 13 | Backup encryption | **VERIFIED (native)** | The archive was later successfully decrypted and restored by the same real worker (AES-256-GCM, `NBK1` header per `apps/api/src/modules/support/archive-crypto.ts`); a wrong-key/corrupt-archive rejection was not separately re-tested this session, but is unchanged Phase 23/24 evidence. |
| 14 | Backup storage behavior | **PARTIAL (native)** — a local directory off-site target was verified end-to-end this session (`BACKUP_TARGET=directory:<scratch>/offsite`). Genuine remote/off-host storage (a real Hetzner Storage Box, rclone mount, or Dokploy Volume Backup to S3) was **not** available and remains BLOCKED (B24-02 unchanged). |
| 15 | Safe restore | **VERIFIED (native)** | A real restore-validation request ran a real `pg_restore` into the isolated `nursery_uat_restore_check` database and reported `SUCCEEDED` — [WALKTHROUGH_RESULTS.md](WALKTHROUGH_RESULTS.md) row 8.2b. |
| 16 | Restored application data | **VERIFIED (native)** | The restore report's `checks` block shows the exact restored counts (5 accounts, 3 children, matching nursery name, license validity) computed from the restored database itself. |
| 17 | Restored private files | **VERIFIED (native)** | The restore report's `files` block shows `{missing:0, extracted:2, mismatched:0, referenced:2}` — the 2 report-export files generated during the walkthrough (row 5.8/5.8b) were present in the archive, extracted, and matched by checksum in the restored file namespace. Child/expense-document restoration specifically (a different private namespace) was not exercised this session since none were uploaded; Phase 23/24's `test:recovery` suite (re-run clean in Step 5, 3/3) covers that namespace directly. |
| 18 | Recovery behavior (abandoned-run reconciliation) | **NOT RE-EXECUTED this session** as a live scenario (no run was interrupted mid-flight this session), but `npm run test:recovery` (Step 5, 3/3 PASS) directly exercises this path with real PostgreSQL. |
| 19 | Release/rollback behavior | **NOT RE-EXECUTED this session** — restoring an older schema archive and applying only the newest migration forward was not repeated this session; Phase 23's evidence for exactly this scenario (`DEPLOYMENT_AND_BACKUP.md`: "A separate case restores a known 0022 set and applies only `0023_support_backups.sql`") stands unchanged. |
| 20 | Support bundle | **NOT RE-EXECUTED this session** — `npm run support:bundle` was not re-run; Phase 23's evidence (0 secret occurrences) stands unchanged. |
| 21 | Maintenance/restore locking | **NOT RE-EXECUTED this session** — no concurrent backup/restore attempt was made; Phase 23's evidence (advisory locks 7190602/7192301, `WORKER_RESTARTED` classification) stands unchanged. |
| 22 | Session/revocation behavior | **VERIFIED (native), twice** — (a) blocking a guardian mid-session correctly refused a subsequent sign-in (row 6.1/6.2), and (b) the real restore report showed `sessionsRevoked: 4` for the restored database. |
| 23 | Financial integrity after restore | **VERIFIED via Step 5's `test:recovery` re-run (3/3)**, which independently reconciles restored ledger/debt/treasury values against the source; this session's own walkthrough restore additionally shows plausible, consistent restored totals (`outstandingDebtPiastres`, `treasuryBalancePiastres`) in its report but does not itself perform a byte-for-byte source-vs-restored diff — that rigorous check is exactly what `test:recovery` does. |
| 24 | Reverse-proxy/TLS assumptions | **BLOCKED** — no Traefik/Dokploy/real TLS terminator is available on this host; unchanged from B24-01. |

## Conclusion

No new Docker/Dokploy/TLS execution was possible or attempted (B24-01 unchanged; this was never in scope for a
Docker-less host). What *is* new since Phase 23/24: items 4–9, 12, 13 (encryption confirmed by successful decrypt),
15–17, 22 and 23 were re-verified end-to-end this session natively, through the real compiled application code
rather than static review — a stronger local signal than Phase 23/24 had for the same items, though still not a
substitute for actual container execution. Items 10, 11, 14 (remote target), 18–21, and 24 remain exactly as
documented in [DEPLOYMENT_AND_BACKUP.md](../../DEPLOYMENT_AND_BACKUP.md) and [KNOWN_ISSUES.md](../../KNOWN_ISSUES.md)
(B24-01, B24-02) — **not** newly claimed here, and **not** re-verified this session where marked so above.

**This does not authorize or approximate a live deployment.** The repository's final status remains gated on
Docker/Dokploy availability and real deployment inputs (domain, `INSTALLATION_ID`, secrets, off-host backup
destination) as already listed in OPERATIONS.md "Required deployment inputs".
