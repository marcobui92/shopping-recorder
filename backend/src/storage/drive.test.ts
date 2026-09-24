import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import test from 'node:test'
import { DriveMediaStorage } from './drive.js'
import { GoogleDriveClient } from '../google/client.js'
import type { GoogleConnection, GoogleConnectionStore } from '../google/repository.js'
import { decryptSecret } from './secret.js'

const key = randomBytes(32)
const config = { clientId: 'id', clientSecret: 'secret', redirectUri: 'http://localhost:3001/api/v1/google-drive/callback', tokenEncryptionKey: key, oauthStateTtlSeconds: 600 }
const bytes = Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3])
const input = { activityId: 'activity', assetId: 'asset', ownerUserId: 'owner', contentType: 'image/jpeg', sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
function fixture() {
  let connection: GoogleConnection | null = { providerAccountId: 'account', rootFolderId: 'root', encryptedRefreshToken: '', refreshTokenIv: '', refreshTokenTag: '', encryptionKeyVersion: 1, updatedAt: '' }
  const repo = { get: async () => connection } as unknown as GoogleConnectionStore
  const client = new GoogleDriveClient(config)
  let content: Buffer = bytes
  let head = 'revision-one'
  const downloaded: string[] = []
  const deleted: string[] = []
  client.createActivityFolder = async () => 'folder'
  client.beginUpload = async () => ({ fileId: 'file', sessionUrl: 'https://www.googleapis.com/upload/secret-session' })
  client.metadata = async () => ({ id: 'file', mimeType: 'image/jpeg', size: String(content.length), headRevisionId: head, appProperties: { activityId: input.activityId, assetId: input.assetId } })
  client.pin = async () => undefined
  client.download = async (_connection, _file, revision) => { downloaded.push(revision); return new Response(new Uint8Array(content)) }
  client.delete = async (_connection, file) => { deleted.push(file) }
  const adapter = new DriveMediaStorage(config, repo, client, 'https://shopping-recorder-web.vercel.app')
  return { adapter, client, downloaded, deleted, setContent: (value: Buffer) => { content = value }, setHead: (value: string) => { head = value }, disconnect: () => { connection = null }, replace: () => { connection!.providerAccountId = 'other' } }
}

test('Drive capabilities contain only the authenticated application upload URL; provider session is encrypted', async () => {
  const { adapter } = fixture()
  const issued = await adapter.issueUpload(input, 'attempt')
  assert.equal(issued.capability.strategy, 'server')
  assert.equal(issued.capability.url, 'https://shopping-recorder-web.vercel.app/api/v1/google-drive/uploads/asset/attempt')
  assert.doesNotMatch(JSON.stringify(issued.capability), /secret-session|refresh|Bearer/)
  assert.doesNotMatch(issued.providerUploadRef!, /secret-session/)
  assert.equal(decryptSecret(JSON.parse(issued.providerUploadRef!), key), 'https://www.googleapis.com/upload/secret-session')
})

test('Drive verification hashes and pins a revision; retrieval never follows a changed head', async () => {
  const { adapter, downloaded, setHead } = fixture()
  const issued = await adapter.issueUpload(input, 'attempt')
  const verified = await adapter.verify(issued.providerObjectRef, input)
  assert.equal(verified.sha256, input.sha256)
  setHead('revision-two')
  const result = await adapter.issueDownload(issued.providerObjectRef, verified.providerVersionRef)
  assert.ok('body' in result)
  const chunks = []; for await (const chunk of result.body) chunks.push(chunk)
  assert.deepEqual(Buffer.concat(chunks), bytes)
  assert.deepEqual(downloaded, ['revision-one', 'revision-one'])
})

test('Drive refuses mismatched checksum, byte signature, binding, and streamed size', async () => {
  const { adapter, setContent, client } = fixture()
  const issued = await adapter.issueUpload(input, 'attempt')
  await assert.rejects(adapter.verify(issued.providerObjectRef, { ...input, sha256: '0'.repeat(64) }), /checksum/)
  await assert.rejects(adapter.verify(issued.providerObjectRef, { ...input, assetId: 'other' }), /binding/)
  const wrong = Buffer.from('abcdef'); setContent(wrong)
  await assert.rejects(adapter.verify(issued.providerObjectRef, { ...input, sha256: createHash('sha256').update(wrong).digest('hex') }), /type/)
  setContent(bytes)
  client.download = async () => new Response(Buffer.concat([bytes, bytes]))
  await assert.rejects(adapter.verify(issued.providerObjectRef, input), /size/)
})

test('Drive disconnect/account replacement blocks retrieval and deletion of old evidence', async () => {
  for (const action of ['disconnect', 'replace'] as const) {
    const f = fixture()
    const issued = await f.adapter.issueUpload(input, 'attempt')
    const verified = await f.adapter.verify(issued.providerObjectRef, input)
    f[action]()
    await assert.rejects(f.adapter.issueDownload(issued.providerObjectRef, verified.providerVersionRef), /original Google/)
    await assert.rejects(f.adapter.deleteObject(issued.providerObjectRef), /original Google/)
    assert.equal(f.deleted.length, 0)
  }
})

test('Drive missing pinned revisions are unavailable and cleanup deletes the bound file', async () => {
  const { adapter, client, deleted } = fixture()
  const issued = await adapter.issueUpload(input, 'attempt')
  const verified = await adapter.verify(issued.providerObjectRef, input)
  client.download = async () => { throw new Error('provider details must stay private') }
  await assert.rejects(adapter.issueDownload(issued.providerObjectRef, verified.providerVersionRef), /verified Drive revision is unavailable/)
  await adapter.deleteObject(issued.providerObjectRef)
  assert.deepEqual(deleted, ['file'])
})
