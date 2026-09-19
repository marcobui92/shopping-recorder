import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { Pool } from 'pg'

import { PostgresAuthRepository } from './repository.js'
import { AuthService } from './service.js'
import { sessionTokenDigest } from './session.js'

const integrationEnabled = process.env.RUN_DATABASE_INTEGRATION === '1'
const databaseUrl = integrationEnabled ? process.env.DATABASE_URL : undefined

test('PostgreSQL auth repository creates and revokes an Argon2-backed session', {
  skip: databaseUrl ? false : 'Set RUN_DATABASE_INTEGRATION=1 and DATABASE_URL to run this test.',
}, async () => {
  assert.ok(databaseUrl)
  const pool = new Pool({ connectionString: databaseUrl })
  const repository = new PostgresAuthRepository(pool)
  const service = new AuthService(repository)
  const username = `auth-${randomUUID()}`
  let userId: string | undefined

  try {
    const registered = await service.register({ password: 'correct horse battery staple', username })
    userId = registered.user.id
    assert.equal((await service.login({ password: 'correct horse battery staple', username: username.toUpperCase() })).user.id, userId)
    await service.logout(registered.token)
    const session = await pool.query<{ revoked_at: Date | null }>(
      'SELECT revoked_at FROM user_sessions WHERE token_digest = $1',
      [sessionTokenDigest(registered.token)],
    )
    assert.ok(session.rows[0].revoked_at)
  } finally {
    if (userId) {
      await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [userId])
      await pool.query('DELETE FROM app_users WHERE id = $1', [userId])
    }
    await pool.end()
  }
})
