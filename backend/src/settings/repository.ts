import type { Pool, PoolClient } from 'pg'

export interface SettingsRepository {
  getRetentionDays(userId: string): Promise<number | null>
  updateRetentionDays(userId: string, retentionDays: number): Promise<number | null>
}

export class PostgresSettingsRepository implements SettingsRepository {
  constructor(private readonly pool: Pool) {}

  async getRetentionDays(userId: string): Promise<number | null> {
    const result = await this.pool.query<{ retention_days: number }>('SELECT retention_days FROM app_users WHERE id = $1', [userId])
    return result.rows[0]?.retention_days ?? null
  }

  async updateRetentionDays(userId: string, retentionDays: number): Promise<number | null> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const days = await recomputeExpiries(client, userId, retentionDays)
      await client.query('COMMIT')
      return days
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
}

async function recomputeExpiries(client: PoolClient, userId: string, retentionDays: number): Promise<number | null> {
  const result = await client.query<{ retention_days: number }>('UPDATE app_users SET retention_days = $2 WHERE id = $1 RETURNING retention_days', [userId, retentionDays])
  const days = result.rows[0]?.retention_days ?? null
  if (days === null) return null
  // Evidence expiry must follow the owner's current setting, counted from each record's completion time.
  await client.query(`
    UPDATE recorder_activities
    SET evidence_expires_at = completed_at + $2 * interval '1 day', updated_at = now()
    WHERE owner_user_id = $1 AND status = 'complete' AND completed_at IS NOT NULL
  `, [userId, days])
  return days
}
