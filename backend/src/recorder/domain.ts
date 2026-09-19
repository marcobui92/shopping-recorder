import { AppError } from '../errors.js'

export type ActivityStatus = 'draft' | 'uploading' | 'complete' | 'cancelled'
export type AssetStatus = 'pending_upload' | 'verifying' | 'ready' | 'failed'
export type MediaType = 'image' | 'video'
export type OperationType = 'packing' | 'unpacking'
export type StorageProvider = 's3' | 'google_drive'

export interface RecorderActivity {
  completedAt: string | null
  createdAt: string
  id: string
  notes: string | null
  occurredAt: string
  operationType: OperationType
  ownerUserId: string
  reference: string | null
  status: ActivityStatus
  storageProvider: StorageProvider
  updatedAt: string
}

export interface CreateRecorderActivityInput {
  notes: string | null
  occurredAt: string
  operationType: OperationType
  reference: string | null
  storageProvider: StorageProvider
}

export interface UpdateRecorderActivityInput {
  notes?: string | null
  occurredAt?: string
  operationType?: OperationType
  reference?: string | null
}

export interface ActivityAuditEvent {
  action: 'metadata_updated' | 'cancelled' | 'deleted' | 'cleanup_retried'
  after: Record<string, unknown> | null
  before: Record<string, unknown> | null
  createdAt: string
  id: string
}

export interface ListRecorderActivitiesInput {
  reference?: string
  occurredFrom?: string
  occurredTo?: string
  operationType?: OperationType
  page: number
  pageSize: number
  sortDirection: 'asc' | 'desc'
  status?: ActivityStatus
  storageProvider?: StorageProvider
}

export interface CompareRecorderActivitiesInput {
  reference: string
}

export interface MediaAsset {
  activityId: string
  contentType: string
  createdAt: string
  id: string
  mediaType: MediaType
  ordinal: number
  originalFilename: string
  readyAt: string | null
  sha256: string
  sizeBytes: number
  status: AssetStatus
  storageProvider: StorageProvider
  updatedAt: string
}

export interface CreateMediaAssetInput {
  contentType: string
  mediaType: MediaType
  originalFilename: string
  sha256: string
  sizeBytes: number
}

export interface UploadCapability {
  attemptId: string
  expiresAt: string
  headers: Record<string, string>
  method: 'PUT'
  strategy: 'direct' | 'server'
  url: string
}

function readOptionalString(value: unknown, name: string, maximumLength: number): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw new AppError(400, 'VALIDATION_ERROR', `${name} must be a string.`)
  const normalized = value.trim()
  if (!normalized) return null
  if (normalized.length > maximumLength) {
    throw new AppError(400, 'VALIDATION_ERROR', `${name} must be at most ${maximumLength} characters.`)
  }
  return normalized
}

function readRequiredString(value: unknown, name: string, maximumLength: number): string {
  const normalized = readOptionalString(value, name, maximumLength)
  if (!normalized) throw new AppError(400, 'VALIDATION_ERROR', `${name} is required.`)
  return normalized
}

function readObject(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(400, 'VALIDATION_ERROR', message)
  }
  return value as Record<string, unknown>
}

function readTimestamp(value: unknown): string {
  if (value === undefined || value === null || value === '') return new Date().toISOString()
  if (typeof value !== 'string') throw new AppError(400, 'VALIDATION_ERROR', 'occurredAt must be a timestamp.')
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new AppError(400, 'VALIDATION_ERROR', 'occurredAt must be a valid timestamp.')
  return parsed.toISOString()
}

function rejectUnknown(input: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(input).some((key) => !allowed.includes(key))) {
    throw new AppError(400, 'VALIDATION_ERROR', 'The request contains an unknown property.')
  }
}

function readOptionalTimestamp(value: unknown, name: string): string | undefined {
  if (value === undefined || value === '') return undefined
  if (typeof value !== 'string') throw new AppError(400, 'VALIDATION_ERROR', `${name} must be a timestamp.`)
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new AppError(400, 'VALIDATION_ERROR', `${name} must be a valid timestamp.`)
  return parsed.toISOString()
}

function readPositiveInteger(value: unknown, name: string, defaultValue: number, maximum: number): number {
  if (value === undefined || value === '') return defaultValue
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
  if (!Number.isSafeInteger(parsed) || (parsed as number) < 1 || (parsed as number) > maximum) {
    throw new AppError(400, 'VALIDATION_ERROR', `${name} must be an integer from 1 to ${maximum}.`)
  }
  return parsed as number
}

export function parseCreateRecorderActivityInput(value: unknown): CreateRecorderActivityInput {
  const input = readObject(value, 'A recorder activity object is required.')
  rejectUnknown(input, ['notes', 'occurredAt', 'operationType', 'reference', 'storageProvider'])
  if (input.operationType !== 'packing' && input.operationType !== 'unpacking') {
    throw new AppError(400, 'VALIDATION_ERROR', 'operationType must be packing or unpacking.')
  }
  if (input.storageProvider !== 's3' && input.storageProvider !== 'google_drive') {
    throw new AppError(400, 'VALIDATION_ERROR', 'storageProvider must be s3 or google_drive.')
  }

  return {
    notes: readOptionalString(input.notes, 'notes', 2_000),
    occurredAt: readTimestamp(input.occurredAt),
    operationType: input.operationType,
    reference: readOptionalString(input.reference, 'reference', 160),
    storageProvider: input.storageProvider,
  }
}

