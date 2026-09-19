import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { buildApp } from '../app.js'
import type { AppConfig, S3Config } from '../config.js'
import type { IssuedUpload, MediaStorageAdapter, StorageObjectInput, VerifiedStorageObject } from '../storage/types.js'
import { StorageUnavailableError, StorageVerificationError } from '../storage/types.js'
import type { ActivityAuditEvent, CreateRecorderActivityInput, MediaAsset, RecorderActivity, UpdateRecorderActivityInput } from './domain.js'
import type { BeginFinalizeResult, RecorderRepository, UploadTarget } from './repository.js'
import { RecorderMediaService } from './service.js'

const ownerId = 'f079ef9c-727d-4820-83e8-bbea3cb53b45'
const otherOwnerId = '5180923f-e769-4119-9db2-92bec8e329c1'
const allowedOrigin = 'http://localhost:5173'
const s3: S3Config = {
  accessKeyId: 'test-access-key', bucket: 'recorder-media', downloadExpiresSeconds: 300,
  endpoint: 'https://s3.us-west-004.backblazeb2.com', maxImageBytes: 1_024, maxVideoBytes: 2_048,
  region: 'us-west-004', secretAccessKey: 'test-secret-key', uploadExpiresSeconds: 900,
}
const config: AppConfig = {
  corsOrigin: allowedOrigin, host: '127.0.0.1', logLevel: 'silent' as AppConfig['logLevel'],
  nodeEnv: 'test', port: 3000, s3, trustProxy: false,
}

class MemoryRecorderRepository implements RecorderRepository {
  activities = new Map<string, RecorderActivity>()
  assets = new Map<string, MediaAsset>()
  attempts = new Map<string, string>()
  targets = new Map<string, UploadTarget>()
  audits = new Map<string, ActivityAuditEvent[]>()
  deleted = new Set<string>()
  cleanupSucceeded = new Set<string>()
  activeAttemptAssets = new Set<string>()

  async createActivity(userId: string, input: CreateRecorderActivityInput): Promise<RecorderActivity> {
    const now = new Date().toISOString()
    const activity: RecorderActivity = {
      ...input, completedAt: null, createdAt: now, id: randomUUID(), ownerUserId: userId, status: 'draft', updatedAt: now,
    }
    this.activities.set(activity.id, activity)
    return activity
  }

  async getActivity(userId: string, activityId: string): Promise<RecorderActivity | null> {
    const activity = this.activities.get(activityId)
    return activity?.ownerUserId === userId && !this.deleted.has(activityId) ? activity : null
  }

  async getActivityWithAssets(userId: string, activityId: string) {
    const activity = await this.getActivity(userId, activityId)
    if (!activity) return null
    const assets = [...this.assets.values()]
      .filter((asset) => asset.activityId === activityId)
      .sort((left, right) => left.ordinal - right.ordinal || left.id.localeCompare(right.id))
    return { activity, assets }
  }

