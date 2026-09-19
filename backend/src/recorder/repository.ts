import type { Pool, PoolClient } from 'pg'

import type {
  CreateMediaAssetInput,
  CreateRecorderActivityInput,
  ActivityAuditEvent,
  ListRecorderActivitiesInput,
  MediaAsset,
  OperationType,
  RecorderActivity,
  StorageProvider,
  UpdateRecorderActivityInput,
} from './domain.js'
import type { VerifiedStorageObject } from '../storage/types.js'

export interface UploadTarget {
  originalFilename?: string
  activityId: string
  assetId: string
  contentType: string
  ownerUserId: string
  providerObjectRef: string
  providerVersionRef: string | null
  sha256: string
  sizeBytes: number
  storageProvider: StorageProvider
}

export type BeginFinalizeResult =
  | { kind: 'expired' }
  | { asset: MediaAsset; kind: 'ready' }
  | { kind: 'started'; target: UploadTarget }

export interface CleanupTarget {
  cleanupId: string
  providerObjectRef: string
  providerVersionRef: string | null
  storageProvider: StorageProvider
}

export interface LifecycleMutationResult {
  cleanupTargets: CleanupTarget[]
}

export interface RecorderRepository {
  beginFinalize(ownerUserId: string, assetId: string, attemptId: string): Promise<BeginFinalizeResult | null>
  completeActivity(ownerUserId: string, activityId: string): Promise<RecorderActivity | null>
  cancelActivity(ownerUserId: string, activityId: string): Promise<LifecycleMutationResult | null>
  createActivity(ownerUserId: string, input: CreateRecorderActivityInput): Promise<RecorderActivity>
  createAssetWithAttempt(input: {
    activityId: string
    assetId: string
    assetInput: CreateMediaAssetInput
    attemptId: string
    expiresAt: string
    ownerUserId: string
    providerObjectRef: string
    providerUploadRef: string | null
  }): Promise<MediaAsset | null>
  createRetryAttempt(input: {
    assetId: string
    attemptId: string
    expiresAt: string
    ownerUserId: string
    providerObjectRef: string
    providerUploadRef: string | null
  }): Promise<MediaAsset | null>
  failFinalize(assetId: string, attemptId: string, failureCode: string): Promise<void>
  finishFinalize(assetId: string, attemptId: string, verified: VerifiedStorageObject): Promise<MediaAsset>
  getActivity(ownerUserId: string, activityId: string): Promise<RecorderActivity | null>
  getActivityWithAssets(ownerUserId: string, activityId: string): Promise<{ activity: RecorderActivity; assets: MediaAsset[] } | null>
  getAssetUploadTarget(ownerUserId: string, assetId: string): Promise<UploadTarget | null>
  getAssetRetryStatus(ownerUserId: string, assetId: string): Promise<'active' | 'ready' | 'retryable' | null>
  getReadyAsset(ownerUserId: string, assetId: string): Promise<UploadTarget | null>
  deleteActivity(ownerUserId: string, activityId: string): Promise<LifecycleMutationResult | null>
  finishCleanup(cleanupId: string, succeeded: boolean): Promise<void>
  listAuditEvents(ownerUserId: string, activityId: string): Promise<ActivityAuditEvent[] | null>
  listActivities(ownerUserId: string, input: ListRecorderActivitiesInput): Promise<{ activities: RecorderActivity[]; totalRecords: number }>
  listComparisonCandidates(ownerUserId: string, reference: string, operationType: OperationType, limit: number): Promise<RecorderActivity[]>
  releaseFinalize(assetId: string, attemptId: string): Promise<void>
  retryCleanup(ownerUserId: string, activityId: string): Promise<LifecycleMutationResult | null>
  updateActivity(ownerUserId: string, activityId: string, input: UpdateRecorderActivityInput): Promise<RecorderActivity | null>
}

