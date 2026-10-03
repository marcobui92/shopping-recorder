import { config } from './config'

interface ErrorPayload {
  error?: {
    code?: string
    message?: string
  }
}

export interface AppUser {
  email: string | null
  id: string
  username: string
}

export interface UserSettings { retentionDays: number }

export interface RecorderActivity {
  completedAt: string | null
  createdAt: string
  evidenceExpiresAt: string | null
  expiredAt: string | null
  id: string
  notes: string | null
  occurredAt: string
  operationType: 'packing' | 'unpacking'
  reference: string | null
  status: 'draft' | 'uploading' | 'complete' | 'expired' | 'cancelled'
  storageProvider: 's3' | 'google_drive'
  updatedAt: string
}

export interface RecorderActivityDetail extends RecorderActivity {
  assets: MediaAsset[]
}

export interface ListRecorderActivitiesInput {
  reference?: string
  occurredFrom?: string
  occurredTo?: string
  operationType?: 'packing' | 'unpacking'
  page?: number
  pageSize?: number
  sortDirection?: 'asc' | 'desc'
  status?: 'draft' | 'uploading' | 'complete' | 'expired' | 'cancelled'
  storageProvider?: 's3' | 'google_drive'
}

export interface RecorderActivityList {
  data: RecorderActivity[]
  meta: {
    page: number
    pageSize: number
    totalPages: number
    totalRecords: number
  }
}

export interface MediaAsset {
  activityId: string
  contentType: string
  createdAt: string
  id: string
  mediaType: 'image' | 'video'
  ordinal: number
  originalFilename: string
  readyAt: string | null
  sha256: string
  sizeBytes: number
  status: 'pending_upload' | 'verifying' | 'ready' | 'failed'
  updatedAt: string
}

export interface ActivityAuditEvent {
  action: 'metadata_updated' | 'cancelled' | 'deleted' | 'expired' | 'cleanup_retried'
  after: Record<string, unknown> | null
  before: Record<string, unknown> | null
  createdAt: string
  id: string
}

export interface UploadCapability {
  attemptId: string
  expiresAt: string
  headers: Record<string, string>
  method: 'PUT'
  strategy: 'direct' | 'server'
  url: string
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function readError(response: Response): Promise<ApiError> {
  const payload = await response.json().catch(() => ({})) as ErrorPayload
  return new ApiError(
    response.status,
    payload.error?.code ?? 'REQUEST_FAILED',
    payload.error?.message ?? 'The service could not complete this request.',
  )
}

async function recorderRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: { Accept: 'application/json', ...init.headers },
    })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Unable to reach the API. Check that the backend is running.')
  }
  if (!response.ok) throw await readError(response)
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function getSession(): Promise<AppUser> {
  const payload = await recorderRequest<{ data?: { user?: AppUser } }>('/auth/session')
  if (!payload.data?.user?.id) throw new ApiError(502, 'INVALID_RESPONSE', 'The API returned an unexpected response.')
  return payload.data.user
}

// Best-effort wake-up for sleeping backend instances; never blocks the UI.
export async function pingHealth(): Promise<void> {
  try { await fetch(`${config.apiBaseUrl}/health`, { credentials: 'omit' }) } catch { /* wake attempt only */ }
}

