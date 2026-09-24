import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import type { GoogleDriveConfig } from '../config.js'
import type { GoogleConnectionStore } from '../google/repository.js'
import { GoogleDriveClient } from '../google/client.js'
import { detectedContentType } from './s3.js'
import { encryptSecret } from './secret.js'
import { StorageUnavailableError, StorageVerificationError, type MediaStorageAdapter, type StorageObjectInput, type IssuedUpload, type MediaDownload } from './types.js'

interface DriveRef { owner: string; account: string; file: string }
interface DriveVersion { revision: string; contentType: string; size: number }
export class DriveMediaStorage implements MediaStorageAdapter {
  readonly provider = 'google_drive' as const
  constructor(
    private readonly config: GoogleDriveConfig,
    private readonly repository: GoogleConnectionStore,
    private readonly client = new GoogleDriveClient(config),
    private readonly uploadOrigin = new URL(config.redirectUri).origin,
  ) {}

  private async connection(ref: DriveRef) {
    const connection = await this.repository.get(ref.owner)
    if (!connection || connection.providerAccountId !== ref.account) throw new StorageUnavailableError('Reconnect the original Google Drive account.')
    return connection
  }
  async assertAvailable(owner: string): Promise<void> {
    if (!await this.repository.get(owner)) throw new StorageUnavailableError('Connect Google Drive before creating a record.')
  }
  async issueUpload(input: StorageObjectInput, attemptId: string): Promise<IssuedUpload> {
    const connection = await this.repository.get(input.ownerUserId)
    if (!connection) throw new StorageUnavailableError('Connect Google Drive before uploading.')
    const folder = await this.client.createActivityFolder(connection, input.activityId)
    const upload = await this.client.beginUpload(connection, folder, input)
    return {
      providerObjectRef: JSON.stringify({ owner: input.ownerUserId, account: connection.providerAccountId, file: upload.fileId } satisfies DriveRef),
      providerUploadRef: JSON.stringify(encryptSecret(upload.sessionUrl, this.config.tokenEncryptionKey)),
      capability: { attemptId, expiresAt: new Date(Date.now() + 900_000).toISOString(), method: 'PUT', strategy: 'server', headers: { 'Content-Type': 'application/octet-stream' }, url: new URL(`/api/v1/google-drive/uploads/${input.assetId}/${attemptId}`, this.uploadOrigin).href },
    }
  }
  async verify(objectRef: string, expected: StorageObjectInput) {
    const ref = JSON.parse(objectRef) as DriveRef
    if (ref.owner !== expected.ownerUserId) throw new StorageVerificationError('BINDING_MISMATCH', 'The Drive owner does not match.')
    const connection = await this.connection(ref)
    const metadata = await this.client.metadata(connection, ref.file)
    if (metadata.trashed || !metadata.headRevisionId) throw new StorageVerificationError('OBJECT_NOT_FOUND', 'The Drive file is unavailable.')
    if (metadata.appProperties?.activityId !== expected.activityId || metadata.appProperties?.assetId !== expected.assetId) throw new StorageVerificationError('BINDING_MISMATCH', 'The Drive file binding does not match.')
    if (Number(metadata.size) !== expected.sizeBytes || metadata.mimeType !== expected.contentType) throw new StorageVerificationError('METADATA_MISMATCH', 'The Drive file metadata does not match.')
    const revision = metadata.headRevisionId
    await this.client.pin(connection, ref.file, revision)
    const response = await this.client.download(connection, ref.file, revision)
    if (!response.body) throw new StorageUnavailableError()
    const hash = createHash('sha256')
    let size = 0
    let prefix = Buffer.alloc(0)
    for await (const chunk of Readable.fromWeb(response.body as import('node:stream/web').ReadableStream)) {
      const bytes = Buffer.from(chunk)
      size += bytes.length
      if (size > expected.sizeBytes) throw new StorageVerificationError('SIZE_MISMATCH', 'The Drive file size does not match.')
      hash.update(bytes)
      if (prefix.length < 64) prefix = Buffer.concat([prefix, bytes.subarray(0, 64 - prefix.length)])
    }
    if (size !== expected.sizeBytes) throw new StorageVerificationError('SIZE_MISMATCH', 'The Drive file size does not match.')
    if (hash.digest('hex') !== expected.sha256) throw new StorageVerificationError('CHECKSUM_MISMATCH', 'The Drive file checksum does not match.')
    if (detectedContentType(prefix) !== expected.contentType) throw new StorageVerificationError('CONTENT_TYPE_MISMATCH', 'The Drive file type does not match.')
    return { contentType: expected.contentType, sha256: expected.sha256, sizeBytes: size, providerVersionRef: JSON.stringify({ revision, contentType: expected.contentType, size } satisfies DriveVersion) }
  }
  async issueDownload(objectRef: string, versionRef?: string | null): Promise<MediaDownload> {
    if (!versionRef) throw new StorageUnavailableError()
    const ref = JSON.parse(objectRef) as DriveRef
    const version = JSON.parse(versionRef) as DriveVersion
    const connection = await this.connection(ref)
    try {
      const metadata = await this.client.metadata(connection, ref.file)
      if (metadata.trashed) throw new StorageUnavailableError()
      const response = await this.client.download(connection, ref.file, version.revision)
      if (!response.body) throw new StorageUnavailableError()
      return { body: Readable.fromWeb(response.body as import('node:stream/web').ReadableStream), contentType: version.contentType, sizeBytes: version.size }
    } catch { throw new StorageUnavailableError('The verified Drive revision is unavailable.') }
  }
  async deleteObject(objectRef: string): Promise<void> {
    const ref = JSON.parse(objectRef) as DriveRef
    await this.client.delete(await this.connection(ref), ref.file)
  }
  async deleteUnverified(objectRef: string): Promise<void> {
    try { await this.deleteObject(objectRef) } catch { /* A failed verification never exposes evidence. */ }
  }
}
