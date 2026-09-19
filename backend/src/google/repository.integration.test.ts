import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import test from 'node:test'
import { Pool } from 'pg'
import { GoogleConnectionRepository } from './repository.js'
import { PostgresRecorderRepository } from '../recorder/repository.js'
import { GoogleDriveClient } from './client.js'
import { DriveMediaStorage } from '../storage/drive.js'
import { RecorderMediaService } from '../recorder/service.js'
import { DriveUploadService } from './upload.js'
import { encryptSecret } from '../storage/secret.js'
const databaseUrl = process.env.RUN_DATABASE_INTEGRATION === '1' ? process.env.DATABASE_URL : undefined

test('PostgreSQL Drive OAuth state, one-use transfer, verification, owner retrieval, and lifecycle cleanup', {
  skip: databaseUrl ? false : 'Set RUN_DATABASE_INTEGRATION=1 and DATABASE_URL to run this test.',
}, async () => {
  const pool = new Pool({ connectionString: databaseUrl })
  const connections = new GoogleConnectionRepository(pool)
  const repository = new PostgresRecorderRepository(pool)
  const owner = randomUUID()
  const config = { clientId: 'test', clientSecret: 'test', redirectUri: 'http://localhost/callback', tokenEncryptionKey: randomBytes(32), oauthStateTtlSeconds: 600 }
  const client = new GoogleDriveClient(config)
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3])
  let uploaded: Buffer | undefined
  let properties: { activityId: string; assetId: string }
  let fileId = ''
  const deleted: string[] = []
  client.createActivityFolder = async () => 'folder'
  client.beginUpload = async (_connection, _folder, input) => { properties = input; fileId = randomUUID(); return { fileId, sessionUrl: 'https://www.googleapis.com/upload/test-session' } }
  client.upload = async (_session, body) => { const chunks: Buffer[] = []; for await (const chunk of body) chunks.push(Buffer.from(chunk)); uploaded = Buffer.concat(chunks) }
  client.metadata = async () => ({ id: fileId, headRevisionId: 'verified-revision', size: String(uploaded?.length ?? 0), mimeType: 'image/jpeg', appProperties: { activityId: properties.activityId, assetId: properties.assetId } })
  client.pin = async () => undefined
  client.download = async () => new Response(new Uint8Array(uploaded!))
  client.delete = async (_connection, id) => { deleted.push(id) }
  const adapter = new DriveMediaStorage(config, connections, client)
  const recorder = new RecorderMediaService(repository, [adapter])
  const transfers = new DriveUploadService(pool, config, connections, client)
  try {
    await pool.query('INSERT INTO app_users (id,username,username_normalized,password_hash) VALUES ($1,$2,$2,$3)', [owner, `drive-test-${owner}`, 'not-a-real-password-hash'])
    await connections.saveOAuthState('state-'+owner, owner, 'verifier', new Date(Date.now()+60_000))
    assert.equal(await connections.consumeOAuthState('state-'+owner, randomUUID()), null)
    assert.equal((await connections.consumeOAuthState('state-'+owner, owner))?.codeVerifier, 'verifier')
    assert.equal(await connections.consumeOAuthState('state-'+owner, owner), null)
    const secret = encryptSecret('test-refresh', config.tokenEncryptionKey)
    await connections.upsert(owner, { providerAccountId: owner, rootFolderId: 'root', encryptedRefreshToken: secret.ciphertext, refreshTokenIv: secret.iv, refreshTokenTag: secret.tag, encryptionKeyVersion: 1 })
    const activity = await recorder.createActivity(owner, { storageProvider: 'google_drive', operationType: 'packing', reference: null, notes: null, occurredAt: new Date().toISOString() })
    const media = await recorder.createAsset(owner, activity.id, { contentType: 'image/jpeg', mediaType: 'image', originalFilename: 'test.jpg', sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
    assert.equal(media.upload.strategy, 'server')
    await assert.rejects(transfers.upload(randomUUID(), media.asset.id, media.upload.attemptId, Readable.from([bytes]), bytes.length), /does not exist/)
    await assert.rejects(transfers.upload(owner, media.asset.id, media.upload.attemptId, Readable.from([bytes]), bytes.length + 1), /size/)
    await transfers.upload(owner, media.asset.id, media.upload.attemptId, Readable.from([bytes]), bytes.length)
    assert.deepEqual(uploaded, bytes)
    await assert.rejects(transfers.upload(owner, media.asset.id, media.upload.attemptId, Readable.from([bytes]), bytes.length), /Finalize/)
    const verified = await recorder.finalizeAsset(owner, media.asset.id, media.upload.attemptId)
    assert.equal(verified.status, 'ready')
    await recorder.completeActivity(owner, activity.id)
    await assert.rejects(recorder.retrieveAsset(randomUUID(), media.asset.id), /does not exist/)
    const download = await recorder.retrieveAsset(owner, media.asset.id)
    assert.ok('body' in download)
    const chunks = []; for await (const chunk of download.body) chunks.push(Buffer.from(chunk))
    assert.deepEqual(Buffer.concat(chunks), bytes)
    await connections.saveOAuthState('pending-'+owner, owner, 'verifier', new Date(Date.now()+60_000))
    await connections.unlink(owner)
    assert.equal(await connections.consumeOAuthState('pending-'+owner, owner), null)
    await assert.rejects(recorder.retrieveAsset(owner, media.asset.id), /temporarily unavailable/)
    assert.equal(deleted.length, 0)
    const deletion = await recorder.deleteActivity(owner, activity.id)
    assert.equal(deletion.cleanupPending, 1)
    await connections.upsert(owner, { providerAccountId: owner, rootFolderId: 'root', encryptedRefreshToken: secret.ciphertext, refreshTokenIv: secret.iv, refreshTokenTag: secret.tag, encryptionKeyVersion: 1 })
    assert.equal((await recorder.retryCleanup(owner, activity.id)).cleanupPending, 0)
    assert.deepEqual(deleted, [fileId])
  } finally {
    await pool.query('DELETE FROM media_cleanup_jobs WHERE activity_id IN (SELECT id FROM recorder_activities WHERE owner_user_id=$1)', [owner])
    await pool.query('DELETE FROM recorder_activity_audit_events WHERE owner_user_id=$1', [owner])
    await pool.query('DELETE FROM media_upload_attempts WHERE asset_id IN (SELECT m.id FROM media_assets m JOIN recorder_activities a ON a.id=m.activity_id WHERE a.owner_user_id=$1)', [owner])
    await pool.query('DELETE FROM media_assets WHERE activity_id IN (SELECT id FROM recorder_activities WHERE owner_user_id=$1)', [owner])
    await pool.query('DELETE FROM recorder_activities WHERE owner_user_id=$1', [owner])
    await pool.query('DELETE FROM app_users WHERE id=$1', [owner])
    await pool.end()
  }
})