  async listActivities(userId: string, input: Parameters<RecorderRepository['listActivities']>[1]) {
    const direction = input.sortDirection === 'asc' ? 1 : -1
    const filtered = [...this.activities.values()]
      .filter((activity) => activity.ownerUserId === userId)
      .filter((activity) => !this.deleted.has(activity.id))
      .filter((activity) => !input.reference || Boolean(activity.reference?.toLowerCase().includes(input.reference.toLowerCase())))
      .filter((activity) => !input.operationType || activity.operationType === input.operationType)
      .filter((activity) => !input.status || activity.status === input.status)
      .filter((activity) => !input.storageProvider || activity.storageProvider === input.storageProvider)
      .filter((activity) => !input.occurredFrom || activity.occurredAt >= input.occurredFrom)
      .filter((activity) => !input.occurredTo || activity.occurredAt <= input.occurredTo)
      .sort((left, right) => direction * (left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id)))
    const offset = (input.page - 1) * input.pageSize
    return { activities: filtered.slice(offset, offset + input.pageSize), totalRecords: filtered.length }
  }

  async listComparisonCandidates(userId: string, reference: string, operationType: RecorderActivity['operationType'], limit: number) {
    return [...this.activities.values()]
      .filter((activity) => activity.ownerUserId === userId)
      .filter((activity) => !this.deleted.has(activity.id))
      .filter((activity) => activity.reference?.toLowerCase() === reference.toLowerCase())
      .filter((activity) => activity.operationType === operationType)
      .sort((left, right) => -(left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id)))
      .slice(0, limit)
  }

  async completeActivity(userId: string, activityId: string): Promise<RecorderActivity | null> {
    const activity = await this.getActivity(userId, activityId)
    if (!activity) return null
    if (activity.status === 'complete') return activity
    const assets = [...this.assets.values()].filter((asset) => asset.activityId === activityId)
    if (!assets.length || assets.some((asset) => asset.status !== 'ready')) throw new Error('ACTIVITY_NOT_COMPLETABLE')
    const now = new Date().toISOString()
    const completed = { ...activity, completedAt: now, status: 'complete' as const, updatedAt: now }
    this.activities.set(activityId, completed)
    return completed
  }

  async updateActivity(userId: string, activityId: string, input: UpdateRecorderActivityInput): Promise<RecorderActivity | null> {
    const activity = await this.getActivity(userId, activityId)
    if (!activity) return null
    if (activity.status === 'cancelled') throw new Error('ACTIVITY_IMMUTABLE')
    const updated = { ...activity, ...input, updatedAt: new Date().toISOString() }
    this.activities.set(activityId, updated)
    this.addAudit(activityId, 'metadata_updated', { ...activity }, { ...updated })
    return updated
  }

  private addAudit(
    activityId: string,
    action: ActivityAuditEvent['action'],
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
  ) {
    const publicState = (state: Record<string, unknown> | null) => {
      if (!state) return null
      const { ownerUserId: _ownerUserId, ...result } = state
      return result
    }
    const events = this.audits.get(activityId) ?? []
    events.push({ action, after: publicState(after), before: publicState(before), createdAt: new Date().toISOString(), id: randomUUID() })
    this.audits.set(activityId, events)
  }

  private pendingCleanup(activityId: string) {
    return [...this.targets.values()]
      .filter((target) => target.activityId === activityId && !this.cleanupSucceeded.has(target.assetId))
      .map((target) => ({
        cleanupId: target.assetId, providerObjectRef: target.providerObjectRef,
        providerVersionRef: target.providerVersionRef, storageProvider: target.storageProvider,
      }))
  }

  async cancelActivity(userId: string, activityId: string) {
    const activity = await this.getActivity(userId, activityId)
    if (!activity) return null
    if (activity.status === 'complete') throw new Error('ACTIVITY_NOT_CANCELLABLE')
    if (activity.status !== 'cancelled') {
      const updated = { ...activity, status: 'cancelled' as const, updatedAt: new Date().toISOString() }
      this.activities.set(activityId, updated)
      this.addAudit(activityId, 'cancelled', { ...activity }, { ...updated })
    }
    return { cleanupTargets: this.pendingCleanup(activityId) }
  }

  async deleteActivity(userId: string, activityId: string) {
    const activity = this.activities.get(activityId)
    if (!activity || activity.ownerUserId !== userId) return null
    if (activity.status !== 'complete' && !this.deleted.has(activityId)) throw new Error('ACTIVITY_NOT_DELETABLE')
    if (!this.deleted.has(activityId)) {
      this.deleted.add(activityId)
      this.addAudit(activityId, 'deleted', { ...activity }, { status: 'deleted' })
    }
    return { cleanupTargets: this.pendingCleanup(activityId) }
  }

  async retryCleanup(userId: string, activityId: string) {
    const activity = this.activities.get(activityId)
    if (!activity || activity.ownerUserId !== userId || (activity.status !== 'cancelled' && !this.deleted.has(activityId))) return null
    this.addAudit(activityId, 'cleanup_retried', null, { pendingJobs: this.pendingCleanup(activityId).length })
    return { cleanupTargets: this.pendingCleanup(activityId) }
  }

  async finishCleanup(cleanupId: string, succeeded: boolean): Promise<void> {
    if (succeeded) this.cleanupSucceeded.add(cleanupId)
  }

  async listAuditEvents(userId: string, activityId: string): Promise<ActivityAuditEvent[] | null> {
    const activity = this.activities.get(activityId)
    return activity?.ownerUserId === userId ? (this.audits.get(activityId) ?? []) : null
  }

  async createAssetWithAttempt(input: Parameters<RecorderRepository['createAssetWithAttempt']>[0]): Promise<MediaAsset | null> {
    const activity = await this.getActivity(input.ownerUserId, input.activityId)
    if (!activity) return null
    const now = new Date().toISOString()
    const asset: MediaAsset = {
      activityId: input.activityId, contentType: input.assetInput.contentType, createdAt: now, id: input.assetId,
      mediaType: input.assetInput.mediaType, ordinal: this.assets.size + 1,
      originalFilename: input.assetInput.originalFilename, readyAt: null, sha256: input.assetInput.sha256,
      sizeBytes: input.assetInput.sizeBytes, status: 'pending_upload', storageProvider: activity.storageProvider, updatedAt: now,
    }
    this.assets.set(asset.id, asset)
    this.attempts.set(input.attemptId, asset.id)
    this.activeAttemptAssets.add(asset.id)
    this.targets.set(asset.id, {
      activityId: activity.id, assetId: asset.id, contentType: asset.contentType, ownerUserId: input.ownerUserId,
      providerObjectRef: input.providerObjectRef, providerVersionRef: null, sha256: asset.sha256, sizeBytes: asset.sizeBytes,
      storageProvider: asset.storageProvider,
    })
    this.activities.set(activity.id, { ...activity, status: 'uploading', updatedAt: now })
    return asset
  }

  async getAssetUploadTarget(userId: string, assetId: string): Promise<UploadTarget | null> {
    const target = this.targets.get(assetId)
    const activity = target ? this.activities.get(target.activityId) : null
    return target?.ownerUserId === userId && activity?.status !== 'cancelled' && !this.deleted.has(target.activityId) ? target : null
  }

  async getAssetRetryStatus(userId: string, assetId: string): Promise<'active' | 'ready' | 'retryable' | null> {
    const target = await this.getAssetUploadTarget(userId, assetId)
    if (!target) return null
    if (this.assets.get(assetId)?.status === 'ready') return 'ready'
    return this.activeAttemptAssets.has(assetId) ? 'active' : 'retryable'
  }

  async createRetryAttempt(input: Parameters<RecorderRepository['createRetryAttempt']>[0]): Promise<MediaAsset | null> {
    const target = await this.getAssetUploadTarget(input.ownerUserId, input.assetId)
    if (!target) return null
    const asset = this.assets.get(input.assetId)!
    if (asset.status === 'ready') throw new Error('ASSET_ALREADY_READY')
    if (this.activeAttemptAssets.has(input.assetId)) throw new Error('UPLOAD_ALREADY_ACTIVE')
    this.attempts.set(input.attemptId, input.assetId)
    this.activeAttemptAssets.add(input.assetId)
    this.targets.set(input.assetId, { ...target, providerObjectRef: input.providerObjectRef, providerVersionRef: null })
    const updated = { ...asset, status: 'pending_upload' as const, updatedAt: new Date().toISOString() }
    this.assets.set(asset.id, updated)
    return updated
  }

  async beginFinalize(userId: string, assetId: string, attemptId: string): Promise<BeginFinalizeResult | null> {
    const target = await this.getAssetUploadTarget(userId, assetId)
    if (!target || this.attempts.get(attemptId) !== assetId) return null
    const asset = this.assets.get(assetId)!
    if (asset.status === 'ready') return { asset, kind: 'ready' }
    this.assets.set(assetId, { ...asset, status: 'verifying' })
    return { kind: 'started', target }
  }

  async finishFinalize(assetId: string, _attemptId: string, verified: VerifiedStorageObject): Promise<MediaAsset> {
    const asset = this.assets.get(assetId)!
    const updated: MediaAsset = {
      ...asset, contentType: verified.contentType, readyAt: new Date().toISOString(), sha256: verified.sha256,
      sizeBytes: verified.sizeBytes, status: 'ready', updatedAt: new Date().toISOString(),
    }
    this.assets.set(assetId, updated)
    this.targets.set(assetId, { ...this.targets.get(assetId)!, providerVersionRef: verified.providerVersionRef })
    this.activeAttemptAssets.delete(assetId)
    return updated
  }

  async failFinalize(assetId: string): Promise<void> {
    const asset = this.assets.get(assetId)!
    this.assets.set(assetId, { ...asset, status: 'failed', updatedAt: new Date().toISOString() })
    this.activeAttemptAssets.delete(assetId)
  }

  async releaseFinalize(assetId: string): Promise<void> {
    const asset = this.assets.get(assetId)!
    this.assets.set(assetId, { ...asset, status: 'pending_upload', updatedAt: new Date().toISOString() })
  }

  async getReadyAsset(userId: string, assetId: string): Promise<UploadTarget | null> {
    const asset = this.assets.get(assetId)
    const activity = asset ? this.activities.get(asset.activityId) : null
    return asset?.status === 'ready' && activity?.status !== 'cancelled' && !this.deleted.has(asset.activityId)
      ? this.getAssetUploadTarget(userId, assetId) : null
  }
}

