import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import test from 'node:test'
import { Pool } from 'pg'
import { loadConfig } from '../config.js'
import { GoogleConnectionRepository } from './repository.js'
import { GoogleDriveClient } from './client.js'
import { DriveMediaStorage } from '../storage/drive.js'
import { PostgresRecorderRepository } from '../recorder/repository.js'
import { RecorderMediaService } from '../recorder/service.js'
import { DriveUploadService } from './upload.js'

// Explicit opt-in: create/remove disposable evidence under an authorized linked test account.
test('live Google Drive upload, revision download, changed/missing file and cleanup', {
  skip: process.env.RUN_GOOGLE_DRIVE_SMOKE !== '1' ? 'Set RUN_GOOGLE_DRIVE_SMOKE=1 with an authorized linked test account.' : false,
}, async () => {
  const config = loadConfig()
  assert.ok(config.databaseUrl && config.googleDrive)
  const pool = new Pool({ connectionString: config.databaseUrl })
  const connections = new GoogleConnectionRepository(pool)
  const repository = new PostgresRecorderRepository(pool)
  let authorization = ''
  const client = new GoogleDriveClient(config.googleDrive, async (url, init) => {
    const headers = new Headers(init?.headers)
    if (headers.has('authorization')) authorization = headers.get('authorization')!
    return fetch(url, init)
  })
  const folders = new Set<string>()
  const createFolder = client.createActivityFolder.bind(client)
  client.createActivityFolder = async (connection, activityId) => { const folder = await createFolder(connection, activityId); folders.add(folder); return folder }
  const adapter = new DriveMediaStorage(config.googleDrive, connections, client)
  const recorder = new RecorderMediaService(repository, [adapter], config.s3)
  const transfer = new DriveUploadService(pool, config.googleDrive, connections, client)
  const activities: string[] = []
  const refs = new Set<string>()
  let owner = ''
  try {
    const result = await pool.query<{ user_id: string }>('SELECT user_id FROM google_drive_connections')
    const selected = process.env.GOOGLE_DRIVE_SMOKE_USER_ID
    assert.ok(selected ? result.rows.some(row => row.user_id === selected) : result.rows.length === 1, 'Select one authorized linked test account using GOOGLE_DRIVE_SMOKE_USER_ID when multiple exist.')
    owner = selected ?? result.rows[0].user_id
    const connection = await connections.get(owner)
    assert.ok(connection)
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGZkAAAAASUVORK5CYII=', 'base64')
    for (const mode of ['complete', 'cancel'] as const) {
      const activity = await recorder.createActivity(owner, { operationType: 'packing', storageProvider: 'google_drive', reference: `DRIVE-SMOKE-${randomUUID()}`, notes: 'Disposable automated Drive smoke; removed after verification.', occurredAt: new Date().toISOString() })
      activities.push(activity.id)
      const media = await recorder.createAsset(owner, activity.id, { contentType: 'image/png', mediaType: 'image', originalFilename: 'drive-smoke.png', sha256: createHash('sha256').update(bytes).digest('hex'), sizeBytes: bytes.length })
      const target = await repository.getAssetUploadTarget(owner, media.asset.id)
      assert.ok(target)
      refs.add(target.providerObjectRef)
      const fileId = (JSON.parse(target.providerObjectRef) as { file: string }).file
      await transfer.upload(owner, media.asset.id, media.upload.attemptId, Readable.from([bytes]), bytes.length)
      if (mode === 'cancel') {
        assert.equal((await recorder.cancelActivity(owner, activity.id)).cleanupPending, 0)
        console.log('PASS live unfinished-upload cancellation and provider cleanup')
        continue
      }
      assert.equal((await recorder.finalizeAsset(owner, media.asset.id, media.upload.attemptId)).status, 'ready')
      await recorder.completeActivity(owner, activity.id)
      const read = async () => {
        const download = await recorder.retrieveAsset(owner, media.asset.id)
        assert.ok('body' in download)
        const chunks: Buffer[] = []; for await (const chunk of download.body) chunks.push(Buffer.from(chunk))
        assert.deepEqual(Buffer.concat(chunks), bytes)
      }
      await read()
      console.log('PASS live upload, byte verification and original download')
      const changed = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`, { method: 'PATCH', headers: { authorization, 'content-type': 'image/png' }, body: Buffer.concat([bytes, Buffer.from('\n')]), signal: AbortSignal.timeout(30_000) })
      assert.equal(changed.ok, true, `Fixture edit failed with HTTP ${changed.status}`)
      await read()
      console.log('PASS retained original revision after Drive head edit')
      await client.delete(connection, fileId)
      await assert.rejects(recorder.retrieveAsset(owner, media.asset.id), /unavailable/)
      assert.equal((await recorder.deleteActivity(owner, activity.id)).cleanupPending, 0)
      console.log('PASS missing-file access denial and completed-record deletion')
    }
  } finally {
    let cleaned = true
    for (const ref of refs) { try { await adapter.deleteObject(ref) } catch { cleaned = false } }
    const connection = owner ? await connections.get(owner) : null
    if (connection) for (const folder of folders) { try { await client.delete(connection, folder) } catch { cleaned = false } }
    if (cleaned && activities.length) {
      await pool.query('DELETE FROM media_cleanup_jobs WHERE activity_id=ANY($1::uuid[])', [activities])
      await pool.query('DELETE FROM recorder_activity_audit_events WHERE activity_id=ANY($1::uuid[])', [activities])
      await pool.query('DELETE FROM media_upload_attempts WHERE asset_id IN (SELECT id FROM media_assets WHERE activity_id=ANY($1::uuid[]))', [activities])
      await pool.query('DELETE FROM media_assets WHERE activity_id=ANY($1::uuid[])', [activities])
      await pool.query('DELETE FROM recorder_activities WHERE id=ANY($1::uuid[])', [activities])
    }
    await pool.end()
    assert.equal(cleaned, true, 'Smoke cleanup needs retry; diagnostic database records retained.')
    console.log('PASS disposable smoke data cleaned; existing connection and evidence preserved')
  }
})
