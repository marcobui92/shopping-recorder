import assert from 'node:assert/strict'
import test from 'node:test'
import { randomBytes, randomUUID } from 'node:crypto'
import { buildApp } from '../app.js'
import type { AppConfig } from '../config.js'
import type { GoogleConnectionStore } from './repository.js'

const config: AppConfig = { host: '127.0.0.1', port: 3000, nodeEnv: 'test', corsOrigin: 'http://localhost:5173', logLevel: 'silent' as AppConfig['logLevel'], trustProxy: false, googleDrive: { clientId: 'id', clientSecret: 'secret', redirectUri: 'http://localhost/callback', tokenEncryptionKey: randomBytes(32), oauthStateTtlSeconds: 600 } }
function fixture(state?: 'connected' | 'disconnected' | 'reauthorization_required' | 'unavailable', s3 = false, google = true) {
  const completed: string[][] = []
  let linked = true
  let revocationFails = false
  const repository = { get: async () => linked ? { updatedAt: 'today', encryptedRefreshToken: 'secret', providerAccountId: 'private-account' } : null, unlink: async () => { linked = false }, consumeOAuthState: async () => null } as unknown as GoogleConnectionStore
  const uploads: string[] = []
  const app = buildApp({ ...config, googleDrive: google ? config.googleDrive : undefined, s3: s3 ? { bucket: 'test', endpoint: 'https://s3.us-west-004.backblazeb2.com', region: 'us-west-004', accessKeyId: 'test', secretAccessKey: 'test', maxImageBytes: 100, maxVideoBytes: 100, uploadExpiresSeconds: 900, downloadExpiresSeconds: 60 } : undefined }, { google: {
    authenticate: async request => request.headers.cookie === 'session=owner' ? 'owner' : null,
    repository,
    service: { connectionState: async () => state ?? (linked ? 'connected' : 'disconnected'), begin: async () => 'https://accounts.google.com/authorize', complete: async (...args) => { completed.push(args); return 'owner' }, revoke: async () => { if (revocationFails) throw new Error('private provider detail') } },
  }, driveUpload: { upload: async (owner, _asset, _attempt, body, size) => { let received = 0; for await (const chunk of body) received += chunk.length; assert.equal(received, size); uploads.push(owner) } } })
  return { app, completed, uploads, failRevocation: () => { revocationFails = true } }
}
const headers = { cookie: 'session=owner', origin: config.corsOrigin }

test('Google status requires a session, disables caching, and never exposes credentials/account references', async () => {
  const { app } = fixture()
  try {
    assert.equal((await app.inject('/api/v1/google-drive/status')).statusCode, 401)
    const result = await app.inject({ url: '/api/v1/google-drive/status', headers })
    assert.equal(result.statusCode, 200)
    assert.equal(result.headers['cache-control'], 'no-store')
    assert.deepEqual(result.json().data, { configured: true, connected: true, state: 'connected', updatedAt: 'today' })
    assert.doesNotMatch(result.body, /secret|private-account/)
  } finally { await app.close() }
})

test('Google connect requires origin-checked POST and callback binds to the current owner session', async () => {
  const { app, completed } = fixture()
  try {
    assert.equal((await app.inject({ url: '/api/v1/google-drive/connect', headers })).statusCode, 404)
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/google-drive/connect', headers: { ...headers, origin: 'https://other.test' }, payload: {} })).statusCode, 403)
    const start = await app.inject({ method: 'POST', url: '/api/v1/google-drive/connect', headers, payload: {} })
    assert.equal(start.statusCode, 200)
    assert.equal(start.json().data.authorizationUrl, 'https://accounts.google.com/authorize')
    await app.inject('/api/v1/google-drive/callback?state=state&code=code')
    assert.equal(completed.length, 0)
    const callback = await app.inject({ url: '/api/v1/google-drive/callback?state=state&code=code', headers })
    assert.deepEqual(completed, [['state', 'code', 'owner']])
    assert.equal(callback.headers.location, config.corsOrigin + '/?googleDrive=connected')
    const cancel = await app.inject({ url: '/api/v1/google-drive/callback?state=state&error=access_denied', headers })
    assert.equal(cancel.headers.location, config.corsOrigin + '/?googleDrive=cancelled')
  } finally { await app.close() }
})