export function parseUpdateRecorderActivityInput(value: unknown): UpdateRecorderActivityInput {
  const input = readObject(value, 'A recorder activity update object is required.')
  rejectUnknown(input, ['notes', 'occurredAt', 'operationType', 'reference'])
  if (Object.keys(input).length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'At least one metadata field is required.')
  }
  if (input.operationType !== undefined && input.operationType !== 'packing' && input.operationType !== 'unpacking') {
    throw new AppError(400, 'VALIDATION_ERROR', 'operationType must be packing or unpacking.')
  }
  return {
    ...(Object.hasOwn(input, 'notes') ? { notes: readOptionalString(input.notes, 'notes', 2_000) } : {}),
    ...(Object.hasOwn(input, 'occurredAt') ? { occurredAt: readTimestamp(input.occurredAt) } : {}),
    ...(input.operationType !== undefined ? { operationType: input.operationType } : {}),
    ...(Object.hasOwn(input, 'reference') ? { reference: readOptionalString(input.reference, 'reference', 160) } : {}),
  }
}

export function parseCreateMediaAssetInput(value: unknown): CreateMediaAssetInput {
  const input = readObject(value, 'A media asset object is required.')
  if (input.mediaType !== 'image' && input.mediaType !== 'video') {
    throw new AppError(400, 'VALIDATION_ERROR', 'mediaType must be image or video.')
  }
  if (!Number.isSafeInteger(input.sizeBytes) || (input.sizeBytes as number) < 1) {
    throw new AppError(400, 'VALIDATION_ERROR', 'sizeBytes must be a positive safe integer.')
  }
  if (typeof input.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(input.sha256)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'sha256 must be 64 lowercase hexadecimal characters.')
  }

  return {
    contentType: readRequiredString(input.contentType, 'contentType', 127).toLowerCase(),
    mediaType: input.mediaType,
    originalFilename: readRequiredString(input.originalFilename, 'originalFilename', 255),
    sha256: input.sha256,
    sizeBytes: input.sizeBytes as number,
  }
}

export function parseListRecorderActivitiesInput(value: unknown): ListRecorderActivitiesInput {
  const input = readObject(value, 'Recorder activity query parameters are required.')
  if (input.reference !== undefined && (typeof input.reference !== 'string' || input.reference.length > 160 || input.reference.includes('\0'))) {
    throw new AppError(400, 'VALIDATION_ERROR', 'reference must be a string of at most 160 characters without NUL.')
  }
  const reference = typeof input.reference === 'string' ? input.reference.trim() || undefined : undefined
  const occurredFrom = readOptionalTimestamp(input.occurredFrom, 'occurredFrom')
  const occurredTo = readOptionalTimestamp(input.occurredTo, 'occurredTo')
  if (occurredFrom && occurredTo && occurredFrom > occurredTo) {
    throw new AppError(400, 'VALIDATION_ERROR', 'occurredFrom must not be after occurredTo.')
  }
  if (input.operationType !== undefined && input.operationType !== 'packing' && input.operationType !== 'unpacking') {
    throw new AppError(400, 'VALIDATION_ERROR', 'operationType must be packing or unpacking.')
  }
  if (input.status !== undefined && input.status !== 'draft' && input.status !== 'uploading' && input.status !== 'complete' && input.status !== 'cancelled') {
    throw new AppError(400, 'VALIDATION_ERROR', 'status must be draft, uploading, complete, or cancelled.')
  }
  if (input.storageProvider !== undefined && input.storageProvider !== 's3' && input.storageProvider !== 'google_drive') {
    throw new AppError(400, 'VALIDATION_ERROR', 'storageProvider must be s3 or google_drive.')
  }
  if (input.sortDirection !== undefined && input.sortDirection !== 'asc' && input.sortDirection !== 'desc') {
    throw new AppError(400, 'VALIDATION_ERROR', 'sortDirection must be asc or desc.')
  }

  return {
    reference,
    occurredFrom,
    occurredTo,
    operationType: input.operationType as OperationType | undefined,
    page: readPositiveInteger(input.page, 'page', 1, 1_000_000),
    pageSize: readPositiveInteger(input.pageSize, 'pageSize', 20, 100),
    sortDirection: (input.sortDirection ?? 'desc') as 'asc' | 'desc',
    status: input.status as ActivityStatus | undefined,
    storageProvider: input.storageProvider as StorageProvider | undefined,
  }
}

export function parseCompareRecorderActivitiesInput(value: unknown): CompareRecorderActivitiesInput {
  const input = readObject(value, 'Comparison query parameters are required.')
  rejectUnknown(input, ['reference'])
  if (typeof input.reference !== 'string' || input.reference.length > 160 || input.reference.includes('\0')) {
    throw new AppError(400, 'VALIDATION_ERROR', 'reference must be a string of at most 160 characters without NUL.')
  }
  const reference = input.reference.trim()
  if (!reference) throw new AppError(400, 'VALIDATION_ERROR', 'reference is required for comparison.')
  return { reference }
}
