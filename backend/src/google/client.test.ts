import assert from 'node:assert/strict'
import test from 'node:test'
import { randomBytes } from 'node:crypto'
import { encryptSecret } from '../storage/secret.js'
import { GoogleDriveClient } from './client.js'

test('Drive client refreshes access token and creates an activity folder', async () => {
  const encrypted = encryptSecret('refresh', randomBytes(32))
  const key = randomBytes(32)
  const stored = encryptSecret('refresh', key)
  const calls: string[] = []
  const fetchImpl = async (url: string) => { calls.push(url); if (url.includes('oauth2')) return new Response(JSON.stringify({ access_token: 'access' }), { status: 200 }); return new Response(JSON.stringify({ id: 'folder-1' }), { status: 200 }) }
  const client = new GoogleDriveClient({ clientId: 'id', clientSecret: 'secret', redirectUri: 'http://localhost', tokenEncryptionKey: key, oauthStateTtlSeconds: 600 }, fetchImpl as typeof fetch)
  const id = await client.createActivityFolder({ providerAccountId: 'account', encryptedRefreshToken: stored.ciphertext, refreshTokenIv: stored.iv, refreshTokenTag: stored.tag, encryptionKeyVersion: stored.version, rootFolderId: 'root', updatedAt: new Date().toISOString() }, 'activity-1')
  assert.equal(id, 'folder-1'); assert.equal(calls.length, 3)
  assert.notEqual(encrypted.ciphertext, stored.ciphertext)
})

test('Drive invalid grants require reconnection and provider failures never expose response bodies', async () => {
  const key = randomBytes(32)
  const stored = encryptSecret('refresh', key)
  const connection = { providerAccountId: 'account', encryptedRefreshToken: stored.ciphertext, refreshTokenIv: stored.iv, refreshTokenTag: stored.tag, encryptionKeyVersion: 1, rootFolderId: 'root', updatedAt: '' }
  const { GoogleReauthorizationError } = await import('./client.js')
  const config = { clientId: 'id', clientSecret: 'secret', redirectUri: 'http://localhost', tokenEncryptionKey: key, oauthStateTtlSeconds: 600 }
  const client = new GoogleDriveClient(config, (async () => Response.json({ error: 'invalid_grant', detail: 'private' }, { status: 400 })) as typeof fetch)
  await assert.rejects(client.metadata(connection, 'file'), GoogleReauthorizationError)
  const unavailable = new GoogleDriveClient(config, (async () => new Response('private-provider-details', { status: 503 })) as typeof fetch)
  await assert.rejects(unavailable.metadata(connection, 'file'), error => error instanceof Error && !error.message.includes('private-provider-details'))
})

test('Drive resumable initiation reserves a file ID, pins revision retention, and rejects foreign session origins', async () => {
  const key = randomBytes(32)
  const stored = encryptSecret('refresh', key)
  const connection = { providerAccountId: 'account', encryptedRefreshToken: stored.ciphertext, refreshTokenIv: stored.iv, refreshTokenTag: stored.tag, encryptionKeyVersion: 1, rootFolderId: 'root', updatedAt: '' }
  let location = 'https://www.googleapis.com/upload/session'
  let initiation: RequestInit | undefined
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    if (url.endsWith('/token')) return Response.json({ access_token: 'access' })
    if (url.includes('generateIds')) return Response.json({ ids: ['reserved-file'] })
    assert.match(url, /keepRevisionForever=true/)
    initiation = init
    return new Response(null, { status: 200, headers: { location } })
  }) as typeof fetch
  const client = new GoogleDriveClient({ clientId: 'id', clientSecret: 'secret', redirectUri: 'http://localhost', tokenEncryptionKey: key, oauthStateTtlSeconds: 600 }, fetchImpl)
  const input = { ownerUserId: 'owner', activityId: 'activity', assetId: 'asset', contentType: 'image/jpeg', sizeBytes: 6, sha256: 'a'.repeat(64) }
  assert.equal((await client.beginUpload(connection, 'folder', input)).fileId, 'reserved-file')
  const metadata = JSON.parse(initiation!.body as string)
  assert.equal(metadata.id, 'reserved-file')
  assert.deepEqual(metadata.parents, ['folder'])
  assert.deepEqual(metadata.appProperties, { activityId: 'activity', assetId: 'asset' })
  location = 'https://untrusted.example/upload'
  await assert.rejects(client.beginUpload(connection, 'folder', input), /unavailable/)
})
