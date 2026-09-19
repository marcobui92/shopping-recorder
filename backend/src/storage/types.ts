import type { Readable } from 'node:stream'
import type { StorageProvider, UploadCapability } from '../recorder/domain.js'

export interface StorageObjectInput {
  activityId: string
  assetId: string
  contentType: string
  ownerUserId: string
  sha256: string
  sizeBytes: number
}

export interface IssuedUpload {
  capability: UploadCapability
  providerObjectRef: string
  providerUploadRef: string | null
}

export interface VerifiedStorageObject {
  contentType: string
  providerVersionRef: string | null
  sha256: string
  sizeBytes: number
}

export type MediaDownload = { expiresAt: string; url: string } | { body: Readable; contentType: string; sizeBytes: number; filename?: string }

export interface MediaStorageAdapter {
  assertAvailable?(owner: string): Promise<void>
  deleteObject(providerObjectRef: string, providerVersionRef?: string | null): Promise<void>
  deleteUnverified(providerObjectRef: string, providerVersionRef?: string | null): Promise<void>
  issueDownload(providerObjectRef: string, providerVersionRef?: string | null): Promise<MediaDownload>
  issueUpload(input: StorageObjectInput, attemptId: string): Promise<IssuedUpload>
  readonly provider: StorageProvider
  verify(providerObjectRef: string, expected: StorageObjectInput): Promise<VerifiedStorageObject>
}

export class StorageVerificationError extends Error {
  constructor(
    public readonly failureCode: string,
    message: string,
    public readonly providerVersionRef: string | null = null,
  ) {
    super(message)
    this.name = 'StorageVerificationError'
  }
}

export class StorageUnavailableError extends Error {
  constructor(message = 'The storage provider is temporarily unavailable.') {
    super(message)
    this.name = 'StorageUnavailableError'
  }
}
