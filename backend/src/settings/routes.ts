import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AppConfig } from '../config.js'
import { AppError } from '../errors.js'
import type { SessionAuthenticator } from '../auth/session.js'
import type { SettingsRepository } from './repository.js'

export interface SettingsRouteDependencies { authenticate?: SessionAuthenticator; repository?: SettingsRepository }

function owner(request: FastifyRequest, config: AppConfig, dependencies: SettingsRouteDependencies): Promise<string> {
  return (async () => {
    const userId = await dependencies.authenticate?.(request)
    if (!userId) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.')
    if (request.method !== 'GET' && request.headers.origin !== config.corsOrigin) throw new AppError(403, 'CSRF_VALIDATION_FAILED', 'The request origin is not allowed.')
    return userId
  })()
}

function repository(dependencies: SettingsRouteDependencies): SettingsRepository {
  if (!dependencies.repository) throw new AppError(503, 'DATABASE_UNAVAILABLE', 'Settings are unavailable until the database is configured.')
  return dependencies.repository
}

export function registerSettingsRoutes(app: FastifyInstance, config: AppConfig, dependencies: SettingsRouteDependencies): void {
  app.get('/api/v1/settings', async (request) => {
    const days = await repository(dependencies).getRetentionDays(await owner(request, config, dependencies))
    if (days === null) throw new AppError(404, 'USER_NOT_FOUND', 'The account does not exist.')
    return { data: { retentionDays: days } }
  })
  app.patch('/api/v1/settings', {
    config: { rateLimit: { groupId: 'settings-mutations', max: 30, timeWindow: '1 minute' } },
    schema: { body: { type: 'object', additionalProperties: false, required: ['retentionDays'], properties: { retentionDays: { type: 'integer', minimum: 1, maximum: 3650 } } } },
  }, async (request) => {
    const input = request.body as { retentionDays: number }
    const days = await repository(dependencies).updateRetentionDays(await owner(request, config, dependencies), input.retentionDays)
    if (days === null) throw new AppError(404, 'USER_NOT_FOUND', 'The account does not exist.')
    return { data: { retentionDays: days } }
  })
}
