import { randomUUID } from 'node:crypto'

import type { S3Config } from '../config.js'
import { AppError } from '../errors.js'
import type { MediaDownload, MediaStorageAdapter, StorageObjectInput } from '../storage/types.js'
import { StorageUnavailableError, StorageVerificationError } from '../storage/types.js'
import type {
  CreateMediaAssetInput,
  CreateRecorderActivityInput,
  ListRecorderActivitiesInput,
  MediaAsset,
  RecorderActivity,
  UpdateRecorderActivityInput,
} from './domain.js'
import type { CleanupTarget, RecorderRepository, UploadTarget } from './repository.js'

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
const videoTypes = new Set(['video/mp4', 'video/quicktime', 'video/webm'])

export type PublicRecorderActivity = Omit<RecorderActivity, 'ownerUserId'>
export type PublicMediaAsset = Omit<MediaAsset, 'storageProvider'>
export type PublicRecorderActivityDetail = PublicRecorderActivity & { assets: PublicMediaAsset[] }

function publicActivity(activity: RecorderActivity): PublicRecorderActivity {
  const { ownerUserId: _ownerUserId, ...result } = activity
  return result
}

function publicAsset(asset: MediaAsset): PublicMediaAsset {
  const { storageProvider: _storageProvider, ...result } = asset
  return result
}

function asStorageInput(target: UploadTarget): StorageObjectInput {
  return {
    activityId: target.activityId,
    assetId: target.assetId,
    contentType: target.contentType,
    ownerUserId: target.ownerUserId,
    sha256: target.sha256,
    sizeBytes: target.sizeBytes,
  }
}

function mapRepositoryConflict(error: unknown): never {
  if (error instanceof Error) {
    if (error.message === 'ACTIVITY_IMMUTABLE') {
      throw new AppError(409, 'ACTIVITY_IMMUTABLE', 'The completed activity cannot be changed.')
    }
    if (error.message === 'ASSET_ALREADY_READY') {
      throw new AppError(409, 'ASSET_ALREADY_READY', 'The media asset is already ready.')
    }
    if (error.message === 'UPLOAD_ALREADY_ACTIVE') {
      throw new AppError(409, 'UPLOAD_ALREADY_ACTIVE', 'The media asset already has an active upload attempt.')
    }
    if (error.message === 'ACTIVITY_NOT_COMPLETABLE') {
      throw new AppError(409, 'ACTIVITY_NOT_COMPLETABLE', 'The activity requires at least one ready media asset and no unfinished assets.')
    }
    if (error.message === 'ACTIVITY_NOT_CANCELLABLE') {
      throw new AppError(409, 'ACTIVITY_NOT_CANCELLABLE', 'A completed activity cannot be cancelled.')
    }
    if (error.message === 'ACTIVITY_NOT_DELETABLE') {
      throw new AppError(409, 'ACTIVITY_NOT_DELETABLE', 'Only a completed activity can be deleted.')
    }
  }
  throw error
}

export class RecorderMediaService {
  private readonly adapters = new Map<string, MediaStorageAdapter>()

  constructor(
    private readonly repository: RecorderRepository,
    adapters: MediaStorageAdapter[],
    private readonly s3Config?: S3Config,
  ) {
    for (const adapter of adapters) this.adapters.set(adapter.provider, adapter)
  }

  private adapter(provider: string): MediaStorageAdapter {
    const adapter = this.adapters.get(provider)
    if (!adapter) {
      throw new AppError(409, 'STORAGE_PROVIDER_NOT_AVAILABLE', 'The selected storage provider is not available.')
    }
    return adapter
  }

  async createActivity(ownerUserId: string, input: CreateRecorderActivityInput): Promise<PublicRecorderActivity> {
    try { await this.adapter(input.storageProvider).assertAvailable?.(ownerUserId) }
    catch (error) { if (error instanceof StorageUnavailableError) throw new AppError(409, 'STORAGE_PROVIDER_NOT_AVAILABLE', 'Connect the selected storage provider first.'); throw error }
    return publicActivity(await this.repository.createActivity(ownerUserId, input))
  }

