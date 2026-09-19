import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'
import { GoogleDriveService } from './service.js'
import { decryptSecret, encryptSecret } from '../storage/secret.js'
import type { GoogleConnection, GoogleConnectionStore, GoogleOAuthState } from './repository.js'
import { hashOAuthState } from './oauth.js'

export class MemoryGoogleStore implements GoogleConnectionStore {
  connections = new Map<string, GoogleConnection>()
  states = new Map<string, GoogleOAuthState>()
  async get(userId: string) { return this.connections.get(userId) ?? null }
  async upsert(userId: string, connection: Omit<GoogleConnection, 'updatedAt'>) { this.connections.set(userId, { ...connection, updatedAt: new Date().toISOString() }) }
  async unlink(userId: string) { this.connections.delete(userId) }
  async saveOAuthState(hash: string, userId: string, codeVerifier: string, expiresAt: Date) { this.states.set(hash, { userId, codeVerifier, expiresAt }) }
  async consumeOAuthState(hash: string, userId: string) {
    const state = this.states.get(hash)
    if (!state || state.userId !== userId) return null
    this.states.delete(hash)
    return state.expiresAt.getTime() > Date.now() ? state : null
  }
}
const config = { clientId: 'id', clientSecret: 'secret', redirectUri: 'http://localhost/callback', tokenEncryptionKey: randomBytes(32), oauthStateTtlSeconds: 600 }
function fixture(account = 'google-one', refresh: string | undefined = 'refresh-one') {
  const repository = new MemoryGoogleStore()
  const calls: { url: string; init?: RequestInit }[] = []
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    if (url.endsWith('/token')) return Response.json({ access_token: 'access', refresh_token: refresh, expires_in: 3600, token_type: 'Bearer' })
    if (url.includes('/about?')) return Response.json({ user: { permissionId: account } })
    if (url.endsWith('/revoke')) return new Response(null, { status: 200 })
    return Response.json({ id: 'new-root' })
  }) as typeof fetch
  return { repository, calls, service: new GoogleDriveService(config, repository, fetchImpl) }
}
async function existing(repository: MemoryGoogleStore) {
  const token = encryptSecret('old-refresh', config.tokenEncryptionKey)
  await repository.upsert('owner', { providerAccountId: 'google-one', rootFolderId: 'existing-root', encryptedRefreshToken: token.ciphertext, refreshTokenIv: token.iv, refreshTokenTag: token.tag, encryptionKeyVersion: token.version })
}
async function begin(service: GoogleDriveService) { return new URL(await service.begin('owner')).searchParams.get('state')! }

test('OAuth state is owner-bound, expiring, and single-use before token exchange', async () => {
  const { service, repository, calls } = fixture()
  const state = await begin(service)
  await assert.rejects(service.complete(state, 'code', 'another'), /STATE_INVALID/)
  assert.equal(calls.length, 0)
  await service.complete(state, 'code', 'owner')
  assert.equal(repository.connections.has('owner'), true)
  await assert.rejects(service.complete(state, 'code', 'owner'), /STATE_INVALID/)
  const expired = await begin(service)
  repository.states.get(hashOAuthState(expired))!.expiresAt = new Date(0)
  await assert.rejects(service.complete(expired, 'code', 'owner'), /STATE_INVALID/)
})

test('reconnect keeps the existing folder and omitted refresh token only for the same Google account', async () => {
  const { service, repository, calls } = fixture('google-one', undefined)
  // Explicitly omit token; fixture default otherwise supplies one.
  const noToken = new GoogleDriveService(config, repository, (async (url: string) => {
    calls.push({ url })
    return url.endsWith('/token') ? Response.json({ access_token: 'access', expires_in: 3600, token_type: 'Bearer' }) : Response.json({ user: { permissionId: 'google-one' } })
  }) as typeof fetch)
  await existing(repository)
  await noToken.complete(await begin(service), 'code', 'owner')
  const saved = (await repository.get('owner'))!
  assert.equal(saved.rootFolderId, 'existing-root')
  assert.equal(decryptSecret({ ciphertext: saved.encryptedRefreshToken, iv: saved.refreshTokenIv, tag: saved.refreshTokenTag, version: saved.encryptionKeyVersion }, config.tokenEncryptionKey), 'old-refresh')
  assert.equal(calls.some(call => call.url.endsWith('/files')), false)
})

test('changing Google accounts without a new refresh token preserves the previous connection', async () => {
  const repository = new MemoryGoogleStore()
  await existing(repository)
  const service = new GoogleDriveService(config, repository, (async (url: string) => url.endsWith('/token') ? Response.json({ access_token: 'access', expires_in: 3600, token_type: 'Bearer' }) : Response.json({ user: { permissionId: 'google-two' } })) as typeof fetch)
  await assert.rejects(service.complete(await begin(service), 'code', 'owner'), /REFRESH_TOKEN_MISSING/)
  assert.equal((await repository.get('owner'))?.providerAccountId, 'google-one')
})

test('replacing a Google account encrypts the new token and creates its own root', async () => {
  const { service, repository } = fixture('google-two', 'new-refresh')
  await existing(repository)
  await service.complete(await begin(service), 'code', 'owner')
  const saved = (await repository.get('owner'))!
  assert.equal(saved.providerAccountId, 'google-two')
  assert.equal(saved.rootFolderId, 'new-root')
  assert.notEqual(saved.encryptedRefreshToken, 'new-refresh')
})

test('revoke sends credentials in POST body and never deletes Drive files', async () => {
  const { service, repository, calls } = fixture()
  await existing(repository)
  await service.revoke('owner')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://oauth2.googleapis.com/revoke')
  assert.equal((calls[0].init?.body as URLSearchParams).get('token'), 'old-refresh')
})
