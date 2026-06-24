# Cron Job Design

## Context

Taiwan Fin Hub currently syncs data only through authenticated API requests from the web UI:

- `POST /api/connectors/einvoice/sync`
- `POST /api/connectors/tdcc/sync`
- `POST /api/connectors/tdcc/sync/investments`
- `POST /api/connectors/tdcc/sync/bank`
- `POST /api/connectors/tdcc/sync/trades`
- `POST /api/connectors/esun/sync`

The connector settings table already stores encrypted credentials and a `sync_cursor`, and the data writes are mostly idempotent through D1 `ON CONFLICT` upserts. This makes scheduled sync feasible, but the current route handlers mix HTTP request parsing, connector execution, persistence, and response formatting. Cron should reuse the same sync logic without making internal HTTP calls or requiring Cloudflare Access identity.

## Goals

- Keep dashboard data fresh without requiring the user to open the app and press sync.
- Run inside the existing Cloudflare Worker using Cron Triggers.
- Preserve the existing manual sync flows, including OTP handling.
- Avoid overlapping sync runs for the same connector.
- Record enough job history to explain why data is stale.
- Treat automated sync as best-effort: one connector failure must not block the others.

## Non-Goals

- Do not bypass OTP, CAPTCHA, bank device verification, or other interactive security checks.
- Do not introduce a separate server, GitHub Action, or external scheduler.
- Do not add multi-user tenancy in this design.
- Do not implement email, push, or chat notifications in the first version.

## Proposed Schedule

Use a frequent scheduler tick instead of one fixed daily run per connector. Add a top-level cron trigger to `wrangler.toml`:

```toml
[triggers]
crons = ["*/10 * * * *"]
```

Cloudflare cron expressions are evaluated in UTC. `*/10 * * * *` wakes the Worker every 10 minutes. The cron handler does not blindly sync every connector. It only checks D1 for due jobs and claims work that is ready.

This pattern keeps the cron configuration simple while letting job frequency and retry timing live in data. It also reduces timeout risk: each cron invocation runs at most one job and leaves remaining due jobs for the next tick.

Default v1 intervals:

| Job | Default interval | Notes |
| --- | --- | --- |
| `einvoice/all` | 24 hours | Fetch invoice list and details. |
| `tdcc/all` | 24 hours | Sync positions, settlement bank data, and trade history together. Reuse trusted session only; disable the scheduled job when OTP is required. |
| `esun/all` | 24 hours | Reuse valid session only in v1. |

The user can still manually sync when they need immediate updates or when OTP is required.

## Worker Entry Point

The current Worker exports the Hono app directly. Replace it with an `ExportedHandler<Env>` object:

```ts
export default {
  fetch: app.fetch,
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runSchedulerTick(env, controller));
  }
} satisfies ExportedHandler<Env>;
```

`runSchedulerTick` should not call `/api/...` through `fetch`. It should claim due jobs from D1 and call shared service functions that both HTTP handlers and scheduled jobs use.

## Sync Service Refactor

Create a worker-local sync service, for example `apps/worker/src/sync.ts`, with functions shaped around connector operations instead of HTTP routes:

```ts
type SyncTrigger = "manual" | "scheduled";
type SyncScope = string;

const SYNC_SCOPE_ALL = "all";
const TDCC_SCOPE_INVESTMENTS = "investments";
const TDCC_SCOPE_BANK = "bank";
const TDCC_SCOPE_TRADES = "trades";

interface SyncOptions {
  trigger: SyncTrigger;
  scopes?: SyncScope[];
  tdccOtp?: {
    otp: string;
    otpChannel: "email" | "sms";
  };
}

interface SyncOutcome {
  connectorId: ConnectorId;
  scope: SyncScope;
  status: "success" | "failed" | "needs_user_action";
  records: number;
  cursorUpdated: boolean;
  errorCode?: string;
  errorMessage?: string;
}
```

Move the common logic out of route handlers:

- Load connector settings from D1.
- Decrypt and parse config.
- Merge manual-only overrides such as TDCC OTP.
- Execute the connector with the selected connector-local scopes.
- Write records and cursor updates with D1 batches.
- Rebuild bank deposit history when bank balance snapshots changed.
- Return a typed `SyncOutcome`.