interface ActivityRow {
  completed_at: Date | null
  created_at: Date
  id: string
  notes: string | null
  occurred_at: Date
  operation_type: RecorderActivity['operationType']
  owner_user_id: string
  reference: string | null
  status: RecorderActivity['status']
  storage_provider: RecorderActivity['storageProvider']
  updated_at: Date
}

interface AssetRow {
  activity_id: string
  created_at: Date
  declared_content_type: string
  expected_sha256: string
  expected_size_bytes: string
  id: string
  media_type: MediaAsset['mediaType']
  ordinal: number
  original_filename: string
  ready_at: Date | null
  status: MediaAsset['status']
  storage_provider: MediaAsset['storageProvider']
  updated_at: Date
  verified_content_type: string | null
  verified_sha256: string | null
  verified_size_bytes: string | null
}

interface UploadTargetRow {
  original_filename?: string
  activity_id: string
  declared_content_type: string
  expected_sha256: string
  expected_size_bytes: string
  id: string
  owner_user_id: string
  provider_object_ref: string
  provider_version_ref: string | null
  storage_provider: StorageProvider
}

function toActivity(row: ActivityRow): RecorderActivity {
  return {
    completedAt: row.completed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    id: row.id,
    notes: row.notes,
    occurredAt: row.occurred_at.toISOString(),
    operationType: row.operation_type,
    ownerUserId: row.owner_user_id,
    reference: row.reference,
    status: row.status,
    storageProvider: row.storage_provider,
    updatedAt: row.updated_at.toISOString(),
  }
}

function toAsset(row: AssetRow): MediaAsset {
  return {
    activityId: row.activity_id,
    contentType: row.verified_content_type ?? row.declared_content_type,
    createdAt: row.created_at.toISOString(),
    id: row.id,
    mediaType: row.media_type,
    ordinal: row.ordinal,
    originalFilename: row.original_filename,
    readyAt: row.ready_at?.toISOString() ?? null,
    sha256: row.verified_sha256 ?? row.expected_sha256,
    sizeBytes: Number(row.verified_size_bytes ?? row.expected_size_bytes),
    status: row.status,
    storageProvider: row.storage_provider,
    updatedAt: row.updated_at.toISOString(),
  }
}

function toUploadTarget(row: UploadTargetRow): UploadTarget {
  return {
    originalFilename: row.original_filename,
    activityId: row.activity_id,
    assetId: row.id,
    contentType: row.declared_content_type,
    ownerUserId: row.owner_user_id,
    providerObjectRef: row.provider_object_ref,
    providerVersionRef: row.provider_version_ref,
    sha256: row.expected_sha256,
    sizeBytes: Number(row.expected_size_bytes),
    storageProvider: row.storage_provider,
  }
}

async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

const activityColumns = `id, owner_user_id, operation_type, status, storage_provider, reference, notes,
  occurred_at, completed_at, created_at, updated_at`
const assetColumns = `id, activity_id, storage_provider, ordinal, media_type, status, original_filename,
  declared_content_type, verified_content_type, expected_size_bytes, verified_size_bytes,
  expected_sha256, verified_sha256, ready_at, created_at, updated_at`

function auditState(activity: RecorderActivity): Record<string, unknown> {
  const { ownerUserId: _ownerUserId, ...state } = activity
  return state
}

async function cleanupTargets(client: PoolClient, activityId: string): Promise<CleanupTarget[]> {
  const result = await client.query<{
    id: string; provider_object_ref: string; provider_version_ref: string | null; storage_provider: StorageProvider
  }>(`
    SELECT id, provider_object_ref, provider_version_ref, storage_provider
    FROM media_cleanup_jobs WHERE activity_id = $1 AND status = 'pending' ORDER BY created_at, id
  `, [activityId])
  return result.rows.map((row) => ({
    cleanupId: row.id,
    providerObjectRef: row.provider_object_ref,
    providerVersionRef: row.provider_version_ref,
    storageProvider: row.storage_provider,
  }))
}

export class PostgresRecorderRepository implements RecorderRepository {
  constructor(private readonly pool: Pool) {}

