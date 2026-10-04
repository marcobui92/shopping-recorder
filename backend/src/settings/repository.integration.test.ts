import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { Pool } from 'pg'

import { PostgresSettingsRepository } from './repository.js'

const integrationEnabled = process.env.RUN_DATABASE_INTEGRATION === '1'
const databaseUrl = integrationEnabled ? process.env.DATABASE_URL : undefined

test('PostgreSQL settings update recomputes expiry for still-complete activities', {
  skip: databaseUrl ? false : 'Set RUN_DATABASE_INTEGRATION=1 and DATABASE_URL to run this test.',
}, async () => {
  assert.ok(databaseUrl)
  const pool = new Pool({ connectionString: databaseUrl })
  const repository = new PostgresSettingsRepository(pool)
  const userId = randomUUID()
  const completeId = randomUUID()
  const expiredId = randomUUID()
  const expiredBefore = new Date(Date.now() - 2 * 86_400_000)

  try {
    await pool.query('INSERT INTO app_users (id, username, username_normalized, password_hash) VALUES ($1, $2, $2, $3)', [userId, `settings-${userId}`, 'not-a-real-password-hash'])
    await pool.query(`
      INSERT INTO recorder_activities (id, owner_user_id, operation_type, status, storage_provider, occurred_at, completed_at, evidence_expires_at)
      VALUES ($1, $2, 'packing', 'complete', 's3', now() - interval '16 days', now() - interval '16 days', now() - interval '1 day')
    `, [completeId, userId])
    await pool.query(`
      INSERT INTO recorder_activities (id, owner_user_id, operation_type, status, storage_provider, occurred_at, completed_at, evidence_expires_at, expired_at)
      VALUES ($1, $2, 'packing', 'expired', 's3', now() - interval '20 days', now() - interval '20 days', $3, now())
    `, [expiredId, userId, expiredBefore])

    const days = await repository.updateRetentionDays(userId, 15)
    assert.equal(days, 15)

    const complete = await pool.query<{ completed_at: Date; evidence_expires_at: Date }>('SELECT completed_at, evidence_expires_at FROM recorder_activities WHERE id = $1', [completeId])
    const row = complete.rows[0]
    assert.ok(row)
    const diffDays = (row.evidence_expires_at.getTime() - row.completed_at.getTime()) / 86_400_000
    assert.ok(Math.abs(diffDays - 15) < 0.01, `expected 15 days between completion and expiry, got ${diffDays}`)

    const untouched = await pool.query<{ evidence_expires_at: Date; status: string }>('SELECT evidence_expires_at, status FROM recorder_activities WHERE id = $1', [expiredId])
    assert.equal(untouched.rows[0]?.status, 'expired')
    assert.equal(untouched.rows[0]?.evidence_expires_at.getTime(), expiredBefore.getTime())

    const missing = await repository.updateRetentionDays(randomUUID(), 7)
    assert.equal(missing, null)
  } finally {
    await pool.query('DELETE FROM recorder_activities WHERE owner_user_id = $1', [userId])
    await pool.query('DELETE FROM app_users WHERE id = $1', [userId])
    await pool.end()
  }
})