test('unlink preserves credentials on revocation outage and returns a sanitized retryable error', async () => {
  const { app, failRevocation } = fixture()
  try {
    failRevocation()
    const result = await app.inject({ method: 'DELETE', url: '/api/v1/google-drive/connection', headers })
    assert.equal(result.statusCode, 503)
    assert.doesNotMatch(result.body, /private provider/)
    assert.equal((await app.inject({ url: '/api/v1/google-drive/status', headers })).json().data.connected, true)
  } finally { await app.close() }
})

test('Drive proxy accepts only session-owner octet streams with exact declared length', async () => {
  const { app, uploads } = fixture()
  const url = `/api/v1/google-drive/uploads/${randomUUID()}/${randomUUID()}`
  try {
    assert.equal((await app.inject({ method: 'PUT', url, headers: { 'content-type': 'application/octet-stream' }, payload: Buffer.from('abc') })).statusCode, 401)
    assert.equal((await app.inject({ method: 'PUT', url, headers: { ...headers, origin: 'https://other.test', 'content-type': 'application/octet-stream' }, payload: Buffer.from('abc') })).statusCode, 403)
    const result = await app.inject({ method: 'PUT', url, headers: { ...headers, 'content-type': 'application/octet-stream' }, payload: Buffer.from('abc') })
    assert.equal(result.statusCode, 204, result.body)
    assert.deepEqual(uploads, ['owner'])
  } finally { await app.close() }
})

test('Drive content returns authenticated original bytes and a safely encoded attachment filename', async () => {
  const { Readable } = await import('node:stream')
  const app = buildApp(config, { recorder: { authenticate: async () => 'owner', service: {
    retrieveAsset: async () => ({ body: Readable.from([Buffer.from('image-bytes')]), contentType: 'image/jpeg', sizeBytes: 11, filename: 'ảnh\r\n/name.jpg' }),
  } as unknown as import('../recorder/service.js').RecorderMediaService } })
  try {
    const result = await app.inject(`/api/v1/media-assets/${randomUUID()}/content?download=1`)
    assert.equal(result.statusCode, 200)
    assert.equal(result.body, 'image-bytes')
    assert.equal(result.headers['content-type'], 'image/jpeg')
    assert.match(String(result.headers['content-disposition']), /^attachment; filename\*=UTF-8''/)
    assert.doesNotMatch(String(result.headers['content-disposition']), /[\r\n]/)
    assert.equal(result.headers['cache-control'], 'no-store')
  } finally { await app.close() }
})

for (const state of ['connected', 'disconnected', 'reauthorization_required', 'unavailable'] as const) {
  for (const s3 of [true, false]) {
    test(`storage availability: Drive ${state}, B2 ${s3}`, async () => {
      const { app } = fixture(state, s3)
      try {
        assert.equal((await app.inject('/api/v1/storage-providers')).statusCode, 401)
        const response = await app.inject({ url: '/api/v1/storage-providers', headers })
        assert.equal(response.statusCode, 200)
        assert.equal(response.headers['cache-control'], 'no-store')
        assert.deepEqual(response.json().data, { s3: { available: s3 }, google_drive: { available: state === 'connected', configured: true, state } })
        assert.doesNotMatch(response.body, /secret|private-account|bucket|endpoint/)
      } finally { await app.close() }
    })
  }
}
test('unconfigured Drive is unavailable even when a test service is present', async () => {
  const { app } = fixture('connected', true, false)
  try {
    const response = await app.inject({ url: '/api/v1/storage-providers', headers })
    assert.deepEqual(response.json().data, { s3: { available: true }, google_drive: { available: false, configured: false, state: 'unavailable' } })
  } finally { await app.close() }
})
