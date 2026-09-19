import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import test from 'node:test'

import type { S3Config } from '../config.js'
import { B2MediaStorage } from './s3.js'
import { StorageUnavailableError, StorageVerificationError } from './types.js'

const config: S3Config = {
  accessKeyId: 'test-access-key',
  bucket: 'recorder-media',
  downloadExpiresSeconds: 300,
  endpoint: 'https://s3.us-west-004.backblazeb2.com',
  maxImageBytes: 1_024,
  maxVideoBytes: 2_048,
  region: 'us-west-004',
  secretAccessKey: 'test-secret-key',
  uploadExpiresSeconds: 900,
}

const object = {
  activityId: '3b9b6354-e351-4aed-94b1-828ea68de6c2',
  assetId: 'a6c2b026-5e4c-4436-8c51-b597033bbf2f',
  contentType: 'image/jpeg',
  ownerUserId: 'f079ef9c-727d-4820-83e8-bbea3cb53b45',
  sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  sizeBytes: 256,
}

const body = Buffer.alloc(object.sizeBytes, 'a')
body.set([0xff, 0xd8, 0xff])
const bodySha256 = createHash('sha256').update(body).digest('hex')

function verifiedClient(overrides: Record<string, unknown> = {}, inputs?: Record<string, unknown>[]) {
  let calls = 0
  return {
    send: async (command: unknown) => {
      inputs?.push((command as { input: Record<string, unknown> }).input)
      calls += 1
      if (calls === 1) return {
        ContentLength: body.length,
        ContentType: object.contentType,
        ETag: '"etag"',
        Metadata: { 'activity-id': object.activityId, 'asset-id': object.assetId },
        ...overrides,
      }
      return { Body: Readable.from(body) }
    },
  }
}

test('B2 storage creates a short-lived presigned PUT with a unique attempt key', async () => {
  let commandInput: Record<string, unknown> | undefined
  let options: Record<string, unknown> | undefined
  const storage = new B2MediaStorage(config, { send: async () => ({}) }, async (_client, command, input) => {
    commandInput = (command as { input: Record<string, unknown> }).input
    options = input
    return 'https://presigned.example/upload?signature=redacted'
  })

  const result = await storage.issueUpload(object, '4bc74257-cc21-46ac-8191-b94b734ea06a')

  assert.equal(commandInput?.Bucket, 'recorder-media')
  assert.equal(commandInput?.ContentType, 'image/jpeg')
  assert.equal(commandInput?.IfNoneMatch, undefined)
  assert.equal(options?.expiresIn, 900)
  assert.equal(result.capability.headers['If-None-Match'], undefined)
  assert.match(result.providerObjectRef, /^users\/[^/]+\/activities\/[^/]+\/assets\/[^/]+\/attempts\/[^/]+$/)
  assert.doesNotMatch(JSON.stringify(result), /test-secret-key|test-access-key/)
})

test('B2 storage uses the Backblaze endpoint and signing region', async () => {
  const storage = new B2MediaStorage(config)
  const result = await storage.issueUpload(object, '4bc74257-cc21-46ac-8191-b94b734ea06a')
  const url = new URL(result.capability.url)

  assert.equal(url.hostname, 'recorder-media.s3.us-west-004.backblazeb2.com')
  assert.match(url.searchParams.get('X-Amz-Credential') ?? '', /\/us-west-004\/s3\/aws4_request$/)
  assert.match(url.searchParams.get('X-Amz-SignedHeaders') ?? '', /content-type/)
})

test('B2 storage verifies object version, size, content type, and SHA-256', async () => {
  const expected = { ...object, sha256: bodySha256 }
  const commands: Record<string, unknown>[] = []
  const storage = new B2MediaStorage(
    config,
    verifiedClient({ VersionId: 'verified-version' }, commands),
    async () => 'https://presigned.example',
  )

  assert.deepEqual(await storage.verify('object-key', expected), {
    contentType: 'image/jpeg',
    providerVersionRef: 'verified-version',
    sha256: bodySha256,
    sizeBytes: 256,
  })
  assert.equal(commands[1].VersionId, 'verified-version')
})

test('B2 storage locks downloads and cleanup to the verified object version', async () => {
  const commands: Record<string, unknown>[] = []
  const storage = new B2MediaStorage(config, {
    send: async (command: unknown) => {
      commands.push((command as { input: Record<string, unknown> }).input)
      return {}
    },
  }, async (_client, command) => {
    commands.push((command as { input: Record<string, unknown> }).input)
    return 'https://presigned.example'
  })

  await storage.issueDownload('object-key', 'verified-version')
  await storage.deleteUnverified('object-key', 'failed-version')

  assert.equal(commands[0].VersionId, 'verified-version')
  assert.equal(commands[1].VersionId, 'failed-version')
  await assert.rejects(() => storage.issueDownload('object-key', null), StorageUnavailableError)
})

test('B2 storage resolves an unverified current object to an exact version before cleanup', async () => {
  const commands: Record<string, unknown>[] = []
  const storage = new B2MediaStorage(config, {
    send: async (command: unknown) => {
      const input = (command as { input: Record<string, unknown> }).input
      commands.push(input)
      return commands.length === 1 ? { VersionId: 'current-version' } : {}
    },
  }, async () => 'https://presigned.example')

  await storage.deleteObject('object-key')
  assert.equal(commands.length, 2)
  assert.equal(commands[1].VersionId, 'current-version')
})

test('B2 storage fails closed when object binding or content checksum is mismatched', async () => {
  const unavailable = new B2MediaStorage(config, {
    send: async () => ({
      ContentLength: object.sizeBytes,
      ContentType: object.contentType,
      Metadata: { 'activity-id': 'wrong', 'asset-id': object.assetId },
      VersionId: 'failed-version',
    }),
  }, async () => 'https://presigned.example')
  await assert.rejects(() => unavailable.verify('object-key', object), (error: unknown) => {
    return error instanceof StorageVerificationError
      && error.failureCode === 'BINDING_MISMATCH'
      && error.providerVersionRef === 'failed-version'
  })

  const mismatched = new B2MediaStorage(config, verifiedClient({ VersionId: 'failed-version' }), async () => 'https://presigned.example')
  await assert.rejects(() => mismatched.verify('object-key', object), (error: unknown) => {
    return error instanceof StorageVerificationError && error.failureCode === 'CHECKSUM_MISMATCH'
  })
})

test('B2 storage rejects an object when Backblaze does not return a version ID', async () => {
  const storage = new B2MediaStorage(config, verifiedClient(), async () => 'https://presigned.example')
  await assert.rejects(() => storage.verify('object-key', object), (error: unknown) => {
    return error instanceof StorageVerificationError && error.failureCode === 'VERSION_UNAVAILABLE'
  })
})

test('B2 storage distinguishes missing objects from provider outages', async () => {
  const missing = new B2MediaStorage(config, {
    send: async () => { throw { name: 'NotFound', $metadata: { httpStatusCode: 404 } } },
  }, async () => 'https://presigned.example')
  await assert.rejects(() => missing.verify('object-key', object), StorageVerificationError)

  const outage = new B2MediaStorage(config, {
    send: async () => { throw new Error('network unavailable') },
  }, async () => 'https://presigned.example')
  await assert.rejects(() => outage.verify('object-key', object), StorageUnavailableError)
})