  async getActivity(ownerUserId: string, activityId: string): Promise<PublicRecorderActivityDetail> {
    const result = await this.repository.getActivityWithAssets(ownerUserId, activityId)
    if (!result) throw new AppError(404, 'ACTIVITY_NOT_FOUND', 'The recorder activity does not exist.')
    return { ...publicActivity(result.activity), assets: result.assets.map(publicAsset) }
  }

  async listActivities(
    ownerUserId: string,
    input: ListRecorderActivitiesInput,
  ): Promise<{ activities: PublicRecorderActivity[]; totalRecords: number }> {
    const result = await this.repository.listActivities(ownerUserId, input)
    return { activities: result.activities.map(publicActivity), totalRecords: result.totalRecords }
  }

  async listComparisonCandidates(ownerUserId: string, reference: string): Promise<{
    packing: PublicRecorderActivity[]
    unpacking: PublicRecorderActivity[]
    truncated: boolean
  }> {
    const maximumPerSide = 50
    const [packing, unpacking] = await Promise.all([
      this.repository.listComparisonCandidates(ownerUserId, reference, 'packing', maximumPerSide + 1),
      this.repository.listComparisonCandidates(ownerUserId, reference, 'unpacking', maximumPerSide + 1),
    ])
    return {
      packing: packing.slice(0, maximumPerSide).map(publicActivity),
      unpacking: unpacking.slice(0, maximumPerSide).map(publicActivity),
      truncated: packing.length > maximumPerSide || unpacking.length > maximumPerSide,
    }
  }

  async completeActivity(ownerUserId: string, activityId: string): Promise<PublicRecorderActivity> {
    try {
      const activity = await this.repository.completeActivity(ownerUserId, activityId)
      if (!activity) throw new AppError(404, 'ACTIVITY_NOT_FOUND', 'The recorder activity does not exist.')
      return publicActivity(activity)
    } catch (error) {
      mapRepositoryConflict(error)
    }
  }

  async updateActivity(
    ownerUserId: string,
    activityId: string,
    input: UpdateRecorderActivityInput,
  ): Promise<PublicRecorderActivity> {
    try {
      const activity = await this.repository.updateActivity(ownerUserId, activityId, input)
      if (!activity) throw new AppError(404, 'ACTIVITY_NOT_FOUND', 'The recorder activity does not exist.')
      return publicActivity(activity)
    } catch (error) {
      mapRepositoryConflict(error)
    }
  }

  private async cleanup(targets: CleanupTarget[]): Promise<number> {
    let pending = 0
    for (const target of targets) {
      try {
        await this.adapter(target.storageProvider).deleteObject(target.providerObjectRef, target.providerVersionRef)
        await this.repository.finishCleanup(target.cleanupId, true)
      } catch {
        pending += 1
        await this.repository.finishCleanup(target.cleanupId, false)
      }
    }
    return pending
  }

  async runRetentionSweep(limit = 100): Promise<{ cleanupPending: number; expiredActivities: number }> {
    const result = await this.repository.expireDueActivities(limit)
    return {
      cleanupPending: await this.cleanup(result.cleanupTargets),
      expiredActivities: result.expiredActivities,
    }
  }

  async cancelActivity(ownerUserId: string, activityId: string): Promise<{ activity: PublicRecorderActivity; cleanupPending: number }> {
    try {
      const result = await this.repository.cancelActivity(ownerUserId, activityId)
      if (!result) throw new AppError(404, 'ACTIVITY_NOT_FOUND', 'The recorder activity does not exist.')
      const cleanupPending = await this.cleanup(result.cleanupTargets)
      const activity = await this.repository.getActivity(ownerUserId, activityId)
      if (!activity) throw new AppError(404, 'ACTIVITY_NOT_FOUND', 'The recorder activity does not exist.')
      return { activity: publicActivity(activity), cleanupPending }
    } catch (error) {
      mapRepositoryConflict(error)
    }
  }