The HTTP handlers should become thin adapters that parse request bodies and return JSON. The cron handler should call the same service with `trigger: "scheduled"`.

The scheduler framework treats `scope` as connector-local data. For example, TDCC uses `investments`, `bank`, and `trades`; a future E.SUN split can use different scope names without changing the scheduler type model. A connector-level sync function should accept the requested scopes and decide which internal fetch/write steps to run.

## Connector Policy

| Connector | Scheduled behavior | Reasoning |
| --- | --- | --- |
| `einvoice` | Run when `sync_jobs.next_run_at` is due, with `fetchDetails: true`. | Login token and mobile barcode can be refreshed and stored in encrypted config. Writes are idempotent by `connector_id + source_id`. |
| `tdcc` | Run `tdcc/all` when due: positions, settlement bank data, and trade history are synced in one connector job. If OTP is required, mark `needs_user_action` and set `sync_jobs.enabled = 0`. | TDCC device verification is interactive. The TDCC scopes share cursor/session state, so scheduled sync treats them as one connector job. |
| `esun` | Run when due if stored session cookies are still valid; allow browser login only after an explicit config flag is added. | Current implementation can perform browser login with credentials, but automated bank login may trigger duplicate-login or security checks. V1 should prefer session reuse and manual recovery. |

Scheduled frequency and enablement should live in `sync_jobs`, not in the encrypted connector config. Add optional connector-level behavior later if users want more control:

```ts
{
  allowScheduledInteractiveLogin?: boolean;
  lastUserActionRequiredAt?: string;
}
```

For v1, seeded `sync_jobs` rows should mean:

- `einvoice`: enabled.
- `tdcc`: enabled, but no OTP automation.
- `esun`: enabled for valid-session reuse only.

## Job State and Locking

Add one D1 table for v1 scheduler state and connector-level mutual exclusion.

```sql
CREATE TABLE IF NOT EXISTS sync_jobs (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  interval_minutes INTEGER NOT NULL,
  next_run_at TEXT NOT NULL,
  locked_until TEXT,
  locked_by TEXT,
  lock_trigger TEXT CHECK (lock_trigger IS NULL OR lock_trigger IN ('manual', 'scheduled')),
  lock_scope TEXT,
  last_run_at TEXT,
  last_success_at TEXT,
  last_status TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (connector_id, scope)
);

CREATE INDEX IF NOT EXISTS idx_sync_jobs_due
  ON sync_jobs (enabled, next_run_at);
```

`last_status` uses only these v1 values:

- `success`
- `failed`
- `needs_user_action`

Seed one row per scheduled job:

```sql
INSERT OR IGNORE INTO sync_jobs (
  id, connector_id, scope, enabled, interval_minutes, next_run_at, created_at, updated_at
) VALUES
  ('einvoice:all', 'einvoice', 'all', 1, 1440, '2026-06-24T21:17:00.000Z', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tdcc:all', 'tdcc', 'all', 1, 1440, '2026-06-24T21:37:00.000Z', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('esun:all', 'esun', 'all', 1, 1440, '2026-06-24T22:17:00.000Z', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
```

Use fixed UTC timestamps only as initial seed values. After the first run, the scheduler computes future `next_run_at` values from `interval_minutes` and status.

`sync_jobs` stores two related concepts:

- The due row: the row whose `next_run_at` says a specific connector/scope is ready to run.
- The canonical lock row: the row that prevents overlapping syncs for the same connector.

For v1, the canonical lock row is always `${connector_id}:all`.

| Sync request | Due row | Canonical lock row |
| --- | --- | --- |
| `einvoice/all` | `einvoice:all` | `einvoice:all` |
| `tdcc/all` | `tdcc:all` | `tdcc:all` |
| `tdcc/investments` manual sync | none | `tdcc:all` |
| `tdcc/bank` manual sync | none | `tdcc:all` |
| `tdcc/trades` manual sync | none | `tdcc:all` |
| `esun/all` | `esun:all` | `esun:all` |

