import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { Pool } from 'pg'

import { PostgresRecorderRepository } from './repository.js'

const integrationEnabled = process.env.RUN_DATABASE_INTEGRATION === '1'
const databaseUrl = integrationEnabled ? process.env.DATABASE_URL : undefined

test('PostgreSQL repository persists and finalizes an S3 media attempt', {
  skip: databaseUrl ? false : 'Set RUN_DATABASE_INTEGRATION=1 and DATABASE_URL to run this test.',
}, async () => {
  assert.ok(databaseUrl)
  const pool = new Pool({ connectionString: databaseUrl })
  const repository = new PostgresRecorderRepository(pool)
  const userId = randomUUID()
  let activityId: string | undefined

  try {
    await pool.query(`
      INSERT INTO app_users (id, username, username_normalized, password_hash)
      VALUES ($1, $2, $2, $3)
    `, [userId, `integration-${userId}`, 'not-a-real-password-hash'])

    const activity = await repository.createActivity(userId, {
      notes: 'Repository integration test',
      occurredAt: new Date().toISOString(),
      operationType: 'packing',
      reference: `TEST-${userId}`,
      storageProvider: 's3',
    })
    activityId = activity.id

    const assetId = randomUUID()
    const attemptId = randomUUID()
    const sha256 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    const objectRef = `integration/${userId}/${assetId}/${attemptId}`
    const asset = await repository.createAssetWithAttempt({
      activityId,
      assetId,
      assetInput: {
        contentType: 'image/jpeg',
        mediaType: 'image',
        originalFilename: 'evidence.jpg',
        sha256,
        sizeBytes: 256,
      },
      attemptId,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      ownerUserId: userId,
      providerObjectRef: objectRef,
      providerUploadRef: objectRef,
    })
    assert.equal(asset?.status, 'pending_upload')
    assert.equal(await repository.getAssetRetryStatus(userId, assetId), 'active')

    const beginning = await repository.beginFinalize(userId, assetId, attemptId)
    assert.equal(beginning?.kind, 'started')
    const ready = await repository.finishFinalize(assetId, attemptId, {
      contentType: 'image/jpeg',
      providerVersionRef: 'integration-version',
      sha256,
      sizeBytes: 256,
    })
    assert.equal(ready.status, 'ready')
    assert.equal(await repository.getAssetRetryStatus(userId, assetId), 'ready')
    const retrieval = await repository.getReadyAsset(userId, assetId)
    assert.equal(retrieval?.providerObjectRef, objectRef)
    assert.equal(retrieval?.providerVersionRef, 'integration-version')
    assert.equal(await repository.getReadyAsset(randomUUID(), assetId), null)
    const completed = await repository.completeActivity(userId, activityId)
    assert.equal(completed?.status, 'complete')
    assert.ok(completed?.completedAt)
    const history = await repository.listActivities(userId, {
      operationType: 'packing', page: 1, pageSize: 20, sortDirection: 'desc', status: 'complete', storageProvider: 's3',
    })
    assert.equal(history.totalRecords, 1)
    assert.equal(history.activities[0].id, activityId)
    const detail = await repository.getActivityWithAssets(userId, activityId)
    assert.equal(detail?.assets[0].id, assetId)
    assert.equal(await repository.getActivityWithAssets(randomUUID(), activityId), null)

    const corrected = await repository.updateActivity(userId, activityId, {
      notes: 'Audited correction', operationType: 'unpacking', reference: null,
    })
    assert.equal(corrected?.operationType, 'unpacking')
    assert.equal(corrected?.reference, null)
    let audit = await repository.listAuditEvents(userId, activityId)
    assert.equal(audit?.[0].action, 'metadata_updated')
    assert.equal(audit?.[0].before?.reference, `TEST-${userId}`)

    await pool.query("UPDATE recorder_activities SET evidence_expires_at = now() - interval '1 second' WHERE id = $1", [activityId])
    const expiration = await repository.expireDueActivities(100)
    assert.equal(expiration.expiredActivities, 1)
    assert.equal(expiration.cleanupTargets.length, 1)
    assert.equal((await repository.getActivity(userId, activityId))?.status, 'expired')
    assert.equal(await repository.getReadyAsset(userId, assetId), null)
    assert.equal((await repository.listActivities(userId, { page: 1, pageSize: 20, sortDirection: 'desc', status: 'expired' })).totalRecords, 1)

    const deletion = await repository.deleteActivity(userId, activityId)
    assert.equal(deletion?.cleanupTargets.length, 1)
    assert.equal(deletion?.cleanupTargets[0].providerVersionRef, 'integration-version')
    assert.equal(await repository.getActivity(userId, activityId), null)
    assert.equal((await repository.listActivities(userId, {
      page: 1, pageSize: 20, sortDirection: 'desc',
    })).totalRecords, 0)
    await repository.finishCleanup(deletion!.cleanupTargets[0].cleanupId, true)
    assert.equal((await repository.retryCleanup(userId, activityId))?.cleanupTargets.length, 0)
    audit = await repository.listAuditEvents(userId, activityId)
    assert.deepEqual(audit?.map((event) => event.action), ['metadata_updated', 'expired', 'deleted', 'cleanup_retried'])
  } finally {
    if (activityId) {
      await pool.query('DELETE FROM recorder_activity_audit_events WHERE activity_id = $1', [activityId])
      await pool.query('DELETE FROM media_cleanup_jobs WHERE activity_id = $1', [activityId])
      await pool.query(
        'DELETE FROM media_upload_attempts WHERE asset_id IN (SELECT id FROM media_assets WHERE activity_id = $1)',
        [activityId],
      )
      await pool.query('DELETE FROM media_assets WHERE activity_id = $1', [activityId])
      await pool.query('DELETE FROM recorder_activities WHERE id = $1', [activityId])
    }
    await pool.query('DELETE FROM app_users WHERE id = $1', [userId])
    await pool.end()
  }
})

