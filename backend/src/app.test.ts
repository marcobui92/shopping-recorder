import assert from 'node:assert/strict'
import test from 'node:test'

import { buildApp } from './app.js'
import type { AppConfig } from './config.js'

const config: AppConfig = {
  corsOrigin: 'http://localhost:5173',
  host: '127.0.0.1',
  logLevel: 'silent' as AppConfig['logLevel'],
  nodeEnv: 'test',
  port: 3000,
  trustProxy: false,
}

test('GET /api/v1/health reports service health', async () => {
  const app = buildApp(config)
  const response = await app.inject({ method: 'GET', url: '/api/v1/health' })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { data: { status: 'ok' } })
  assert.equal(response.headers['x-content-type-options'], 'nosniff')
  assert.equal(response.headers['x-frame-options'], 'DENY')
  assert.equal(response.headers['referrer-policy'], 'no-referrer')
  assert.match(response.headers['content-security-policy'] ?? '', /default-src 'none'/)
  assert.equal(typeof response.headers['x-request-id'], 'string')
  assert.equal(response.headers['cache-control'], 'no-store')
  await app.close()
})

test('GET /api/v1/health/ready reports dependency readiness without leaking failures', async () => {
  const readyApp = buildApp(config, { readiness: async () => undefined })
  const ready = await readyApp.inject({ method: 'GET', url: '/api/v1/health/ready' })
  assert.equal(ready.statusCode, 200)
  assert.deepEqual(ready.json(), { data: { status: 'ready' } })
  await readyApp.close()

  const unavailableApp = buildApp(config, { readiness: async () => { throw new Error('secret provider detail') } })
  const unavailable = await unavailableApp.inject({ method: 'GET', url: '/api/v1/health/ready' })
  assert.equal(unavailable.statusCode, 503)
  assert.deepEqual(unavailable.json(), { data: { status: 'not-ready' } })
  assert.doesNotMatch(unavailable.body, /secret provider detail/)
  await unavailableApp.close()
})

test('unknown routes return the documented error shape', async () => {
  const app = buildApp(config)
  const response = await app.inject({ method: 'GET', url: '/api/v1/unknown' })

  assert.equal(response.statusCode, 404)
  assert.deepEqual(response.json(), {
    error: { code: 'ROUTE_NOT_FOUND', message: 'The requested endpoint does not exist.' },
  })
  await app.close()
})

test('retired shopping-record routes are no longer exposed', async () => {
  const app = buildApp(config)
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE'] as const) {
    const response = await app.inject({ method, url: '/api/v1/shopping-records/legacy-record' })
    assert.equal(response.statusCode, 404)
    assert.equal(response.json().error.code, 'ROUTE_NOT_FOUND')
  }
  await app.close()
})

test('browser preflight permits Drive PUT and recorder lifecycle methods only for the configured origin', async () => {
  const app = buildApp(config)
  try {
    for (const [method, url] of [
      ['PUT', '/api/v1/google-drive/uploads/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002'],
      ['PATCH', '/api/v1/recorder-activities/00000000-0000-4000-8000-000000000001'],
      ['DELETE', '/api/v1/google-drive/connection'],
    ]) {
      const response = await app.inject({ method: 'OPTIONS', url, headers: {
        origin: config.corsOrigin, 'access-control-request-method': method, 'access-control-request-headers': 'content-type',
      } })
      assert.equal(response.statusCode, 204)
      assert.equal(response.headers['access-control-allow-origin'], config.corsOrigin)
      assert.equal(response.headers['access-control-allow-credentials'], 'true')
      assert.ok(String(response.headers['access-control-allow-methods']).split(/,\s*/).includes(method))
      assert.equal(response.headers['access-control-allow-headers'], 'content-type')
    }
    const foreign = await app.inject({ method: 'OPTIONS', url: '/api/v1/google-drive/connection', headers: {
      origin: 'https://other.test', 'access-control-request-method': 'DELETE',
    } })
    assert.notEqual(foreign.headers['access-control-allow-origin'], 'https://other.test')
    assert.notEqual(foreign.headers['access-control-allow-origin'], '*')
  } finally { await app.close() }
})
