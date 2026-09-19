import type { Readable } from 'node:stream'
import type { GoogleDriveConfig } from '../config.js'
import { decryptSecret } from '../storage/secret.js'
import { StorageUnavailableError, StorageVerificationError } from '../storage/types.js'
import type { GoogleConnection } from './repository.js'
import type { StorageObjectInput } from '../storage/types.js'

export interface DriveFileMetadata { id: string; mimeType?: string; size?: string; trashed?: boolean; headRevisionId?: string; appProperties?: Record<string, string> }
export class GoogleReauthorizationError extends StorageUnavailableError {}
const filesUrl = 'https://www.googleapis.com/drive/v3/files'

export class GoogleDriveClient {
  constructor(private readonly config: GoogleDriveConfig, private readonly fetchImpl: typeof fetch = fetch) {}

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    try {
      const response = await this.fetchImpl(url, { ...init, signal: init.signal ?? AbortSignal.timeout(30_000), redirect: 'error' })
      if (url === 'https://oauth2.googleapis.com/token' && response.status === 400) {
        const failure = await response.json() as { error?: string }
        if (failure.error === 'invalid_grant') throw new GoogleReauthorizationError('Reconnect Google Drive.')
      }
      if (response.status === 401) throw new GoogleReauthorizationError('Reconnect Google Drive.')
      if (response.status === 404) throw new StorageVerificationError('OBJECT_NOT_FOUND', 'The Drive file is unavailable.')
      if (!response.ok) throw new StorageUnavailableError()
      return response
    } catch (error) {
      if (error instanceof StorageUnavailableError || error instanceof StorageVerificationError) throw error
      throw new StorageUnavailableError()
    }
  }

  private async accessToken(connection: GoogleConnection): Promise<string> {
    const refreshToken = decryptSecret({ ciphertext: connection.encryptedRefreshToken, iv: connection.refreshTokenIv, tag: connection.refreshTokenTag, version: connection.encryptionKeyVersion }, this.config.tokenEncryptionKey)
    const response = await this.request('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.config.clientId, client_secret: this.config.clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
    })
    const payload = await response.json() as { access_token?: string }
    if (!payload.access_token) throw new StorageUnavailableError()
    return payload.access_token
  }
  private async headers(connection: GoogleConnection) { return { authorization: `Bearer ${await this.accessToken(connection)}` } }

  async createActivityFolder(connection: GoogleConnection, activityId: string): Promise<string> {
    const headers = await this.headers(connection)
    // Activity IDs and root IDs originate on the server; escape query literals nevertheless.
    const quote = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    const q = `'${quote(connection.rootFolderId)}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='activityId' and value='${quote(activityId)}' }`
    const found = await this.request(`${filesUrl}?${new URLSearchParams({ q, fields: 'files(id)', pageSize: '1' })}`, { headers })
    const matches = await found.json() as { files?: { id: string }[] }
    if (matches.files?.[0]?.id) return matches.files[0].id
    const response = await this.request(filesUrl, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ name: activityId, mimeType: 'application/vnd.google-apps.folder', parents: [connection.rootFolderId], appProperties: { activityId } }) })
    const payload = await response.json() as { id?: string }
    if (!payload.id) throw new StorageUnavailableError()
    return payload.id
  }

  async beginUpload(connection: GoogleConnection, folderId: string, input: StorageObjectInput): Promise<{ fileId: string; sessionUrl: string }> {
    const headers = await this.headers(connection)
    const ids = await (await this.request(`${filesUrl}/generateIds?count=1&space=drive&type=files`, { headers })).json() as { ids?: string[] }
    const fileId = ids.ids?.[0]
    if (!fileId) throw new StorageUnavailableError()
    const response = await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&keepRevisionForever=true', {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json', 'x-upload-content-type': input.contentType, 'x-upload-content-length': String(input.sizeBytes) },
      body: JSON.stringify({ id: fileId, name: input.assetId, mimeType: input.contentType, parents: [folderId], appProperties: { activityId: input.activityId, assetId: input.assetId } }),
    })
    const sessionUrl = response.headers.get('location')
    if (!sessionUrl || new URL(sessionUrl).origin !== 'https://www.googleapis.com') throw new StorageUnavailableError()
    return { fileId, sessionUrl }
  }

  async upload(sessionUrl: string, body: Readable, contentType: string, size: number): Promise<void> {
    if (new URL(sessionUrl).origin !== 'https://www.googleapis.com') throw new StorageUnavailableError()
    await this.request(sessionUrl, { method: 'PUT', headers: { 'content-type': contentType, 'content-length': String(size) }, body: body as unknown as BodyInit, duplex: 'half', signal: AbortSignal.timeout(600_000) } as RequestInit)
  }

  async metadata(connection: GoogleConnection, fileId: string): Promise<DriveFileMetadata> {
    return await (await this.request(`${filesUrl}/${encodeURIComponent(fileId)}?fields=id,mimeType,size,trashed,headRevisionId,appProperties`, { headers: await this.headers(connection) })).json() as DriveFileMetadata
  }

  async download(connection: GoogleConnection, fileId: string, revisionId: string): Promise<Response> {
    return this.request(`${filesUrl}/${encodeURIComponent(fileId)}/revisions/${encodeURIComponent(revisionId)}?alt=media`, { headers: await this.headers(connection), signal: AbortSignal.timeout(600_000) })
  }

  async pin(connection: GoogleConnection, fileId: string, revisionId: string): Promise<void> {
    await this.request(`${filesUrl}/${encodeURIComponent(fileId)}/revisions/${encodeURIComponent(revisionId)}`, { method: 'PATCH', headers: { ...await this.headers(connection), 'content-type': 'application/json' }, body: JSON.stringify({ keepForever: true }) })
  }

  async delete(connection: GoogleConnection, fileId: string): Promise<void> {
    try { await this.request(`${filesUrl}/${encodeURIComponent(fileId)}`, { method: 'DELETE', headers: await this.headers(connection) }) }
    catch (error) { if (!(error instanceof StorageVerificationError && error.failureCode === 'OBJECT_NOT_FOUND')) throw error }
  }
}