  async createActivity(ownerUserId: string, input: CreateRecorderActivityInput): Promise<RecorderActivity> {
    const result = await this.pool.query<ActivityRow>(`
      INSERT INTO recorder_activities
        (owner_user_id, operation_type, storage_provider, reference, notes, occurred_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING ${activityColumns}
    `, [ownerUserId, input.operationType, input.storageProvider, input.reference, input.notes, input.occurredAt])
    return toActivity(result.rows[0])
  }

  async getActivity(ownerUserId: string, activityId: string): Promise<RecorderActivity | null> {
    const result = await this.pool.query<ActivityRow>(`
      SELECT ${activityColumns} FROM recorder_activities
      WHERE id = $1 AND owner_user_id = $2 AND status <> 'deleted'
    `, [activityId, ownerUserId])
    return result.rows[0] ? toActivity(result.rows[0]) : null
  }

  async getActivityWithAssets(
    ownerUserId: string,
    activityId: string,
  ): Promise<{ activity: RecorderActivity; assets: MediaAsset[] } | null> {
    const activity = await this.getActivity(ownerUserId, activityId)
    if (!activity) return null
    const assets = await this.pool.query<AssetRow>(`
      SELECT ${assetColumns} FROM media_assets
      WHERE activity_id = $1
      ORDER BY ordinal ASC, id ASC
    `, [activityId])
    return { activity, assets: assets.rows.map(toAsset) }
  }

