export interface ConnectorSettingsRow {
  id: string;
  connector_id: string;
  encrypted_config: string;
  sync_cursor: string | null;
  created_at: string;
  updated_at: string;
}

export async function getConnectorSettings(db: D1Database, connectorId: string) {
  return db
    .prepare("SELECT * FROM connector_settings WHERE connector_id = ?")
    .bind(connectorId)
    .first<ConnectorSettingsRow>();
}

export async function upsertConnectorSettings(
  db: D1Database,
  input: {
    id: string;
    connectorId: string;
    encryptedConfig: string;
    now: string;
  }
) {
  await db
    .prepare(
      `INSERT INTO connector_settings (
        id,
        connector_id,
        encrypted_config,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(connector_id) DO UPDATE SET
        encrypted_config = excluded.encrypted_config,
        updated_at = excluded.updated_at`
    )
    .bind(input.id, input.connectorId, input.encryptedConfig, input.now, input.now)
    .run();
}

export async function updateConnectorCursor(
  db: D1Database,
  connectorId: string,
  cursor: string,
  now: string
) {
  await db
    .prepare(
      `UPDATE connector_settings
      SET sync_cursor = ?, updated_at = ?
      WHERE connector_id = ?`
    )
    .bind(cursor, now, connectorId)
    .run();
}