class FakeS3Storage implements MediaStorageAdapter {
  readonly provider = 's3' as const
  deleteCalls = 0
  downloadVersionRef: string | null | undefined
  verifyResult: 'ok' | 'mismatch' | 'outage' = 'ok'
  cleanupFails = false
  downloadFails = false
  issueCalls = 0

  async issueUpload(input: StorageObjectInput, attemptId: string): Promise<IssuedUpload> {
    this.issueCalls += 1
    return {
      capability: {
        attemptId, expiresAt: '2026-09-03T09:00:00.000Z', headers: { 'Content-Type': input.contentType },
        method: 'PUT', strategy: 'direct', url: 'https://presigned.b2.example/upload?signature=redacted',
      },
      providerObjectRef: `users/${input.ownerUserId}/activities/${input.activityId}/assets/${input.assetId}/attempts/${attemptId}`,
      providerUploadRef: input.assetId,
    }
  }

  async verify(_providerObjectRef: string, expected: StorageObjectInput): Promise<VerifiedStorageObject> {
    if (this.verifyResult === 'mismatch') throw new StorageVerificationError('CHECKSUM_MISMATCH', 'mismatch')
    if (this.verifyResult === 'outage') throw new StorageUnavailableError()
    return {
      contentType: expected.contentType, providerVersionRef: 'verified-version', sha256: expected.sha256, sizeBytes: expected.sizeBytes,
    }
  }

  async deleteUnverified(): Promise<void> { this.deleteCalls += 1 }
  async deleteObject(): Promise<void> {
    this.deleteCalls += 1
    if (this.cleanupFails) throw new StorageUnavailableError()
  }
  async issueDownload(_providerObjectRef: string, providerVersionRef?: string | null): Promise<{ expiresAt: string; url: string }> {
    if (this.downloadFails) throw new StorageUnavailableError()
    this.downloadVersionRef = providerVersionRef
    return { expiresAt: '2026-09-03T09:00:00.000Z', url: 'https://presigned.b2.example/download?signature=redacted' }
  }
}

function fixture() {
  const repository = new MemoryRecorderRepository()
  const storage = new FakeS3Storage()
  const app = buildApp(config, {
    recorder: {
      authenticate: async (request) => request.headers.cookie === 'recorder_session=valid' ? ownerId : null,
      service: new RecorderMediaService(repository, [storage], s3),
    },
  })
  return { app, repository, storage }
}

