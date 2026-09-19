import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createHash } from 'node:crypto'
import type { Readable } from 'node:stream'

import type { S3Config } from '../config.js'
import type { IssuedUpload, MediaStorageAdapter, StorageObjectInput, VerifiedStorageObject } from './types.js'
import { StorageUnavailableError, StorageVerificationError } from './types.js'

interface S3ClientLike {
  send(command: unknown): Promise<Record<string, unknown>>
}

type Presign = (client: S3ClientLike, command: unknown, options: Record<string, unknown>) => Promise<string>

export function detectedContentType(prefix: Buffer): string | null {
  if (prefix.length >= 3 && prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff) return 'image/jpeg'
  if (prefix.length >= 8 && prefix.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (prefix.length >= 12 && prefix.toString('ascii', 0, 4) === 'RIFF' && prefix.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  if (prefix.length >= 4 && prefix.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'video/webm'
  if (prefix.length >= 12 && prefix.toString('ascii', 4, 8) === 'ftyp') {
    const brands = prefix.toString('ascii', 8)
    if (brands.startsWith('qt  ')) return 'video/quicktime'
    if (/(heic|heix|hevc|hevx|mif1|msf1)/.test(brands)) return 'image/heic'
    return 'video/mp4'
  }
  return null
}

async function inspectBody(body: unknown): Promise<{ contentType: string; sha256: string }> {
  if (!body || typeof (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] !== 'function') {
    throw new StorageVerificationError('CONTENT_UNAVAILABLE', 'The uploaded object cannot be read for verification.')
  }

  const hash = createHash('sha256')
  const prefixChunks: Buffer[] = []
  let prefixLength = 0
  for await (const chunk of body as Readable) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    hash.update(bytes)
    if (prefixLength < 64) {
      const part = bytes.subarray(0, 64 - prefixLength)
      prefixChunks.push(part)
      prefixLength += part.length
    }
  }
  const contentType = detectedContentType(Buffer.concat(prefixChunks))
  if (!contentType) {
    throw new StorageVerificationError('CONTENT_TYPE_UNRECOGNIZED', 'The uploaded object type cannot be verified.')
  }
  return { contentType, sha256: hash.digest('hex') }
}

function expiresAt(seconds: number): string {
  return new Date(Date.now() + seconds * 1_000).toISOString()
}

function isMissingObject(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const value = error as { $metadata?: { httpStatusCode?: number }; name?: string }
  return value.name === 'NotFound' || value.name === 'NoSuchKey' || value.$metadata?.httpStatusCode === 404
}

export class B2MediaStorage implements MediaStorageAdapter {
  readonly provider = 's3' as const

  constructor(
    private readonly config: S3Config,
    private readonly client: S3ClientLike = new S3Client({
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      endpoint: config.endpoint,
      region: config.region,
    }) as S3ClientLike,
    private readonly presign: Presign = getSignedUrl as unknown as Presign,
  ) {}

  async issueUpload(input: StorageObjectInput, attemptId: string): Promise<IssuedUpload> {
    const key = `users/${input.ownerUserId}/activities/${input.activityId}/assets/${input.assetId}/attempts/${attemptId}`
    const metadata = { 'activity-id': input.activityId, 'asset-id': input.assetId }
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      ContentType: input.contentType,
      Key: key,
      Metadata: metadata,
    })

    try {
      const url = await this.presign(this.client, command, {
        expiresIn: this.config.uploadExpiresSeconds,
        signableHeaders: new Set(['content-type']),
        unhoistableHeaders: new Set([
          'x-amz-meta-activity-id',
          'x-amz-meta-asset-id',
        ]),
      })
      return {
        capability: {
          attemptId,
          expiresAt: expiresAt(this.config.uploadExpiresSeconds),
          headers: {
            'Content-Type': input.contentType,
            'x-amz-meta-activity-id': input.activityId,
            'x-amz-meta-asset-id': input.assetId,
          },
          method: 'PUT',
          strategy: 'direct',
          url,
        },
        providerObjectRef: key,
        providerUploadRef: key,
      }
    } catch {
      throw new StorageUnavailableError()
    }
  }

  async verify(providerObjectRef: string, expected: StorageObjectInput): Promise<VerifiedStorageObject> {
    let object: Record<string, unknown>
    try {
      object = await this.client.send(new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: providerObjectRef,
      }))
    } catch (error) {
      if (isMissingObject(error)) throw new StorageVerificationError('OBJECT_NOT_FOUND', 'The uploaded object does not exist.')
      throw new StorageUnavailableError()
    }

    const versionId = typeof object.VersionId === 'string' ? object.VersionId : null
    if (!versionId) {
      throw new StorageVerificationError('VERSION_UNAVAILABLE', 'The uploaded object version cannot be verified.')
    }
    if (object.ContentLength !== expected.sizeBytes) {
      throw new StorageVerificationError('SIZE_MISMATCH', 'The uploaded object size does not match.', versionId)
    }
    if (object.ContentType !== expected.contentType) {
      throw new StorageVerificationError('CONTENT_TYPE_MISMATCH', 'The uploaded object type does not match.', versionId)
    }
    const metadata = object.Metadata
    if (!metadata || typeof metadata !== 'object'
      || (metadata as Record<string, unknown>)['activity-id'] !== expected.activityId
      || (metadata as Record<string, unknown>)['asset-id'] !== expected.assetId) {
      throw new StorageVerificationError('BINDING_MISMATCH', 'The uploaded object does not belong to the expected activity and asset.', versionId)
    }

    let content: Record<string, unknown>
    try {
      content = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: providerObjectRef, VersionId: versionId }))
    } catch (error) {
      if (isMissingObject(error)) throw new StorageVerificationError('OBJECT_NOT_FOUND', 'The uploaded object does not exist.')
      throw new StorageUnavailableError()
    }
    let inspected: { contentType: string; sha256: string }
    try {
      inspected = await inspectBody(content.Body)
    } catch (error) {
      if (error instanceof StorageVerificationError) {
        throw new StorageVerificationError(error.failureCode, error.message, versionId)
      }
      throw new StorageUnavailableError()
    }
    if (inspected.contentType !== expected.contentType) {
      throw new StorageVerificationError('CONTENT_TYPE_MISMATCH', 'The uploaded object bytes do not match the declared type.', versionId)
    }
    if (inspected.sha256 !== expected.sha256) {
      throw new StorageVerificationError('CHECKSUM_MISMATCH', 'The uploaded object checksum does not match.', versionId)
    }

    return {
      contentType: inspected.contentType,
      providerVersionRef: versionId,
      sha256: expected.sha256,
      sizeBytes: object.ContentLength as number,
    }
  }

  async deleteUnverified(providerObjectRef: string, providerVersionRef?: string | null): Promise<void> {
    try {
      await this.deleteObject(providerObjectRef, providerVersionRef)
    } catch {
      // Best effort: the failed asset remains non-retrievable and cleanup can be retried operationally.
    }
  }

  async deleteObject(providerObjectRef: string, providerVersionRef?: string | null): Promise<void> {
    let exactVersion = providerVersionRef ?? null
    try {
      if (!exactVersion) {
        const object = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: providerObjectRef }))
        exactVersion = typeof object.VersionId === 'string' ? object.VersionId : null
        if (!exactVersion) throw new StorageUnavailableError('The storage object version is unavailable for cleanup.')
      }
      await this.client.send(new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: providerObjectRef,
        VersionId: exactVersion,
      }))
    } catch (error) {
      if (isMissingObject(error)) return
      if (error instanceof StorageUnavailableError) throw error
      throw new StorageUnavailableError()
    }
  }

  async issueDownload(providerObjectRef: string, providerVersionRef?: string | null): Promise<{ expiresAt: string; url: string }> {
    try {
      if (!providerVersionRef) throw new StorageUnavailableError('The verified object version is unavailable.')
      const command = new GetObjectCommand({ Bucket: this.config.bucket, Key: providerObjectRef, VersionId: providerVersionRef })
      return {
        expiresAt: expiresAt(this.config.downloadExpiresSeconds),
        url: await this.presign(this.client, command, { expiresIn: this.config.downloadExpiresSeconds }),
      }
    } catch {
      throw new StorageUnavailableError()
    }
  }
}
