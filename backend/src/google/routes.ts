import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AppConfig } from '../config.js'
import { AppError } from '../errors.js'
import type { SessionAuthenticator } from '../auth/session.js'
import type { GoogleDriveService } from './service.js'
import { hashOAuthState } from './oauth.js'
import type { GoogleConnectionStore } from './repository.js'

export interface GoogleRouteDependencies { authenticate?: SessionAuthenticator; service?: Pick<GoogleDriveService, 'begin' | 'complete' | 'revoke' | 'connectionState'>; repository?: GoogleConnectionStore }
async function owner(request: FastifyRequest, config: AppConfig, deps: GoogleRouteDependencies, mutate = false): Promise<string> {
  const id = await deps.authenticate?.(request) ?? null
  if (!id) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.')
  if (mutate && request.headers.origin !== config.corsOrigin) throw new AppError(403, 'CSRF_VALIDATION_FAILED', 'The request origin is not allowed.')
  return id
}
const mutation = { rateLimit: { groupId: 'google-link', max: 10, timeWindow: '1 minute' } }
export function registerGoogleRoutes(app: FastifyInstance, config: AppConfig, deps: GoogleRouteDependencies): void {
  app.get('/api/v1/storage-providers', async (request) => {
    const userId = await owner(request, config, deps)
    const configured = Boolean(config.googleDrive && deps.repository && deps.service)
    const state = configured ? await deps.service!.connectionState(userId) : 'unavailable'
    return { data: {
      s3: { available: Boolean(config.s3) },
      google_drive: { available: state === 'connected', configured, state },
    } }
  })
  app.get('/api/v1/google-drive/status', async (request) => {
    const userId = await owner(request, config, deps)
    const configured = Boolean(config.googleDrive && deps.repository && deps.service)
    const connection = configured ? await deps.repository!.get(userId) : null
    const state = configured ? await deps.service!.connectionState(userId) : 'unavailable'
    return { data: { configured, connected: Boolean(connection), state, updatedAt: connection?.updatedAt ?? null } }
  })
  app.post('/api/v1/google-drive/connect', { config: mutation, schema: { body: { type: 'object', additionalProperties: false } } }, async (request) => {
    const userId = await owner(request, config, deps, true)
    if (!config.googleDrive || !deps.service) throw new AppError(503, 'GOOGLE_DRIVE_UNAVAILABLE', 'Google Drive is not configured.')
    return { data: { authorizationUrl: await deps.service.begin(userId) } }
  })
  app.get('/api/v1/google-drive/callback', {
    config: mutation,
    schema: { querystring: { type: 'object', properties: { code: { type: 'string', maxLength: 4096 }, state: { type: 'string', maxLength: 128 }, error: { type: 'string', maxLength: 256 } } } },
  }, async (request, reply) => {
    if (!config.googleDrive || !deps.service) return reply.redirect(`${config.corsOrigin}/?googleDrive=unavailable`)
    const query = request.query as { code?: string; state?: string; error?: string }
    try {
      const userId = await owner(request, config, deps)
      if (!query.state) return reply.redirect(`${config.corsOrigin}/?googleDrive=error`)
      if (query.error || !query.code) {
        await deps.repository?.consumeOAuthState(hashOAuthState(query.state), userId)
        return reply.redirect(`${config.corsOrigin}/?googleDrive=cancelled`)
      }
      await deps.service.complete(query.state, query.code, userId)
      return reply.redirect(`${config.corsOrigin}/?googleDrive=connected`)
    } catch { return reply.redirect(`${config.corsOrigin}/?googleDrive=error`) }
  })
  app.delete('/api/v1/google-drive/connection', { config: mutation }, async (request, reply) => {
    const userId = await owner(request, config, deps, true)
    if (!deps.repository || !deps.service) throw new AppError(503, 'GOOGLE_DRIVE_UNAVAILABLE', 'Google Drive is not configured.')
    try { await deps.service.revoke(userId) }
    catch { throw new AppError(503, 'GOOGLE_DRIVE_UNAVAILABLE', 'Google Drive revocation failed. Try again.') }
    await deps.repository.unlink(userId)
    return reply.status(204).send()
  })
}