const mediaPayload = {
  contentType: 'image/jpeg', mediaType: 'image', originalFilename: 'seal.jpg',
  sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', sizeBytes: 256,
} as const

test('recorder mutations require authentication and the configured origin', async () => {
  const { app } = fixture()
  const unauthorized = await app.inject({ method: 'POST', url: '/api/v1/recorder-activities', payload: { operationType: 'packing', storageProvider: 's3' } })
  assert.equal(unauthorized.statusCode, 401)

  const csrf = await app.inject({
    method: 'POST', url: '/api/v1/recorder-activities', cookies: { recorder_session: 'valid' },
    headers: { origin: 'https://evil.example' }, payload: { operationType: 'packing', storageProvider: 's3' },
  })
  assert.equal(csrf.statusCode, 403)
  await app.close()
})

test('an activity cannot complete before every evidence asset is ready', async () => {
  const { app } = fixture()
  const headers = { cookie: 'recorder_session=valid', origin: allowedOrigin }
  const activity = await app.inject({
    method: 'POST', url: '/api/v1/recorder-activities', headers,
    payload: { operationType: 'packing', storageProvider: 's3' },
  })
  const response = await app.inject({
    method: 'POST', url: `/api/v1/recorder-activities/${activity.json().data.id}/complete`, headers, payload: {},
  })
  assert.equal(response.statusCode, 409)
  assert.equal(response.json().error.code, 'ACTIVITY_NOT_COMPLETABLE')
  await app.close()
})

test('owner can create an S3 activity, upload intent, finalize, and retrieve ready evidence', async () => {
  const { app, storage } = fixture()
  const auth = { cookie: 'recorder_session=valid', origin: allowedOrigin }
  const activityResponse = await app.inject({
    method: 'POST', url: '/api/v1/recorder-activities', headers: auth,
    payload: { operationType: 'packing', reference: 'ORDER-1042', storageProvider: 's3' },
  })
  assert.equal(activityResponse.statusCode, 201)
  assert.equal(activityResponse.json().data.ownerUserId, undefined)
  const activityId = activityResponse.json().data.id as string

  const assetResponse = await app.inject({
    method: 'POST', url: `/api/v1/recorder-activities/${activityId}/media-assets`, headers: auth, payload: mediaPayload,
  })
  assert.equal(assetResponse.statusCode, 201)
  assert.doesNotMatch(assetResponse.body, /test-secret-key|providerObjectRef/)
  const { asset, upload } = assetResponse.json().data

  const finalize = await app.inject({
    method: 'POST', url: `/api/v1/media-assets/${asset.id}/upload-attempts/${upload.attemptId}/finalize`,
    headers: auth, payload: {},
  })
  assert.equal(finalize.statusCode, 200)
  assert.equal(finalize.json().data.status, 'ready')

  const complete = await app.inject({
    method: 'POST', url: `/api/v1/recorder-activities/${activityId}/complete`, headers: auth, payload: {},
  })
  assert.equal(complete.statusCode, 200)
  assert.equal(complete.json().data.status, 'complete')

  const retrieve = await app.inject({
    method: 'GET', url: `/api/v1/media-assets/${asset.id}/content`, headers: { cookie: auth.cookie },
  })
  assert.equal(retrieve.statusCode, 307)
  assert.equal(retrieve.headers.location, 'https://presigned.b2.example/download?signature=redacted')
  assert.equal(storage.downloadVersionRef, 'verified-version')
  assert.equal(retrieve.headers['cache-control'], 'no-store')
  await app.close()
})

test('upload abuse is rejected before a provider capability is issued', async () => {
  const { app, storage } = fixture()
  const headers = { cookie: 'recorder_session=valid', origin: allowedOrigin }
  const activity = await app.inject({
    method: 'POST', url: '/api/v1/recorder-activities', headers,
    payload: { operationType: 'packing', storageProvider: 's3' },
  })
  const activityId = activity.json().data.id as string
  const wrongType = await app.inject({
    method: 'POST', url: `/api/v1/recorder-activities/${activityId}/media-assets`, headers,
    payload: { ...mediaPayload, contentType: 'text/plain' },
  })
  const oversized = await app.inject({
    method: 'POST', url: `/api/v1/recorder-activities/${activityId}/media-assets`, headers,
    payload: { ...mediaPayload, sizeBytes: s3.maxImageBytes + 1 },
  })
  const malformed = await app.inject({
    method: 'POST', url: `/api/v1/recorder-activities/${activityId}/media-assets`, headers,
    payload: { ...mediaPayload, providerObjectRef: 'attacker-controlled' },
  })

  assert.deepEqual([wrongType.statusCode, oversized.statusCode, malformed.statusCode], [400, 400, 400])
  assert.equal(storage.issueCalls, 0)
  assert.doesNotMatch(`${wrongType.body}${oversized.body}${malformed.body}`, /test-secret-key|attacker-controlled/)
  await app.close()
})