This keeps v1 to one table while still preventing scheduled `tdcc/all` and manual `tdcc/investments`, `tdcc/bank`, or `tdcc/trades` from running at the same time.

Scheduled claim and lock:

1. Generate `run_id = crypto.randomUUID()`.
2. Select the oldest due row where `enabled = 1` and `next_run_at <= now`.
3. Resolve its canonical lock row.
4. Atomically lock the canonical lock row:

```sql
UPDATE sync_jobs
SET
  locked_by = ?,
  locked_until = ?,
  lock_trigger = 'scheduled',
  lock_scope = ?,
  updated_at = ?
WHERE id = ?
  AND (locked_until IS NULL OR locked_until < ?);
```

5. Continue only when the update changed exactly one row.
6. If no row was locked, another sync is already running; the tick exits and the due row remains due for a later tick.
7. Always release the lock in `finally` with `WHERE id = ? AND locked_by = ?`.

Manual lock uses the same canonical lock row and the same atomic update, but it must not check `enabled` or `next_run_at`. A disabled job must still be manually runnable so the user can recover from `needs_user_action`.

```sql
UPDATE sync_jobs
SET
  locked_by = ?,
  locked_until = ?,
  lock_trigger = 'manual',
  lock_scope = ?,
  updated_at = ?
WHERE id = ?
  AND (locked_until IS NULL OR locked_until < ?);
```

The lock granularity is `connector_id`, not `scope`. This is intentional:

- `tdcc/all`, `tdcc/investments`, `tdcc/bank`, and `tdcc/trades` share connector settings and cursor state.
- Double-clicking the same manual sync button must not start two upstream login/sync flows.
- A scheduled sync must not overlap with a manual sync for the same connector.

Different connectors may run concurrently if they are triggered by different HTTP requests, but the scheduled tick only runs one job at a time in v1.

Manual sync must acquire the canonical lock row before running. If the lock already exists, return a clear `409 SYNC_ALREADY_RUNNING` response and do not start connector execution.

The v1 lock TTL is 30 minutes. Every sync path should enforce an application timeout shorter than that TTL, for example 25 minutes, so a still-running manual sync cannot lose its lock and be overlapped by another request. If a future connector legitimately needs longer than the TTL, add lock renewal before extending that connector.

## Cron Orchestration

Each cron tick does at most one unit of work:

1. Claim the oldest due job from `sync_jobs`.
2. If no job is due, exit.
3. Acquire the canonical lock row in `sync_jobs`.
4. If the connector is already locked, exit.
5. Execute the due connector/scope.
6. Persist the result on the due row.
7. Release the canonical lock row.

Running only one job per tick keeps v1 easy to reason about and limits timeout blast radius. If multiple jobs are due, remaining jobs wait for the next 10 minute tick.

Pseudo-code:

```ts
async function runSchedulerTick(env: Env, controller: ScheduledController) {
  const runId = crypto.randomUUID();
  const due = await findNextDueSyncJob(env.DB, new Date());
  if (!due) return;

  const lockRowId = canonicalSyncLockRowId(due.connectorId);
  const locked = await acquireSyncJobLock(env.DB, {
    lockRowId,
    scope: due.scope,
    trigger: "scheduled",
    runId
  });
  if (!locked) {
    return;
  }

  try {
    const outcome = await runDueSyncJob(env, due);
    await completeSyncJob(env.DB, due, outcome);
  } catch (error) {
    await failSyncJob(env.DB, due, error);
  } finally {
    await releaseSyncJobLock(env.DB, lockRowId, runId);
  }
}
```

Job completion rules:

- `success`: `last_status = 'success'`, `last_error = NULL`, `last_run_at = now`, `last_success_at = now`, `next_run_at = now + interval_minutes`.
- `failed`: `last_status = 'failed'`, `last_error = safe error message`, `last_run_at = now`, `next_run_at = now + 60 minutes`, `enabled = 1`.
- `needs_user_action`: `last_status = 'needs_user_action'`, `last_error = safe error message`, `last_run_at = now`, `enabled = 0`.

For v1, scheduled jobs are independent by connector. TDCC has only one scheduled job, `tdcc/all`, and it runs positions, settlement bank data, and trade history together.

Manual recovery:

