import type { Pool } from 'pg'

export interface GoogleConnection {
  providerAccountId: string
  encryptedRefreshToken: string
  refreshTokenIv: string
  refreshTokenTag: string
  encryptionKeyVersion: number
  rootFolderId: string
  updatedAt: string
}

export interface GoogleOAuthState { userId: string; codeVerifier: string; expiresAt: Date }

export interface GoogleConnectionStore {
  saveOAuthState(stateHash: string, userId: string, codeVerifier: string, expiresAt: Date): Promise<void>
  consumeOAuthState(stateHash: string, userId: string): Promise<GoogleOAuthState | null>
  get(userId: string): Promise<GoogleConnection | null>
  upsert(userId: string, connection: Omit<GoogleConnection, 'updatedAt'>): Promise<void>
  unlink(userId: string): Promise<void>
}

export class GoogleConnectionRepository implements GoogleConnectionStore {
  constructor(private readonly pool: Pool) {}

  async saveOAuthState(stateHash: string, userId: string, codeVerifier: string, expiresAt: Date): Promise<void> {
    await this.pool.query('DELETE FROM google_drive_oauth_states WHERE expires_at < now()')
    await this.pool.query(
      `INSERT INTO google_drive_oauth_states (state_hash, user_id, code_verifier, expires_at) VALUES ($1,$2,$3,$4)`,
      [stateHash, userId, codeVerifier, expiresAt],
    )
  }

  async consumeOAuthState(stateHash: string, userId: string): Promise<GoogleOAuthState | null> {
    const result = await this.pool.query<{ user_id: string; code_verifier: string; expires_at: Date }>(
      `DELETE FROM google_drive_oauth_states WHERE state_hash = $1 AND user_id = $2 RETURNING user_id, code_verifier, expires_at`, [stateHash, userId],
    )
    const row = result.rows[0]
    if (!row || row.expires_at.getTime() <= Date.now()) return null
    return { userId: row.user_id, codeVerifier: row.code_verifier, expiresAt: row.expires_at }
  }

  async get(userId: string): Promise<GoogleConnection | null> {
    const result = await this.pool.query<GoogleConnection>(
      `SELECT provider_account_id AS "providerAccountId", encrypted_refresh_token AS "encryptedRefreshToken",
        refresh_token_iv AS "refreshTokenIv", refresh_token_tag AS "refreshTokenTag",
        encryption_key_version AS "encryptionKeyVersion", root_folder_id AS "rootFolderId", updated_at AS "updatedAt"
       FROM google_drive_connections WHERE user_id = $1`, [userId],
    )
    const row = result.rows[0]
    return row ? { ...row, updatedAt: new Date(row.updatedAt).toISOString() } : null
  }

  async upsert(userId: string, connection: Omit<GoogleConnection, 'updatedAt'>): Promise<void> {
    await this.pool.query(
      `INSERT INTO google_drive_connections (user_id, provider_account_id, encrypted_refresh_token, refresh_token_iv, refresh_token_tag, encryption_key_version, root_folder_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id) DO UPDATE SET provider_account_id=EXCLUDED.provider_account_id,
       encrypted_refresh_token=EXCLUDED.encrypted_refresh_token, refresh_token_iv=EXCLUDED.refresh_token_iv,
       refresh_token_tag=EXCLUDED.refresh_token_tag, encryption_key_version=EXCLUDED.encryption_key_version,
       root_folder_id=EXCLUDED.root_folder_id, updated_at=now()`,
      [userId, connection.providerAccountId, connection.encryptedRefreshToken, connection.refreshTokenIv, connection.refreshTokenTag, connection.encryptionKeyVersion, connection.rootFolderId],
    )
  }

  async unlink(userId: string): Promise<void> { await this.pool.query('WITH removed_states AS (DELETE FROM google_drive_oauth_states WHERE user_id = $1) DELETE FROM google_drive_connections WHERE user_id = $1', [userId]) }
}