test('a second upload capability is rejected before provider access while an attempt is active', async () => {
  const { app, storage } = fixture()
  const headers = { cookie: 'recorder_session=valid', origin: allowedOrigin }
  const activity = await app.inject({
    method: 'POST', url: '/api/v1/recorder-activities', headers,
    payload: { operationType: 'packing', storageProvider: 's3' },
  })
  const created = await app.inject({
    method: 'POST', url: `/api/v1/recorder-activities/${activity.json().data.id}/media-assets`, headers, payload: mediaPayload,
  })
  const duplicate = await app.inject({
    method: 'POST', url: `/api/v1/media-assets/${created.json().data.asset.id}/upload-attempts`, headers, payload: {},
  })
  assert.equal(duplicate.statusCode, 409)
  assert.equal(duplicate.json().error.code, 'UPLOAD_ALREADY_ACTIVE')
  assert.equal(storage.issueCalls, 1)
  await app.close()
})

test('provider outages retain retryable state and return stable errors without provider details', async () => {
  const { app, storage } = fixture()
  const headers = { cookie: 'recorder_session=valid', origin: allowedOrigin }
  const activity = await app.inject({
    method: 'POST', url: '/api/v1/recorder-activities', headers,
    payload: { operationType: 'packing', storageProvider: 's3' },
  })
  const created = await app.inject({
    method: 'POST', url: `/api/v1/recorder-activities/${activity.json().data.id}/media-assets`, headers, payload: mediaPayload,
  })
  const { asset, upload } = created.json().data
  storage.verifyResult = 'outage'
  const unavailable = await app.inject({
    method: 'POST', url: `/api/v1/media-assets/${asset.id}/upload-attempts/${upload.attemptId}/finalize`, headers, payload: {},
  })
  assert.equal(unavailable.statusCode, 503)
  assert.equal(unavailable.json().error.code, 'STORAGE_PROVIDER_UNAVAILABLE')
  assert.doesNotMatch(unavailable.body, /signature|providerObjectRef|test-secret-key/)

  storage.verifyResult = 'ok'
  const retried = await app.inject({
    method: 'POST', url: `/api/v1/media-assets/${asset.id}/upload-attempts/${upload.attemptId}/finalize`, headers, payload: {},
  })
  assert.equal(retried.statusCode, 200)
  storage.downloadFails = true
  const download = await app.inject({ method: 'GET', url: `/api/v1/media-assets/${asset.id}/content`, headers: { cookie: headers.cookie } })
  assert.equal(download.statusCode, 503)
  assert.equal(download.json().error.code, 'STORAGE_PROVIDER_UNAVAILABLE')
  await app.close()
})

test('all recorder lifecycle surfaces preserve missing/other-owner equivalence', async () => {
  const { app, repository } = fixture()
  const privateActivity = await repository.createActivity(otherOwnerId, {
    notes: null, occurredAt: new Date().toISOString(), operationType: 'packing', reference: null, storageProvider: 's3',
  })
  const headers = { cookie: 'recorder_session=valid', origin: allowedOrigin }
  const responses = await Promise.all([
    app.inject({ method: 'PATCH', url: `/api/v1/recorder-activities/${privateActivity.id}`, headers, payload: { notes: 'intrusion' } }),
    app.inject({ method: 'POST', url: `/api/v1/recorder-activities/${privateActivity.id}/cancel`, headers, payload: {} }),
    app.inject({ method: 'DELETE', url: `/api/v1/recorder-activities/${privateActivity.id}`, headers }),
    app.inject({ method: 'GET', url: `/api/v1/recorder-activities/${privateActivity.id}/audit-events`, headers: { cookie: headers.cookie } }),
  ])
  assert.deepEqual(responses.map((response) => response.statusCode), [404, 404, 404, 404])
  assert.ok(responses.every((response) => response.json().error.code === 'ACTIVITY_NOT_FOUND'))
  assert.equal((await repository.getActivity(otherOwnerId, privateActivity.id))?.notes, null)
  await app.close()
})