- Manual sync remains available even when the scheduled job is disabled.
- After a manual sync succeeds for a disabled job, update `last_status = 'success'`, `last_error = NULL`, `last_run_at`, `last_success_at`, and `next_run_at = now + interval_minutes`.
- Do not automatically set `enabled = 1` after manual success.
- The UI should ask the user whether to re-enable automatic sync for that connector/scope. If the user agrees, the UI can update `sync_jobs.enabled = 1`.

Manual sync adapter rules:

- Manual sync does not need a due row, but it must acquire the canonical lock row before connector execution.
- Manual sync can run even when the matching scheduled job has `enabled = 0`.
- If the canonical lock row already has a live lock, return `409 SYNC_ALREADY_RUNNING`.
- The frontend should treat `409 SYNC_ALREADY_RUNNING` as a non-retryable in-flight state and keep the sync button disabled until the current request finishes or the UI refetches status.
- Manual sync may update the matching `sync_jobs` current state when one exists, but the lock is the source of truth for concurrency.

## Error Handling

Classify connector errors into stable job statuses:

- `CONNECTOR_CONFIG_MISSING` -> `needs_user_action`
- TDCC OTP required or expired -> `needs_user_action`
- E.SUN browser/session/login challenge -> `needs_user_action`
- Upstream rate limit or transient network failure -> `failed`
- D1 write failure -> `failed`

Do not store credentials, OTP values, cookies, full raw payloads, or stack traces in `sync_jobs.last_error`. Keep the message short and safe for UI display.

## Observability

Add structured logs for every run:

```json
{
  "event": "sync_run_finished",
  "runId": "...",
  "connectorId": "einvoice",
  "scope": "all",
  "trigger": "scheduled",
  "status": "success",
  "records": 42,
  "durationMs": 1234
}
```

Recommended `wrangler.toml` addition:

```toml
[observability]
enabled = true
```

The UI can read `sync_jobs` to show last sync time, next run time, whether user action is needed, and whether automatic sync is disabled.

## Security

- Scheduled sync bypasses Cloudflare Access because it is an internal Worker event, not an HTTP request.
- All connector credentials remain encrypted in `connector_settings.encrypted_config`.
- Manual OTP overrides must be accepted only from authenticated HTTP requests.
- Cron must never persist a newly submitted OTP unless the existing manual flow already does so intentionally.
- Logs and `sync_jobs.last_error` must not include decrypted config, OTP, cookies, tokens, or raw bank/API responses.

## Deployment and Local Testing

Implementation should include:

- `wrangler.toml` 10 minute cron trigger.
- D1 migration for `sync_jobs`.
- Seed rows for the default scheduled jobs.
- Shared sync service.
- Scheduled handler.
- Manual route adapters updated to call the service.

Useful checks:

```bash
npm run typecheck
npm run build
npx wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled?cron=*/10+*+*+*+*"
```

Manual sync routes should still work after the refactor, especially TDCC OTP retry and E.SUN session refresh.

## Rollout Plan

1. Add the D1 tables, seed default `sync_jobs`, and build the shared sync service without enabling cron.
2. Move existing HTTP sync routes onto the service and verify behavior is unchanged.
3. Add `runSchedulerTick`, due-job lookup, canonical lock acquire/release, and job status updates.
4. Add `scheduled` handler and test locally with `--test-scheduled`.
5. Enable the 10 minute cron in `wrangler.toml`.
6. Add a small UI surface for latest sync status, next run time, disabled jobs, and `needs_user_action`.
7. Optionally add connector-level scheduling preferences.

## Later Options

- Add a `sync_runs` history table if the UI needs detailed run history beyond the current status stored in `sync_jobs`.
- Add exponential backoff if fixed 60 minute retry is too aggressive or too slow.
- Add Cloudflare Queues if a single connector job still regularly approaches the 15 minute scheduled invocation limit.

## Open Questions

- Should E.SUN scheduled sync be allowed to perform full browser login by default, or only reuse existing sessions?
- Should users be able to configure the cron time from the UI, or should it remain deployment configuration?
- Should future notification support use email, webhook, or Cloudflare Queues plus another Worker?