  async listActivities(
    ownerUserId: string,
    input: ListRecorderActivitiesInput,
  ): Promise<{ activities: RecorderActivity[]; totalRecords: number }> {
    const values: unknown[] = [ownerUserId]
    const conditions = ["owner_user_id = $1", "status <> 'deleted'"]
    const add = (condition: string, value: unknown) => {
      values.push(value)
      conditions.push(condition.replace('?', `$${values.length}`))
    }
    if (input.reference) add('strpos(lower(reference), lower(?::text)) > 0', input.reference)
    if (input.operationType) add('operation_type = ?', input.operationType)
    if (input.status) add('status = ?', input.status)
    if (input.storageProvider) add('storage_provider = ?', input.storageProvider)
    if (input.occurredFrom) add('occurred_at >= ?', input.occurredFrom)
    if (input.occurredTo) add('occurred_at <= ?', input.occurredTo)
    const where = conditions.join(' AND ')
    const count = await this.pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM recorder_activities WHERE ${where}`,
      values,
    )
    values.push(input.pageSize, (input.page - 1) * input.pageSize)
    const direction = input.sortDirection === 'asc' ? 'ASC' : 'DESC'
    const rows = await this.pool.query<ActivityRow>(`
      SELECT ${activityColumns} FROM recorder_activities
      WHERE ${where}
      ORDER BY occurred_at ${direction}, id ${direction}
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `, values)
    return { activities: rows.rows.map(toActivity), totalRecords: Number(count.rows[0].total) }
  }

  async listComparisonCandidates(ownerUserId: string, reference: string, operationType: OperationType, limit: number): Promise<RecorderActivity[]> {
    const result = await this.pool.query<ActivityRow>(`
      SELECT ${activityColumns} FROM recorder_activities
      WHERE owner_user_id = $1 AND status <> 'deleted' AND lower(reference) = lower($2) AND operation_type = $3
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
    `, [ownerUserId, reference, operationType, limit])
    return result.rows.map(toActivity)
  }

  async completeActivity(ownerUserId: string, activityId: string): Promise<RecorderActivity | null> {
    return transaction(this.pool, async (client) => {
      const activity = await client.query<ActivityRow>(`
        SELECT ${activityColumns} FROM recorder_activities
        WHERE id = $1 AND owner_user_id = $2 FOR UPDATE
      `, [activityId, ownerUserId])
      const current = activity.rows[0]
      if (!current) return null
      if (current.status === 'complete') return toActivity(current)
      if (current.status === 'cancelled') throw new Error('ACTIVITY_NOT_COMPLETABLE')

      const assets = await client.query<{ non_ready: string; total: string }>(`
        SELECT count(*)::text AS total,
               count(*) FILTER (WHERE status <> 'ready')::text AS non_ready
        FROM media_assets WHERE activity_id = $1
      `, [activityId])
      if (Number(assets.rows[0].total) < 1 || Number(assets.rows[0].non_ready) > 0) {
        throw new Error('ACTIVITY_NOT_COMPLETABLE')
      }

      const completed = await client.query<ActivityRow>(`
        UPDATE recorder_activities
        SET status = 'complete', completed_at = now(), updated_at = now()
        WHERE id = $1
        RETURNING ${activityColumns}
      `, [activityId])
      return toActivity(completed.rows[0])
    })
  }

  async updateActivity(
    ownerUserId: string,
    activityId: string,
    input: UpdateRecorderActivityInput,
  ): Promise<RecorderActivity | null> {
    return transaction(this.pool, async (client) => {
      const found = await client.query<ActivityRow>(`
        SELECT ${activityColumns} FROM recorder_activities
        WHERE id = $1 AND owner_user_id = $2 AND status <> 'deleted' FOR UPDATE
      `, [activityId, ownerUserId])
      if (!found.rows[0]) return null
      if (found.rows[0].status === 'cancelled') throw new Error('ACTIVITY_IMMUTABLE')
      const before = toActivity(found.rows[0])
      const updated = await client.query<ActivityRow>(`
        UPDATE recorder_activities SET
          operation_type = CASE WHEN $2 THEN $3 ELSE operation_type END,
          reference = CASE WHEN $4 THEN $5 ELSE reference END,
          notes = CASE WHEN $6 THEN $7 ELSE notes END,
          occurred_at = CASE WHEN $8 THEN $9::timestamptz ELSE occurred_at END,
          updated_at = now()
        WHERE id = $1 RETURNING ${activityColumns}
      `, [
        activityId,
        Object.hasOwn(input, 'operationType'), input.operationType ?? null,
        Object.hasOwn(input, 'reference'), input.reference ?? null,
        Object.hasOwn(input, 'notes'), input.notes ?? null,
        Object.hasOwn(input, 'occurredAt'), input.occurredAt ?? null,
      ])
      const after = toActivity(updated.rows[0])
      await client.query(`
        INSERT INTO recorder_activity_audit_events (activity_id, owner_user_id, action, before_state, after_state)
        VALUES ($1, $2, 'metadata_updated', $3::jsonb, $4::jsonb)
      `, [activityId, ownerUserId, JSON.stringify(auditState(before)), JSON.stringify(auditState(after))])
      return after
    })
  }

  async cancelActivity(ownerUserId: string, activityId: string): Promise<LifecycleMutationResult | null> {
    return transaction(this.pool, async (client) => {
      const found = await client.query<ActivityRow>(`
        SELECT ${activityColumns} FROM recorder_activities
        WHERE id = $1 AND owner_user_id = $2 AND status <> 'deleted' FOR UPDATE
      `, [activityId, ownerUserId])
      const current = found.rows[0]
      if (!current) return null
      if (current.status === 'complete') throw new Error('ACTIVITY_NOT_CANCELLABLE')
      if (current.status !== 'cancelled') {
        const before = toActivity(current)
        const changed = await client.query<ActivityRow>(`
          UPDATE recorder_activities
          SET status = 'cancelled', cancelled_at = now(), updated_at = now()
          WHERE id = $1 RETURNING ${activityColumns}
        `, [activityId])
        await client.query(`
          UPDATE media_upload_attempts SET status = 'expired', updated_at = now()
          WHERE asset_id IN (SELECT id FROM media_assets WHERE activity_id = $1)
            AND status IN ('issued', 'finalizing')
        `, [activityId])
        await client.query(`
          INSERT INTO media_cleanup_jobs
            (activity_id, asset_id, storage_provider, provider_object_ref, provider_version_ref)
          SELECT activity_id, id, storage_provider, provider_object_ref, provider_version_ref
          FROM media_assets WHERE activity_id = $1 AND provider_object_ref IS NOT NULL
          ON CONFLICT (activity_id, asset_id) DO NOTHING
        `, [activityId])
        await client.query(`
          INSERT INTO recorder_activity_audit_events (activity_id, owner_user_id, action, before_state, after_state)
          VALUES ($1, $2, 'cancelled', $3::jsonb, $4::jsonb)
        `, [activityId, ownerUserId, JSON.stringify(auditState(before)), JSON.stringify(auditState(toActivity(changed.rows[0])))])
      }
      return { cleanupTargets: await cleanupTargets(client, activityId) }
    })
  }

  async deleteActivity(ownerUserId: string, activityId: string): Promise<LifecycleMutationResult | null> {
    return transaction(this.pool, async (client) => {
      const found = await client.query<ActivityRow>(`
        SELECT ${activityColumns} FROM recorder_activities
        WHERE id = $1 AND owner_user_id = $2 FOR UPDATE
      `, [activityId, ownerUserId])
      const current = found.rows[0]
      if (!current) return null
      if (current.status !== 'complete' && current.status !== ('deleted' as RecorderActivity['status'])) {
        throw new Error('ACTIVITY_NOT_DELETABLE')
      }
      if (current.status !== ('deleted' as RecorderActivity['status'])) {
        const before = toActivity(current)
        await client.query(`UPDATE recorder_activities SET status = 'deleted', deleted_at = now(), updated_at = now() WHERE id = $1`, [activityId])
        await client.query(`
          INSERT INTO media_cleanup_jobs
            (activity_id, asset_id, storage_provider, provider_object_ref, provider_version_ref)
          SELECT activity_id, id, storage_provider, provider_object_ref, provider_version_ref
          FROM media_assets WHERE activity_id = $1 AND provider_object_ref IS NOT NULL
          ON CONFLICT (activity_id, asset_id) DO NOTHING
        `, [activityId])
        await client.query(`
          INSERT INTO recorder_activity_audit_events (activity_id, owner_user_id, action, before_state, after_state)
          VALUES ($1, $2, 'deleted', $3::jsonb, $4::jsonb)
        `, [activityId, ownerUserId, JSON.stringify(auditState(before)), JSON.stringify({ status: 'deleted' })])
      }
      return { cleanupTargets: await cleanupTargets(client, activityId) }
    })
  }

  async retryCleanup(ownerUserId: string, activityId: string): Promise<LifecycleMutationResult | null> {
    return transaction(this.pool, async (client) => {
      const found = await client.query<{ id: string }>(`
        SELECT id FROM recorder_activities
        WHERE id = $1 AND owner_user_id = $2 AND status IN ('cancelled', 'deleted') FOR UPDATE
      `, [activityId, ownerUserId])
      if (!found.rows[0]) return null
      await client.query(`
        INSERT INTO recorder_activity_audit_events (activity_id, owner_user_id, action, after_state)
        VALUES ($1, $2, 'cleanup_retried', jsonb_build_object('pendingJobs',
          (SELECT count(*) FROM media_cleanup_jobs WHERE activity_id = $1 AND status = 'pending')))
      `, [activityId, ownerUserId])
      return { cleanupTargets: await cleanupTargets(client, activityId) }
    })
  }

  async finishCleanup(cleanupId: string, succeeded: boolean): Promise<void> {
    await this.pool.query(`
      UPDATE media_cleanup_jobs SET status = CASE WHEN $2 THEN 'succeeded' ELSE 'pending' END,
        attempt_count = attempt_count + 1,
        last_error_code = CASE WHEN $2 THEN NULL ELSE 'PROVIDER_UNAVAILABLE' END,
        updated_at = now()
      WHERE id = $1
    `, [cleanupId, succeeded])
  }

  async listAuditEvents(ownerUserId: string, activityId: string): Promise<ActivityAuditEvent[] | null> {
    const activity = await this.pool.query(`SELECT 1 FROM recorder_activities WHERE id = $1 AND owner_user_id = $2`, [activityId, ownerUserId])
    if (!activity.rows[0]) return null
    const result = await this.pool.query<{
      action: ActivityAuditEvent['action']; after_state: Record<string, unknown> | null
      before_state: Record<string, unknown> | null; created_at: Date; id: string
    }>(`
      SELECT id, action, before_state, after_state, created_at
      FROM recorder_activity_audit_events WHERE activity_id = $1 AND owner_user_id = $2
      ORDER BY created_at ASC, id ASC
    `, [activityId, ownerUserId])
    return result.rows.map((row) => ({
      action: row.action, after: row.after_state, before: row.before_state,
      createdAt: row.created_at.toISOString(), id: row.id,
    }))
  }

  async createAssetWithAttempt(input: {
    activityId: string; assetId: string; assetInput: CreateMediaAssetInput; attemptId: string; expiresAt: string
    ownerUserId: string; providerObjectRef: string; providerUploadRef: string | null
  }): Promise<MediaAsset | null> {
    return transaction(this.pool, async (client) => {
      const activity = await client.query<{ status: string; storage_provider: StorageProvider }>(`
        SELECT status, storage_provider FROM recorder_activities
        WHERE id = $1 AND owner_user_id = $2 FOR UPDATE
      `, [input.activityId, input.ownerUserId])
      const current = activity.rows[0]
      if (!current) return null
      if (current.status === 'complete') throw new Error('ACTIVITY_IMMUTABLE')
      if (current.status === 'cancelled') throw new Error('ACTIVITY_IMMUTABLE')

      const ordinal = await client.query<{ next_ordinal: number }>(`
        SELECT COALESCE(MAX(ordinal), 0)::integer + 1 AS next_ordinal FROM media_assets WHERE activity_id = $1
      `, [input.activityId])
      const asset = await client.query<AssetRow>(`
        INSERT INTO media_assets
          (id, activity_id, storage_provider, ordinal, media_type, original_filename, declared_content_type,
           expected_size_bytes, expected_sha256, provider_object_ref)
        VALUES ($1, $2, $10, $3, $4, $5, $6, $7, $8, $9)
        RETURNING ${assetColumns}
      `, [
        input.assetId, input.activityId, ordinal.rows[0].next_ordinal, input.assetInput.mediaType,
        input.assetInput.originalFilename, input.assetInput.contentType, input.assetInput.sizeBytes,
        input.assetInput.sha256, input.providerObjectRef, current.storage_provider,
      ])
      await client.query(`
        INSERT INTO media_upload_attempts
          (id, asset_id, attempt_number, provider_upload_ref, expires_at)
        VALUES ($1, $2, 1, $3, $4)
      `, [input.attemptId, input.assetId, input.providerUploadRef, input.expiresAt])
      await client.query(`
        UPDATE recorder_activities SET status = 'uploading', updated_at = now() WHERE id = $1
      `, [input.activityId])
      return toAsset(asset.rows[0])
    })
  }

  async getAssetUploadTarget(ownerUserId: string, assetId: string): Promise<UploadTarget | null> {
    const result = await this.pool.query<UploadTargetRow>(`
      SELECT a.id, a.activity_id, a.storage_provider, a.declared_content_type, a.expected_size_bytes, a.original_filename,
             a.expected_sha256, a.provider_object_ref, a.provider_version_ref, r.owner_user_id
      FROM media_assets a
      JOIN recorder_activities r ON r.id = a.activity_id
      WHERE a.id = $1 AND r.owner_user_id = $2 AND r.status NOT IN ('cancelled', 'deleted')
    `, [assetId, ownerUserId])
    return result.rows[0] ? toUploadTarget(result.rows[0]) : null
  }

  async getAssetRetryStatus(ownerUserId: string, assetId: string): Promise<'active' | 'ready' | 'retryable' | null> {
    const result = await this.pool.query<{ active: boolean; status: MediaAsset['status'] }>(`
      SELECT a.status, EXISTS (
        SELECT 1 FROM media_upload_attempts u
        WHERE u.asset_id = a.id AND u.status IN ('issued', 'finalizing')
      ) AS active
      FROM media_assets a JOIN recorder_activities r ON r.id = a.activity_id
      WHERE a.id = $1 AND r.owner_user_id = $2 AND r.status NOT IN ('cancelled', 'deleted')
    `, [assetId, ownerUserId])
    const row = result.rows[0]
    if (!row) return null
    if (row.status === 'ready') return 'ready'
    return row.active ? 'active' : 'retryable'
  }

  async createRetryAttempt(input: {
    assetId: string; attemptId: string; expiresAt: string; ownerUserId: string; providerUploadRef: string | null
    providerObjectRef: string
  }): Promise<MediaAsset | null> {
    return transaction(this.pool, async (client) => {
      const result = await client.query<AssetRow & { owner_user_id: string }>(`
        SELECT ${assetColumns.split(',').map((column) => `a.${column.trim()}`).join(', ')}, r.owner_user_id
        FROM media_assets a JOIN recorder_activities r ON r.id = a.activity_id
        WHERE a.id = $1 AND r.owner_user_id = $2 AND r.status NOT IN ('cancelled', 'deleted') FOR UPDATE OF a
      `, [input.assetId, input.ownerUserId])
      const asset = result.rows[0]
      if (!asset) return null
      if (asset.status === 'ready') throw new Error('ASSET_ALREADY_READY')

      await client.query(`
        UPDATE media_upload_attempts SET status = 'expired', updated_at = now()
        WHERE asset_id = $1 AND status = 'issued' AND expires_at <= now()
      `, [input.assetId])
      const active = await client.query(`
        SELECT 1 FROM media_upload_attempts WHERE asset_id = $1 AND status IN ('issued', 'finalizing')
      `, [input.assetId])
      if (active.rowCount) throw new Error('UPLOAD_ALREADY_ACTIVE')

      const attemptNumber = await client.query<{ next_attempt: number }>(`
        SELECT COALESCE(MAX(attempt_number), 0)::integer + 1 AS next_attempt
        FROM media_upload_attempts WHERE asset_id = $1
      `, [input.assetId])
      await client.query(`
        INSERT INTO media_upload_attempts
          (id, asset_id, attempt_number, provider_upload_ref, expires_at)
        VALUES ($1, $2, $3, $4, $5)
      `, [input.attemptId, input.assetId, attemptNumber.rows[0].next_attempt, input.providerUploadRef, input.expiresAt])
      await client.query(`
        UPDATE media_assets
        SET status = 'pending_upload', provider_object_ref = $2, provider_version_ref = NULL,
            verified_content_type = NULL, verified_size_bytes = NULL, verified_sha256 = NULL,
            updated_at = now()
        WHERE id = $1
      `, [input.assetId, input.providerObjectRef])
      return toAsset({ ...asset, status: 'pending_upload', updated_at: new Date() })
    })
  }

  async beginFinalize(ownerUserId: string, assetId: string, attemptId: string): Promise<BeginFinalizeResult | null> {
    return transaction(this.pool, async (client) => {
      const result = await client.query<UploadTargetRow & {
        asset_status: MediaAsset['status']; attempt_status: string; expires_at: Date
      }>(`
        SELECT a.id, a.activity_id, a.storage_provider, a.declared_content_type, a.expected_size_bytes, a.original_filename,
               a.expected_sha256, a.provider_object_ref, a.provider_version_ref, a.status AS asset_status, r.owner_user_id,
               u.status AS attempt_status, u.expires_at
        FROM media_assets a
        JOIN recorder_activities r ON r.id = a.activity_id
        JOIN media_upload_attempts u ON u.asset_id = a.id
        WHERE a.id = $1 AND u.id = $2 AND r.owner_user_id = $3 AND r.status NOT IN ('cancelled', 'deleted')
        FOR UPDATE OF a, u
      `, [assetId, attemptId, ownerUserId])
      const row = result.rows[0]
      if (!row) return null
      if (row.asset_status === 'ready' && row.attempt_status === 'succeeded') {
        const asset = await client.query<AssetRow>(`SELECT ${assetColumns} FROM media_assets WHERE id = $1`, [assetId])
        return { asset: toAsset(asset.rows[0]), kind: 'ready' }
      }
      if (row.expires_at.getTime() <= Date.now()) {
        await client.query(`UPDATE media_upload_attempts SET status = 'expired', updated_at = now() WHERE id = $1`, [attemptId])
        await client.query(`UPDATE media_assets SET status = 'failed', updated_at = now() WHERE id = $1`, [assetId])
        return { kind: 'expired' }
      }
      if (row.attempt_status !== 'issued') throw new Error('UPLOAD_ALREADY_ACTIVE')

      await client.query(`UPDATE media_upload_attempts SET status = 'finalizing', updated_at = now() WHERE id = $1`, [attemptId])
      await client.query(`UPDATE media_assets SET status = 'verifying', updated_at = now() WHERE id = $1`, [assetId])
      return { kind: 'started', target: toUploadTarget(row) }
    })
  }

  async finishFinalize(
    assetId: string,
    attemptId: string,
    verified: VerifiedStorageObject,
  ): Promise<MediaAsset> {
    return transaction(this.pool, async (client) => {
      await client.query(`
        UPDATE media_upload_attempts SET status = 'succeeded', failure_code = NULL, updated_at = now()
        WHERE id = $1 AND asset_id = $2 AND status = 'finalizing'
      `, [attemptId, assetId])
      const result = await client.query<AssetRow>(`
        UPDATE media_assets
        SET status = 'ready', verified_content_type = $2, verified_size_bytes = $3,
            verified_sha256 = $4, provider_version_ref = $5, ready_at = now(), updated_at = now()
        WHERE id = $1 AND status = 'verifying'
        RETURNING ${assetColumns}
      `, [assetId, verified.contentType, verified.sizeBytes, verified.sha256, verified.providerVersionRef])
      if (!result.rows[0]) throw new Error('FINALIZE_STATE_CONFLICT')
      return toAsset(result.rows[0])
    })
  }

  async failFinalize(assetId: string, attemptId: string, failureCode: string): Promise<void> {
    await transaction(this.pool, async (client) => {
      await client.query(`
        UPDATE media_upload_attempts SET status = 'failed', failure_code = $3, updated_at = now()
        WHERE id = $1 AND asset_id = $2 AND status = 'finalizing'
      `, [attemptId, assetId, failureCode])
      await client.query(`UPDATE media_assets SET status = 'failed', updated_at = now() WHERE id = $1`, [assetId])
    })
  }

  async releaseFinalize(assetId: string, attemptId: string): Promise<void> {
    await transaction(this.pool, async (client) => {
      await client.query(`
        UPDATE media_upload_attempts SET status = 'issued', updated_at = now()
        WHERE id = $1 AND asset_id = $2 AND status = 'finalizing'
      `, [attemptId, assetId])
      await client.query(`UPDATE media_assets SET status = 'pending_upload', updated_at = now() WHERE id = $1`, [assetId])
    })
  }

  async getReadyAsset(ownerUserId: string, assetId: string): Promise<UploadTarget | null> {
    const result = await this.pool.query<UploadTargetRow>(`
      SELECT a.id, a.activity_id, a.storage_provider, a.declared_content_type, a.expected_size_bytes, a.original_filename,
             a.expected_sha256, a.provider_object_ref, a.provider_version_ref, r.owner_user_id
      FROM media_assets a JOIN recorder_activities r ON r.id = a.activity_id
      WHERE a.id = $1 AND r.owner_user_id = $2 AND a.status = 'ready' AND r.status NOT IN ('cancelled', 'deleted')
    `, [assetId, ownerUserId])
    return result.rows[0] ? toUploadTarget(result.rows[0]) : null
  }
}