  async deleteActivity(ownerUserId: string, activityId: string): Promise<{ cleanupPending: number }> {
    try {
      const result = await this.repository.deleteActivity(ownerUserId, activityId)
      if (!result) throw new AppError(404, 'ACTIVITY_NOT_FOUND', 'The recorder activity does not exist.')
      return { cleanupPending: await this.cleanup(result.cleanupTargets) }
    } catch (error) {
      mapRepositoryConflict(error)
    }
  }

  async retryCleanup(ownerUserId: string, activityId: string): Promise<{ cleanupPending: number }> {
    const result = await this.repository.retryCleanup(ownerUserId, activityId)
    if (!result) throw new AppError(404, 'ACTIVITY_NOT_FOUND', 'The recorder activity does not exist.')
    return { cleanupPending: await this.cleanup(result.cleanupTargets) }
  }

  async discardAsset(ownerUserId: string, assetId: string): Promise<{ cleanupPending: number }> {
    try {
      const result = await this.repository.discardAsset(ownerUserId, assetId)
      if (!result) throw new AppError(404, 'ASSET_NOT_FOUND', 'The media asset does not exist.')
      return { cleanupPending: await this.cleanup(result.cleanupTargets) }
    } catch (error) {
      mapRepositoryConflict(error)
    }
  }

  async listAuditEvents(ownerUserId: string, activityId: string) {
    const events = await this.repository.listAuditEvents(ownerUserId, activityId)
    if (!events) throw new AppError(404, 'ACTIVITY_NOT_FOUND', 'The recorder activity does not exist.')
    return events
  }

  private validateMedia(input: CreateMediaAssetInput): void {
    const allowed = input.mediaType === 'image' ? imageTypes : videoTypes
    if (!allowed.has(input.contentType)) {
      throw new AppError(400, 'VALIDATION_ERROR', `contentType is not an allowed ${input.mediaType} type.`)
    }
    const maximum = input.mediaType === 'image' ? (this.s3Config?.maxImageBytes ?? 25 * 1024 * 1024) : (this.s3Config?.maxVideoBytes ?? 500 * 1024 * 1024)
    if (input.sizeBytes > maximum) {
      throw new AppError(400, 'VALIDATION_ERROR', `${input.mediaType} size exceeds the configured limit.`)
    }
  }

  private async issueUpload(adapter: MediaStorageAdapter, input: StorageObjectInput, attemptId: string) {
    try { return await adapter.issueUpload(input, attemptId) }
    catch (error) {
      if (error instanceof StorageUnavailableError) throw new AppError(503, 'STORAGE_PROVIDER_UNAVAILABLE', 'The storage provider is temporarily unavailable.')
      throw error
    }
  }

  async createAsset(
    ownerUserId: string,
    activityId: string,
    input: CreateMediaAssetInput,
  ): Promise<{ asset: PublicMediaAsset; upload: import('./domain.js').UploadCapability }> {
    this.validateMedia(input)
    const activity = await this.repository.getActivity(ownerUserId, activityId)
    if (!activity) throw new AppError(404, 'ACTIVITY_NOT_FOUND', 'The recorder activity does not exist.')
    if (activity.status === 'complete' || activity.status === 'cancelled') {
      throw new AppError(409, 'ACTIVITY_IMMUTABLE', 'The activity cannot accept new evidence.')
    }

    const adapter = this.adapter(activity.storageProvider)
    const assetId = randomUUID()
    const attemptId = randomUUID()
    const storageInput: StorageObjectInput = {
      activityId,
      assetId,
      contentType: input.contentType,
      ownerUserId,
      sha256: input.sha256,
      sizeBytes: input.sizeBytes,
    }
    const issued = await this.issueUpload(adapter, storageInput, attemptId)
    try {
      const asset = await this.repository.createAssetWithAttempt({
        activityId,
        assetId,
        assetInput: input,
        attemptId,
        expiresAt: issued.capability.expiresAt,
        ownerUserId,
        providerObjectRef: issued.providerObjectRef,
        providerUploadRef: issued.providerUploadRef,
      })
      if (!asset) throw new AppError(404, 'ACTIVITY_NOT_FOUND', 'The recorder activity does not exist.')
      return { asset: publicAsset(asset), upload: issued.capability }
    } catch (error) {
      mapRepositoryConflict(error)
    }
  }

