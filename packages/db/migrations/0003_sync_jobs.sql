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

INSERT OR IGNORE INTO sync_jobs (
  id,
  connector_id,
  scope,
  enabled,
  interval_minutes,
  next_run_at,
  created_at,
  updated_at
) VALUES
  ('einvoice:all', 'einvoice', 'all', 1, 1440, '2026-06-24T21:17:00.000Z', '2026-06-24T00:00:00.000Z', '2026-06-24T00:00:00.000Z'),
  ('tdcc:all', 'tdcc', 'all', 1, 1440, '2026-06-24T21:37:00.000Z', '2026-06-24T00:00:00.000Z', '2026-06-24T00:00:00.000Z'),
  ('esun:all', 'esun', 'all', 1, 1440, '2026-06-24T22:17:00.000Z', '2026-06-24T00:00:00.000Z', '2026-06-24T00:00:00.000Z');
