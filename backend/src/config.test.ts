import assert from 'node:assert/strict'
import test from 'node:test'

import { loadConfig } from './config.js'

test('loadConfig validates the server port', () => {
  assert.throws(() => loadConfig({ PORT: '0' }), /PORT must be an integer/)
})

test('loadConfig accepts PostgreSQL connection URLs', () => {
  const config = loadConfig({ DATABASE_URL: 'postgresql://user:password@localhost:5432/shopping_recorder' })

  assert.equal(config.databaseUrl, 'postgresql://user:password@localhost:5432/shopping_recorder')
})

test('loadConfig leaves B2-backed S3 storage disabled when no B2 variables are provided', () => {
  assert.equal(loadConfig({}).s3, undefined)
})

test('loadConfig validates optional Google Drive settings and decodes the encryption key', () => {
  const key = Buffer.alloc(32, 7).toString('base64')
  const config = loadConfig({
    GOOGLE_CLIENT_ID: 'client-id', GOOGLE_CLIENT_SECRET: 'client-secret',
    GOOGLE_REDIRECT_URI: 'http://localhost:3000/api/v1/google-drive/callback',
    GOOGLE_TOKEN_ENCRYPTION_KEY: key,
  })
  assert.equal(config.googleDrive?.clientId, 'client-id')
  assert.equal(config.googleDrive?.tokenEncryptionKey.length, 32)
  assert.equal(config.googleDrive?.oauthStateTtlSeconds, 600)
  assert.throws(() => loadConfig({ GOOGLE_CLIENT_ID: 'only-one' }), /all required/)
  assert.throws(() => loadConfig({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret', GOOGLE_REDIRECT_URI: 'ftp://bad', GOOGLE_TOKEN_ENCRYPTION_KEY: key }), /valid HTTP/)
})

test('loadConfig validates and normalizes Backblaze B2 settings', () => {
  const config = loadConfig({
    B2_APPLICATION_KEY: 'local-application-key',
    B2_APPLICATION_KEY_ID: 'local-key-id',
    B2_BUCKET_NAME: 'recorder-media',
    B2_MAX_IMAGE_BYTES: '1024',
    B2_MAX_VIDEO_BYTES: '2048',
    B2_REGION: 'us-west-004',
  })

  assert.deepEqual(config.s3, {
    accessKeyId: 'local-key-id',
    bucket: 'recorder-media',
    downloadExpiresSeconds: 300,
    endpoint: 'https://s3.us-west-004.backblazeb2.com',
    maxImageBytes: 1024,
    maxVideoBytes: 2048,
    region: 'us-west-004',
    secretAccessKey: 'local-application-key',
    uploadExpiresSeconds: 900,
  })
})

test('loadConfig rejects partial or malformed Backblaze B2 settings', () => {
  assert.throws(() => loadConfig({ B2_BUCKET_NAME: 'recorder-media' }), /are all required/)
  assert.throws(() => loadConfig({
    B2_APPLICATION_KEY: 'secret', B2_APPLICATION_KEY_ID: 'key', B2_BUCKET_NAME: 'bucket', B2_REGION: 'invalid_region',
  }), /valid Backblaze region/)
})

test('loadConfig validates proxy trust explicitly', () => {
  assert.equal(loadConfig({ TRUST_PROXY: 'true' }).trustProxy, true)
  assert.equal(loadConfig({}).trustProxy, false)
  assert.throws(() => loadConfig({ TRUST_PROXY: '1' }), /TRUST_PROXY must be true or false/)
})

test('loadConfig fails closed when required production dependencies are absent or insecure', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /DATABASE_URL is required in production/)
  const production = {
    B2_APPLICATION_KEY: 'secret', B2_APPLICATION_KEY_ID: 'key', B2_BUCKET_NAME: 'bucket',
    B2_REGION: 'us-west-004', DATABASE_URL: 'postgresql://user:password@db:5432/recorder', NODE_ENV: 'production',
  }
  assert.throws(() => loadConfig(production), /CORS_ORIGIN must use HTTPS in production/)
  assert.equal(loadConfig({ ...production, CORS_ORIGIN: 'https://recorder.example' }).nodeEnv, 'production')
})