test('PostgreSQL reference search is literal, owner-scoped, filtered before pagination and preserves reference values', {
  skip: databaseUrl ? false : 'Set RUN_DATABASE_INTEGRATION=1 and DATABASE_URL to run this test.',
}, async () => {
  const pool = new Pool({ connectionString: databaseUrl })
  const repository = new PostgresRecorderRepository(pool)
  const owners = [randomUUID(), randomUUID()]
  const base = { notes: null, occurredAt: '2026-09-01T00:00:00.000Z', operationType: 'packing' as const, storageProvider: 's3' as const }
  const query = { page: 1, pageSize: 1, sortDirection: 'asc' as const }
  try {
    for (const id of owners) await pool.query('INSERT INTO app_users (id, username, username_normalized, password_hash) VALUES ($1, $2, $2, $3)', [id, `search-test-${id}`, 'not-a-real-password-hash'])
    const first = await repository.createActivity(owners[0], { ...base, reference: 'Order-AbC-001' })
    const second = await repository.createActivity(owners[0], { ...base, reference: 'ORDER-abc-002', storageProvider: 'google_drive', occurredAt: '2026-09-02T00:00:00.000Z' })
    await repository.createActivity(owners[1], { ...base, reference: 'ORDER-abc-private' })
    await repository.createActivity(owners[0], { ...base, reference: null })
    await repository.createActivity(owners[0], { ...base, reference: 'ORDER-abc-unpacking', operationType: 'unpacking' })
    const deleted = await repository.createActivity(owners[0], { ...base, reference: 'ORDER-abc-deleted' })
    await pool.query("UPDATE recorder_activities SET status='deleted', deleted_at=now() WHERE id=$1", [deleted.id])
    const result = await repository.listActivities(owners[0], { ...query, reference: 'aBc', operationType: 'packing' })
    assert.equal(result.totalRecords, 2)
    assert.equal(result.activities[0].id, first.id)
    assert.equal(result.activities[0].reference, 'Order-AbC-001')
    const page2 = await repository.listActivities(owners[0], { ...query, reference: 'abc', operationType: 'packing', page: 2 })
    assert.equal(page2.activities[0].id, second.id)
    const drive = await repository.listActivities(owners[0], { ...query, reference: 'abc', operationType: 'packing', storageProvider: 'google_drive', status: 'draft', occurredFrom: '2026-09-02T00:00:00.000Z', occurredTo: '2026-09-02T00:00:00.000Z' })
    assert.equal(drive.totalRecords, 1)
    assert.equal(drive.activities[0].id, second.id)
    assert.equal((await repository.listActivities(owners[0], { ...query, reference: 'private' })).totalRecords, 0)
    assert.equal((await repository.listActivities(owners[0], { ...query, reference: 'abc', page: 100 })).activities.length, 0)
    const packingCandidates = await repository.listComparisonCandidates(owners[0], 'ORDER-ABC-001', 'packing', 51)
    const unpackingCandidates = await repository.listComparisonCandidates(owners[0], 'order-abc-unpacking', 'unpacking', 51)
    assert.deepEqual(packingCandidates.map((activity) => activity.id), [first.id])
    assert.equal(unpackingCandidates.length, 1)
    assert.equal((await repository.listComparisonCandidates(owners[0], 'abc', 'packing', 51)).length, 0)
    assert.equal((await repository.listComparisonCandidates(owners[0], 'ORDER-abc-private', 'packing', 51)).length, 0)
    for (const reference of ['PCT%value', 'under_score', String.raw`back\slash`, "quote' OR 1=1 --", 'two  spaces', 'MÃ-ĐƠN', 'amp&plus+hash#']) {
      const literal = await repository.createActivity(owners[0], { ...base, reference })
      const found = await repository.listActivities(owners[0], { ...query, reference })
      assert.equal(found.totalRecords, 1, reference)
      assert.equal(found.activities[0].id, literal.id)
    }
    for (const reference of ['%', '_', '\\', "' OR 1=1"]) assert.equal((await repository.listActivities(owners[0], { ...query, reference })).totalRecords, 1, reference)
    for (const reference of ['two spaces', 'MA-DON', 'not-found']) assert.equal((await repository.listActivities(owners[0], { ...query, reference })).totalRecords, 0, reference)
  } finally {
    await pool.query('DELETE FROM recorder_activities WHERE owner_user_id = ANY($1::uuid[])', [owners])
    await pool.query('DELETE FROM app_users WHERE id = ANY($1::uuid[])', [owners])
    await pool.end()
  }
})