export async function registerAccount(input: { email: string | null; password: string; username: string }): Promise<AppUser> {
  const payload = await recorderRequest<{ data?: { user?: AppUser } }>('/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })
  if (!payload.data?.user?.id) throw new ApiError(502, 'INVALID_RESPONSE', 'The API returned an unexpected response.')
  return payload.data.user
}

export async function login(input: { password: string; username: string }): Promise<AppUser> {
  const payload = await recorderRequest<{ data?: { user?: AppUser } }>('/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })
  if (!payload.data?.user?.id) throw new ApiError(502, 'INVALID_RESPONSE', 'The API returned an unexpected response.')
  return payload.data.user
}

export async function logout(): Promise<void> {
  await recorderRequest<void>('/auth/logout', { method: 'POST' })
}

export function getMediaAssetDriveOpenUrl(assetId: string): string {
  return `${config.apiBaseUrl}/media-assets/${encodeURIComponent(assetId)}/drive-link?redirect=1`
}

export async function getMediaAssetDriveLink(assetId: string): Promise<string> {
  const { data } = await recorderRequest<{ data: { url: string } }>(`/media-assets/${encodeURIComponent(assetId)}/drive-link`)
  const url = new URL(data.url)
  if (url.origin !== 'https://drive.google.com' || url.username || url.password) throw new ApiError(502, 'INVALID_RESPONSE', 'The API returned an unexpected response.')
  return url.href
}

export async function createRecorderActivity(input: {
  notes: string | null
  occurredAt?: string
  operationType: 'packing' | 'unpacking'
  reference: string | null
  storageProvider: 's3' | 'google_drive'
}): Promise<RecorderActivity> {
  const payload = await recorderRequest<{ data?: RecorderActivity }>('/recorder-activities', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })
  if (!payload.data?.id) throw new ApiError(502, 'INVALID_RESPONSE', 'The API returned an unexpected response.')
  return payload.data
}

export async function listRecorderActivities(input: ListRecorderActivitiesInput = {}): Promise<RecorderActivityList> {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const payload = await recorderRequest<Partial<RecorderActivityList>>(
    `/recorder-activities${search.size ? `?${search}` : ''}`,
  )
  if (!Array.isArray(payload.data) || !payload.meta || !Number.isInteger(payload.meta.totalRecords)) {
    throw new ApiError(502, 'INVALID_RESPONSE', 'The API returned an unexpected response.')
  }
  return payload as RecorderActivityList
}

export async function getRecorderActivity(activityId: string): Promise<RecorderActivityDetail> {
  const payload = await recorderRequest<{ data?: RecorderActivityDetail }>(`/recorder-activities/${activityId}`)
  if (!payload.data?.id || !Array.isArray(payload.data.assets)) {
    throw new ApiError(502, 'INVALID_RESPONSE', 'The API returned an unexpected response.')
  }
  return payload.data
}

export async function updateRecorderActivity(activityId: string, input: {
  notes?: string | null
  occurredAt?: string
  operationType?: 'packing' | 'unpacking'
  reference?: string | null
}): Promise<RecorderActivity> {
  const payload = await recorderRequest<{ data?: RecorderActivity }>(`/recorder-activities/${activityId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })
  if (!payload.data?.id) throw new ApiError(502, 'INVALID_RESPONSE', 'The API returned an unexpected response.')
  return payload.data
}

export async function cancelRecorderActivity(activityId: string): Promise<{ activity: RecorderActivity; cleanupPending: number }> {
  const payload = await recorderRequest<{ data?: { activity?: RecorderActivity; cleanupPending?: number } }>(
    `/recorder-activities/${activityId}/cancel`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
  )
  if (!payload.data?.activity?.id || !Number.isInteger(payload.data.cleanupPending)) {
    throw new ApiError(502, 'INVALID_RESPONSE', 'The API returned an unexpected response.')
  }
  return payload.data as { activity: RecorderActivity; cleanupPending: number }
}

export async function deleteRecorderActivity(activityId: string): Promise<{ cleanupPending: number }> {
  const payload = await recorderRequest<{ data?: { cleanupPending?: number } }>(`/recorder-activities/${activityId}`, { method: 'DELETE' })
  if (!payload.data || !Number.isInteger(payload.data.cleanupPending)) {
    throw new ApiError(502, 'INVALID_RESPONSE', 'The API returned an unexpected response.')
  }
  return payload.data as { cleanupPending: number }
}

export async function getActivityAuditEvents(activityId: string): Promise<ActivityAuditEvent[]> {
  const payload = await recorderRequest<{ data?: ActivityAuditEvent[] }>(`/recorder-activities/${activityId}/audit-events`)
  if (!Array.isArray(payload.data)) throw new ApiError(502, 'INVALID_RESPONSE', 'The API returned an unexpected response.')
  return payload.data
}

export function getMediaAssetContentUrl(assetId: string): string {
  return `${config.apiBaseUrl}/media-assets/${encodeURIComponent(assetId)}/content`
}

export async function createMediaAsset(activityId: string, input: {
  contentType: string
  mediaType: 'image' | 'video'
  originalFilename: string
  sha256: string
  sizeBytes: number
}): Promise<{ asset: MediaAsset; upload: UploadCapability }> {
  const payload = await recorderRequest<{ data?: { asset?: MediaAsset; upload?: UploadCapability } }>(
    `/recorder-activities/${activityId}/media-assets`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) },
  )
  if (!payload.data?.asset?.id || !payload.data.upload?.attemptId) throw new ApiError(502, 'INVALID_RESPONSE', 'The API returned an unexpected response.')
  return payload.data as { asset: MediaAsset; upload: UploadCapability }
}

export async function discardMediaAsset(assetId: string): Promise<{ cleanupPending: number }> {
  const payload = await recorderRequest<{ data?: { cleanupPending?: number } }>(`/media-assets/${assetId}`, { method: 'DELETE' })
  if (!Number.isInteger(payload.data?.cleanupPending)) throw new ApiError(500, 'INVALID_RESPONSE', 'The service returned an invalid discard response.')
  return { cleanupPending: payload.data!.cleanupPending! }
}

export async function finalizeMediaAsset(assetId: string, attemptId: string): Promise<MediaAsset> {
  const payload = await recorderRequest<{ data?: MediaAsset }>(
    `/media-assets/${assetId}/upload-attempts/${attemptId}/finalize`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
  )
  if (!payload.data?.id) throw new ApiError(502, 'INVALID_RESPONSE', 'The API returned an unexpected response.')
  return payload.data
}

export async function completeRecorderActivity(activityId: string): Promise<RecorderActivity> {
  const payload = await recorderRequest<{ data?: RecorderActivity }>(`/recorder-activities/${activityId}/complete`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  })
  if (!payload.data?.id) throw new ApiError(502, 'INVALID_RESPONSE', 'The API returned an unexpected response.')
  return payload.data
}

export function uploadMedia(file: File, capability: UploadCapability, onProgress: (percentage: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open(capability.method, capability.url)
    request.withCredentials = capability.strategy === 'server'
    for (const [name, value] of Object.entries(capability.headers)) request.setRequestHeader(name, value)
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    })
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300) resolve()
      else reject(new ApiError(request.status, 'UPLOAD_FAILED', 'The storage provider rejected the upload.'))
    })
    request.addEventListener('error', () => reject(new ApiError(
      0,
      'UPLOAD_NETWORK_ERROR',
      capability.strategy === 'server'
        ? 'The browser could not reach the Google Drive upload service. Check the connection and retry.'
        : 'The browser could not reach application storage. Check the connection and retry.',
    )))
    request.send(file)
  })
}

export interface GoogleDriveStatus { state?: 'connected' | 'disconnected' | 'reauthorization_required' | 'unavailable'; configured: boolean; connected: boolean; updatedAt: string | null }
export async function getGoogleDriveStatus(): Promise<GoogleDriveStatus> {
  return (await recorderRequest<{ data: GoogleDriveStatus }>('/google-drive/status')).data
}
export async function connectGoogleDrive(): Promise<string> {
  return (await recorderRequest<{ data: { authorizationUrl: string } }>('/google-drive/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).data.authorizationUrl
}
export async function unlinkGoogleDrive(): Promise<void> {
  await recorderRequest('/google-drive/connection', { method: 'DELETE' })
}

export interface StorageProviders {
  s3: { available: boolean }
  google_drive: { available: boolean; configured: boolean; state: 'connected' | 'disconnected' | 'reauthorization_required' | 'unavailable' }
}
let storageProvidersCache: StorageProviders | null = null
let storageProvidersRequest: Promise<StorageProviders> | null = null

export function clearStorageProvidersCache() {
  storageProvidersCache = null
  storageProvidersRequest = null
}

export async function getStorageProviders(options: { force?: boolean } = {}): Promise<StorageProviders> {
  if (!options.force && storageProvidersCache) return storageProvidersCache
  if (!options.force && storageProvidersRequest) return storageProvidersRequest
  const request = recorderRequest<{ data: StorageProviders }>('/storage-providers').then(({ data }) => {
    storageProvidersCache = data
    return data
  })
  storageProvidersRequest = request
  try { return await request } finally { if (storageProvidersRequest === request) storageProvidersRequest = null }
}

export async function getSettings(): Promise<UserSettings> {
  return (await recorderRequest<{ data: UserSettings }>('/settings')).data
}

export async function updateSettings(retentionDays: number): Promise<UserSettings> {
  return (await recorderRequest<{ data: UserSettings }>('/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ retentionDays }) })).data
}