  async retryAsset(
    ownerUserId: string,
    assetId: string,
  ): Promise<{ asset: PublicMediaAsset; upload: import('./domain.js').UploadCapability }> {
    const retryStatus = await this.repository.getAssetRetryStatus(ownerUserId, assetId)
    if (!retryStatus) throw new AppError(404, 'ASSET_NOT_FOUND', 'The media asset does not exist.')
    if (retryStatus === 'ready') throw new AppError(409, 'ASSET_ALREADY_READY', 'The media asset is already ready.')
    if (retryStatus === 'active') {
      throw new AppError(409, 'UPLOAD_ALREADY_ACTIVE', 'The media asset already has an active upload attempt.')
    }
    const target = await this.repository.getAssetUploadTarget(ownerUserId, assetId)
    if (!target) throw new AppError(404, 'ASSET_NOT_FOUND', 'The media asset does not exist.')
    const adapter = this.adapter(target.storageProvider)
    const attemptId = randomUUID()
    const issued = await this.issueUpload(adapter, asStorageInput(target), attemptId)
    try {
      const asset = await this.repository.createRetryAttempt({
        assetId,
        attemptId,
        expiresAt: issued.capability.expiresAt,
        ownerUserId,
        providerObjectRef: issued.providerObjectRef,
        providerUploadRef: issued.providerUploadRef,
      })
      if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'The media asset does not exist.')
      return { asset: publicAsset(asset), upload: issued.capability }
    } catch (error) {
      mapRepositoryConflict(error)
    }
  }

  async finalizeAsset(ownerUserId: string, assetId: string, attemptId: string): Promise<PublicMediaAsset> {
    let begin
    try {
      begin = await this.repository.beginFinalize(ownerUserId, assetId, attemptId)
    } catch (error) {
      mapRepositoryConflict(error)
    }
    if (!begin) throw new AppError(404, 'ASSET_NOT_FOUND', 'The media asset does not exist.')
    if (begin.kind === 'ready') return publicAsset(begin.asset)
    if (begin.kind === 'expired') throw new AppError(410, 'UPLOAD_EXPIRED', 'The upload capability has expired.')

    const adapter = this.adapter(begin.target.storageProvider)
    try {
      const verified = await adapter.verify(begin.target.providerObjectRef, asStorageInput(begin.target))
      return publicAsset(await this.repository.finishFinalize(assetId, attemptId, verified))
    } catch (error) {
      if (error instanceof StorageVerificationError) {
        await this.repository.failFinalize(assetId, attemptId, error.failureCode)
        await adapter.deleteUnverified(begin.target.providerObjectRef, error.providerVersionRef)
        throw new AppError(422, 'UPLOAD_VERIFICATION_FAILED', 'The uploaded media could not be verified.')
      }
      await this.repository.releaseFinalize(assetId, attemptId)
      if (error instanceof StorageUnavailableError) {
        throw new AppError(503, 'STORAGE_PROVIDER_UNAVAILABLE', 'The storage provider is temporarily unavailable.')
      }
      throw error
    }
  }

  async retrieveAsset(ownerUserId: string, assetId: string): Promise<MediaDownload> {
    const target = await this.repository.getReadyAsset(ownerUserId, assetId)
    if (!target) throw new AppError(404, 'ASSET_NOT_FOUND', 'The media asset does not exist.')
    try {
      const result = await this.adapter(target.storageProvider).issueDownload(target.providerObjectRef, target.providerVersionRef)
      if ('body' in result) result.filename = target.originalFilename
      return result
    } catch (error) {
      if (error instanceof StorageUnavailableError) {
        throw new AppError(503, 'STORAGE_PROVIDER_UNAVAILABLE', 'The storage provider is temporarily unavailable.')
      }
      throw error
    }
  }
}