test('recorder mutations are rate-limited with the standard error contract', async () => {
  const { app } = fixture()
  const headers = { cookie: 'recorder_session=valid', origin: allowedOrigin }
  let response
  for (let index = 0; index < 31; index += 1) {
    response = await app.inject({
      method: 'POST', url: '/api/v1/recorder-activities', headers,
      payload: { operationType: 'packing', reference: `RATE-${index}`, storageProvider: 's3' },
    })
  }
  assert.equal(response?.statusCode, 429)
  assert.deepEqual(response?.json(), { error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' } })
  assert.ok(response?.headers['retry-after'])
  await app.close()
})

test('finalization fails closed and removes an unverifiable S3 object', async () => {
  const { app, storage } = fixture()
  const headers = { cookie: 'recorder_session=valid', origin: allowedOrigin }
  const activity = await app.inject({ method: 'POST', url: '/api/v1/recorder-activities', headers, payload: { operationType: 'unpacking', storageProvider: 's3' } })
  const created = await app.inject({ method: 'POST', url: `/api/v1/recorder-activities/${activity.json().data.id}/media-assets`, headers, payload: mediaPayload })
  storage.verifyResult = 'mismatch'
  const { asset, upload } = created.json().data
  const finalized = await app.inject({
    method: 'POST', url: `/api/v1/media-assets/${asset.id}/upload-attempts/${upload.attemptId}/finalize`, headers, payload: {},
  })

  assert.equal(finalized.statusCode, 422)
  assert.equal(finalized.json().error.code, 'UPLOAD_VERIFICATION_FAILED')
  assert.equal(storage.deleteCalls, 1)
  await app.close()
})

test('retry retains the asset identity and rotates the provider object reference', async () => {
  const { app, repository, storage } = fixture()
  const headers = { cookie: 'recorder_session=valid', origin: allowedOrigin }
  const activity = await app.inject({
    method: 'POST', url: '/api/v1/recorder-activities', headers,
    payload: { operationType: 'packing', storageProvider: 's3' },
  })
  const created = await app.inject({
    method: 'POST', url: `/api/v1/recorder-activities/${activity.json().data.id}/media-assets`, headers, payload: mediaPayload,
  })
  const first = created.json().data
  const firstObjectRef = repository.targets.get(first.asset.id)?.providerObjectRef
  storage.verifyResult = 'mismatch'
  await app.inject({
    method: 'POST', url: `/api/v1/media-assets/${first.asset.id}/upload-attempts/${first.upload.attemptId}/finalize`,
    headers, payload: {},
  })

  const retried = await app.inject({
    method: 'POST', url: `/api/v1/media-assets/${first.asset.id}/upload-attempts`, headers, payload: {},
  })
  assert.equal(retried.statusCode, 201)
  assert.equal(retried.json().data.asset.id, first.asset.id)
  assert.notEqual(retried.json().data.upload.attemptId, first.upload.attemptId)
  assert.notEqual(repository.targets.get(first.asset.id)?.providerObjectRef, firstObjectRef)
  await app.close()
})

test('owner scoping hides another user media asset', async () => {
  const { app, repository } = fixture()
  const activity = await repository.createActivity(otherOwnerId, {
    notes: null, occurredAt: new Date().toISOString(), operationType: 'packing', reference: null, storageProvider: 's3',
  })
  const created = await repository.createAssetWithAttempt({
    activityId: activity.id, assetId: randomUUID(), assetInput: mediaPayload, attemptId: randomUUID(),
    expiresAt: '2026-09-03T09:00:00.000Z', ownerUserId: otherOwnerId, providerObjectRef: 'private-key', providerUploadRef: null,
  })
  const response = await app.inject({
    method: 'GET', url: `/api/v1/media-assets/${created!.id}/content`, headers: { cookie: 'recorder_session=valid' },
  })
  assert.equal(response.statusCode, 404)
  assert.equal(response.json().error.code, 'ASSET_NOT_FOUND')
  await app.close()
})

test('activity history is owner-scoped, filtered, sorted, and paginated', async () => {
  const { app, repository } = fixture()
  await repository.createActivity(ownerId, {
    notes: null, occurredAt: '2026-09-01T09:00:00.000Z', operationType: 'packing', reference: 'PACK-1', storageProvider: 's3',
  })
  const newest = await repository.createActivity(ownerId, {
    notes: null, occurredAt: '2026-09-02T09:00:00.000Z', operationType: 'unpacking', reference: 'UNPACK-1', storageProvider: 's3',
  })
  await repository.createActivity(otherOwnerId, {
    notes: null, occurredAt: '2026-09-03T09:00:00.000Z', operationType: 'unpacking', reference: 'PRIVATE', storageProvider: 's3',
  })

  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/recorder-activities?operationType=unpacking&page=1&pageSize=1&sortDirection=desc',
    headers: { cookie: 'recorder_session=valid' },
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json().data.map((activity: RecorderActivity) => activity.id), [newest.id])
  assert.deepEqual(response.json().meta, { page: 1, pageSize: 1, totalPages: 1, totalRecords: 1 })
  assert.equal(response.json().data[0].ownerUserId, undefined)
  await app.close()
})

test('activity detail includes ordered assets and hides another owner activity', async () => {
  const { app, repository } = fixture()
  const activity = await repository.createActivity(ownerId, {
    notes: 'Seal evidence', occurredAt: '2026-09-02T09:00:00.000Z', operationType: 'packing', reference: 'PACK-2', storageProvider: 's3',
  })
  const created = await repository.createAssetWithAttempt({
    activityId: activity.id, assetId: randomUUID(), assetInput: mediaPayload, attemptId: randomUUID(),
    expiresAt: '2026-09-03T09:00:00.000Z', ownerUserId: ownerId, providerObjectRef: 'private-object', providerUploadRef: null,
  })
  const detail = await app.inject({
    method: 'GET', url: `/api/v1/recorder-activities/${activity.id}`, headers: { cookie: 'recorder_session=valid' },
  })
  assert.equal(detail.statusCode, 200)
  assert.equal(detail.json().data.assets[0].id, created!.id)
  assert.equal(detail.json().data.assets[0].storageProvider, undefined)
  assert.doesNotMatch(detail.body, /ownerUserId|private-object/)

  const privateActivity = await repository.createActivity(otherOwnerId, {
    notes: null, occurredAt: '2026-09-02T10:00:00.000Z', operationType: 'packing', reference: null, storageProvider: 's3',
  })
  const hidden = await app.inject({
    method: 'GET', url: `/api/v1/recorder-activities/${privateActivity.id}`, headers: { cookie: 'recorder_session=valid' },
  })
  assert.equal(hidden.statusCode, 404)
  assert.equal(hidden.json().error.code, 'ACTIVITY_NOT_FOUND')
  await app.close()
})

test('activity history validates date ranges and requires authentication', async () => {
  const { app } = fixture()
  const unauthenticated = await app.inject({ method: 'GET', url: '/api/v1/recorder-activities' })
  assert.equal(unauthenticated.statusCode, 401)
  const invalid = await app.inject({
    method: 'GET',
    url: '/api/v1/recorder-activities?occurredFrom=2026-09-03T00%3A00%3A00.000Z&occurredTo=2026-09-02T00%3A00%3A00.000Z',
    headers: { cookie: 'recorder_session=valid' },
  })
  assert.equal(invalid.statusCode, 400)
  assert.equal(invalid.json().error.code, 'VALIDATION_ERROR')
  await app.close()
})

test('owner can correct metadata and inspect its append-only audit event', async () => {
  const { app } = fixture()
  const headers = { cookie: 'recorder_session=valid', origin: allowedOrigin }
  const created = await app.inject({
    method: 'POST', url: '/api/v1/recorder-activities', headers,
    payload: { operationType: 'packing', reference: 'WRONG', storageProvider: 's3' },
  })
  const activityId = created.json().data.id as string
  const updated = await app.inject({
    method: 'PATCH', url: `/api/v1/recorder-activities/${activityId}`, headers,
    payload: { operationType: 'unpacking', notes: 'Corrected after review', reference: null },
  })
  assert.equal(updated.statusCode, 200)
  assert.equal(updated.json().data.operationType, 'unpacking')
  assert.equal(updated.json().data.reference, null)

  const audit = await app.inject({
    method: 'GET', url: `/api/v1/recorder-activities/${activityId}/audit-events`, headers: { cookie: headers.cookie },
  })
  assert.equal(audit.statusCode, 200)
  assert.equal(audit.json().data[0].action, 'metadata_updated')
  assert.equal(audit.json().data[0].before.reference, 'WRONG')
  assert.equal(audit.json().data[0].after.reference, null)
  assert.doesNotMatch(audit.body, /providerObjectRef|ownerUserId/)
  await app.close()
})

test('owner can cancel unfinished activity and retry failed provider cleanup', async () => {
  const { app, storage } = fixture()
  const headers = { cookie: 'recorder_session=valid', origin: allowedOrigin }
  const created = await app.inject({
    method: 'POST', url: '/api/v1/recorder-activities', headers,
    payload: { operationType: 'packing', storageProvider: 's3' },
  })
  const activityId = created.json().data.id as string
  await app.inject({ method: 'POST', url: `/api/v1/recorder-activities/${activityId}/media-assets`, headers, payload: mediaPayload })
  storage.cleanupFails = true
  const cancelled = await app.inject({ method: 'POST', url: `/api/v1/recorder-activities/${activityId}/cancel`, headers, payload: {} })
  assert.equal(cancelled.statusCode, 200)
  assert.equal(cancelled.json().data.activity.status, 'cancelled')
  assert.equal(cancelled.json().data.cleanupPending, 1)

  storage.cleanupFails = false
  const retried = await app.inject({ method: 'POST', url: `/api/v1/recorder-activities/${activityId}/cleanup-retry`, headers, payload: {} })
  assert.equal(retried.statusCode, 200)
  assert.equal(retried.json().data.cleanupPending, 0)
  await app.close()
})

test('completed activity deletion is confirmed by method, hidden immediately, and cleans exact evidence', async () => {
  const { app, storage } = fixture()
  const headers = { cookie: 'recorder_session=valid', origin: allowedOrigin }
  const created = await app.inject({
    method: 'POST', url: '/api/v1/recorder-activities', headers,
    payload: { operationType: 'packing', storageProvider: 's3' },
  })
  const activityId = created.json().data.id as string
  const asset = await app.inject({ method: 'POST', url: `/api/v1/recorder-activities/${activityId}/media-assets`, headers, payload: mediaPayload })
  const media = asset.json().data
  await app.inject({ method: 'POST', url: `/api/v1/media-assets/${media.asset.id}/upload-attempts/${media.upload.attemptId}/finalize`, headers, payload: {} })
  await app.inject({ method: 'POST', url: `/api/v1/recorder-activities/${activityId}/complete`, headers, payload: {} })

  const deleted = await app.inject({ method: 'DELETE', url: `/api/v1/recorder-activities/${activityId}`, headers })
  assert.equal(deleted.statusCode, 202)
  assert.equal(deleted.json().data.cleanupPending, 0)
  assert.ok(storage.deleteCalls >= 1)
  const hidden = await app.inject({ method: 'GET', url: `/api/v1/recorder-activities/${activityId}`, headers: { cookie: headers.cookie } })
  assert.equal(hidden.statusCode, 404)
  const list = await app.inject({ method: 'GET', url: '/api/v1/recorder-activities', headers: { cookie: headers.cookie } })
  assert.equal(list.json().data.length, 0)
  await app.close()
})


test('reference search trims, matches literal substrings across pages, combines filters and isolates owners', async () => {
  const { app, repository } = fixture()
  const base = { notes: null, occurredAt: '2026-09-01T00:00:00.000Z', operationType: 'packing' as const, storageProvider: 's3' as const }
  try {
    const first = await repository.createActivity(ownerId, { ...base, reference: 'ORDER-ABC-1' })
    await repository.createActivity(ownerId, { ...base, reference: 'order-abc-2', occurredAt: '2026-09-02T00:00:00.000Z' })
    await repository.createActivity(ownerId, { ...base, reference: 'order-abc-3', operationType: 'unpacking' })
    await repository.createActivity(otherOwnerId, { ...base, reference: 'order-abc-private' })
    const literal = await repository.createActivity(ownerId, { ...base, reference: '100%_SPECIAL' })
    const headers = { cookie: 'recorder_session=valid' }
    const response = await app.inject({ url: '/api/v1/recorder-activities?reference=%20ABC%20&operationType=packing&pageSize=1&page=2', headers })
    assert.equal(response.statusCode, 200)
    assert.equal(response.json().meta.totalRecords, 2)
    assert.equal(response.json().meta.totalPages, 2)
    assert.equal(response.json().data[0].id, first.id)
    assert.equal(response.json().data[0].reference, 'ORDER-ABC-1')
    const special = await app.inject({ url: '/api/v1/recorder-activities?reference=%25_', headers })
    assert.deepEqual(special.json().data.map((row: RecorderActivity) => row.id), [literal.id])
    assert.equal((await app.inject({ url: '/api/v1/recorder-activities?reference=private', headers })).json().meta.totalRecords, 0)
    const cancelled = await app.inject({ url: '/api/v1/recorder-activities?reference=abc&status=cancelled', headers })
    assert.equal(cancelled.statusCode, 200)
    assert.equal(cancelled.json().meta.totalRecords, 0)
    assert.equal((await app.inject({ url: '/api/v1/recorder-activities?reference=%20%20', headers })).json().meta.totalRecords, 4)
    for (const query of ['reference=' + 'a'.repeat(161), 'reference=one&reference=two', 'reference=%00', 'reference=abc&pageSize=101']) {
      const invalid = await app.inject({ url: '/api/v1/recorder-activities?' + query, headers })
      assert.equal(invalid.statusCode, 400, query)
      assert.equal(invalid.json().error.code, 'VALIDATION_ERROR')
    }
    assert.equal((await app.inject('/api/v1/recorder-activities?reference=abc')).statusCode, 401)
  } finally { await app.close() }
})

test('comparison candidates use exact reference matching, remain owner-scoped, and never auto-pair records', async () => {
  const { app, repository } = fixture()
  const base = { notes: null, occurredAt: '2026-09-01T00:00:00.000Z', storageProvider: 's3' as const }
  const packing = await repository.createActivity(ownerId, { ...base, operationType: 'packing', reference: 'ORDER-SAME' })
  const newerPacking = await repository.createActivity(ownerId, { ...base, occurredAt: '2026-09-03T00:00:00.000Z', operationType: 'packing', reference: 'order-same' })
  const unpacking = await repository.createActivity(ownerId, { ...base, operationType: 'unpacking', reference: 'ORDER-SAME' })
  await repository.createActivity(ownerId, { ...base, operationType: 'unpacking', reference: 'ORDER-SAME-EXTRA' })
  await repository.createActivity(otherOwnerId, { ...base, operationType: 'packing', reference: 'ORDER-SAME' })
  const headers = { cookie: 'recorder_session=valid' }

  const response = await app.inject({ url: '/api/v1/recorder-activities/comparison-candidates?reference=%20OrDeR-SaMe%20', headers })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json().data.packing.map((activity: RecorderActivity) => activity.id), [newerPacking.id, packing.id])
  assert.deepEqual(response.json().data.unpacking.map((activity: RecorderActivity) => activity.id), [unpacking.id])
  assert.equal(response.json().data.truncated, false)
  assert.doesNotMatch(response.body, /ownerUserId|ORDER-SAME-EXTRA/)

  assert.equal((await app.inject('/api/v1/recorder-activities/comparison-candidates?reference=ORDER-SAME')).statusCode, 401)
  for (const query of ['', '%20%20', 'a'.repeat(161), 'A&reference=B']) {
    const invalid = await app.inject({ url: `/api/v1/recorder-activities/comparison-candidates?reference=${query}`, headers })
    assert.equal(invalid.statusCode, 400, query)
    assert.equal(invalid.json().error.code, 'VALIDATION_ERROR')
  }
  await app.close()
})

test('comparison candidates are bounded to the newest 50 records per side', async () => {
  const { app, repository } = fixture()
  for (let index = 0; index < 51; index += 1) {
    await repository.createActivity(ownerId, {
      notes: null, occurredAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(), operationType: 'packing', reference: 'MANY', storageProvider: 's3',
    })
    await repository.createActivity(ownerId, {
      notes: null, occurredAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(), operationType: 'unpacking', reference: 'MANY', storageProvider: 's3',
    })
  }
  const response = await app.inject({ url: '/api/v1/recorder-activities/comparison-candidates?reference=MANY', headers: { cookie: 'recorder_session=valid' } })
  assert.equal(response.statusCode, 200)
  assert.equal(response.json().data.packing.length, 50)
  assert.equal(response.json().data.unpacking.length, 50)
  assert.equal(response.json().data.truncated, true)
  await app.close()
})
