import { Readable } from 'node:stream'
import type { Pool } from 'pg'
import type { FastifyInstance } from 'fastify'
import type { SessionAuthenticator } from '../auth/session.js'
import type { AppConfig, GoogleDriveConfig } from '../config.js'
import { AppError } from '../errors.js'
import { decryptSecret } from '../storage/secret.js'
import { GoogleDriveClient } from './client.js'
import type { GoogleConnectionStore } from './repository.js'

export class DriveUploadService {
  constructor(private readonly pool: Pool, private readonly config: GoogleDriveConfig, private readonly connections: GoogleConnectionStore, private readonly client = new GoogleDriveClient(config)) {}
  async upload(owner: string, asset: string, attempt: string, body: Readable, contentLength: number): Promise<void> {
    const db = await this.pool.connect()
    let committed = false
    try {
      await db.query('BEGIN')
      // Match the lifecycle lock order; cancel/finalize cannot race an accepted transfer.
      const activity = await db.query(`SELECT a.id FROM recorder_activities a JOIN media_assets m ON m.activity_id=a.id WHERE m.id=$1 AND a.owner_user_id=$2 AND a.status IN ('draft','uploading') FOR UPDATE OF a`, [asset, owner])
      if (!activity.rows[0]) throw new AppError(404, 'ASSET_NOT_FOUND', 'The media asset does not exist.')
      const found = await db.query<{ provider_upload_ref: string; provider_object_ref: string; expected_size_bytes: string; declared_content_type: string; drive_transfer_started_at: Date | null }>(`
        SELECT t.provider_upload_ref, m.provider_object_ref, m.expected_size_bytes, m.declared_content_type, t.drive_transfer_started_at
        FROM media_upload_attempts t JOIN media_assets m ON m.id=t.asset_id
        WHERE t.id=$1 AND m.id=$2 AND m.storage_provider='google_drive' AND m.status='pending_upload'
          AND t.status='issued' AND t.expires_at > now() FOR UPDATE OF m,t`, [attempt, asset])
      const row = found.rows[0]
      if (!row) throw new AppError(410, 'UPLOAD_EXPIRED', 'This upload attempt is no longer available.')
      if (row.drive_transfer_started_at) throw new AppError(409, 'UPLOAD_ALREADY_ACTIVE', 'Finalize this attempt before retrying.')
      const size = Number(row.expected_size_bytes)
      if (contentLength !== size) throw new AppError(400, 'VALIDATION_ERROR', 'The upload size does not match.')
      const ref = JSON.parse(row.provider_object_ref) as { account: string }
      const connection = await this.connections.get(owner)
      if (!connection || connection.providerAccountId !== ref.account) throw new AppError(409, 'STORAGE_PROVIDER_NOT_AVAILABLE', 'Reconnect the original Google Drive account.')
      const session = decryptSecret(JSON.parse(row.provider_upload_ref), this.config.tokenEncryptionKey)
      await db.query('UPDATE media_upload_attempts SET drive_transfer_started_at=now() WHERE id=$1', [attempt])
      let failure: unknown
      try {
        const bounded = Readable.from((async function* () {
          let received = 0
          for await (const chunk of body) {
            received += Buffer.byteLength(chunk)
            if (received > size) throw new Error('UPLOAD_SIZE_MISMATCH')
            yield chunk
          }
          if (received !== size) throw new Error('UPLOAD_SIZE_MISMATCH')
        })())
        await this.client.upload(session, bounded, row.declared_content_type, size)
      } catch (error) { failure = error }
      // Keep the one-use guard even after an interrupted response. Finalize reconciles provider state.
      await db.query('COMMIT')
      committed = true
      if (failure) throw new AppError(503, 'STORAGE_PROVIDER_UNAVAILABLE', 'The upload was interrupted. Finalize or retry the file.')
    } finally {
      if (!committed) await db.query('ROLLBACK')
      db.release()
    }
  }
}

export function registerDriveUploadRoute(app: FastifyInstance, config: AppConfig, authenticate?: SessionAuthenticator, service?: Pick<DriveUploadService, 'upload'>): void {
  void app.register(async scoped => {
    scoped.addContentTypeParser('application/octet-stream', (request, payload, done) => done(null, payload))
    scoped.put('/api/v1/google-drive/uploads/:assetId/:attemptId', {
      config: { rateLimit: { groupId: 'recorder-uploads', max: 60, timeWindow: '1 minute' } },
      schema: { params: { type: 'object', required: ['assetId', 'attemptId'], additionalProperties: false, properties: { assetId: { type: 'string', format: 'uuid' }, attemptId: { type: 'string', format: 'uuid' } } } },
      onRequest: async request => {
        if (!await authenticate?.(request)) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.')
        if (request.headers.origin !== config.corsOrigin) throw new AppError(403, 'CSRF_VALIDATION_FAILED', 'The request origin is not allowed.')
      },
    }, async (request, reply) => {
      if (!service) throw new AppError(503, 'GOOGLE_DRIVE_UNAVAILABLE', 'Google Drive is not configured.')
      const size = Number(request.headers['content-length'])
      if (!Number.isSafeInteger(size) || size <= 0) throw new AppError(400, 'VALIDATION_ERROR', 'A valid upload content length is required.')
      const { assetId, attemptId } = request.params as { assetId: string; attemptId: string }
      const owner = await authenticate?.(request)
      if (!owner) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.')
      if (!(request.body instanceof Readable)) throw new AppError(400, 'VALIDATION_ERROR', 'An octet-stream upload is required.')
      await service.upload(owner, assetId, attemptId, request.body, size)
      return reply.status(204).send()
    })
  })
}
