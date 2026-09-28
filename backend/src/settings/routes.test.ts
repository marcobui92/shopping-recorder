import assert from 'node:assert/strict'
import test from 'node:test'
import Fastify from 'fastify'
import { registerSettingsRoutes } from './routes.js'
import type { SettingsRepository } from './repository.js'

test('settings reads and updates retention days with origin protection', async () => {
  let days = 30
  const repository: SettingsRepository = { getRetentionDays: async () => days, updateRetentionDays: async (_id, next) => { days = next; return days } }
  const app = Fastify()
  registerSettingsRoutes(app, { corsOrigin: 'http://localhost:5173' } as never, { authenticate: async () => 'user-1', repository })
  const read = await app.inject({ method: 'GET', url: '/api/v1/settings' })
  assert.equal(read.statusCode, 200); assert.deepEqual(read.json().data, { retentionDays: 30 })
  const blocked = await app.inject({ method: 'PATCH', url: '/api/v1/settings', headers: { origin: 'https://evil.test' }, payload: { retentionDays: 14 } })
  assert.equal(blocked.statusCode, 403)
  const updated = await app.inject({ method: 'PATCH', url: '/api/v1/settings', headers: { origin: 'http://localhost:5173' }, payload: { retentionDays: 14 } })
  assert.equal(updated.statusCode, 200); assert.deepEqual(updated.json().data, { retentionDays: 14 })
  await app.close()
})
