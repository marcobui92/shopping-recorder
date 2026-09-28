import type { Pool } from 'pg'

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
    const result = await this.pool.query<{ retention_days: number }>('UPDATE app_users SET retention_days = $2 WHERE id = $1 RETURNING retention_days', [userId, retentionDays])
    return result.rows[0]?.retention_days ?? null
  }
}
