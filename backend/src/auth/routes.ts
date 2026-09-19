import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import type { AppConfig } from '../config.js'
import { AppError } from '../errors.js'
import type { AuthService } from './service.js'
import { readCookie, sessionCookieName, type SessionAuthenticator } from './session.js'

export interface AuthRouteDependencies {
  authenticate?: SessionAuthenticator
  service?: AuthService
}

const cookieMaxAgeSeconds = 90 * 24 * 60 * 60

function requireOrigin(request: FastifyRequest, config: AppConfig): void {
  if (request.headers.origin !== config.corsOrigin) {
    throw new AppError(403, 'CSRF_VALIDATION_FAILED', 'The request origin is not allowed.')
  }
}

function service(dependencies: AuthRouteDependencies): AuthService {
  if (!dependencies.service) throw new AppError(503, 'DATABASE_UNAVAILABLE', 'Authentication is unavailable until the database is configured.')
  return dependencies.service
}

function setSessionCookie(reply: FastifyReply, config: AppConfig, token: string): void {
  reply.setCookie(sessionCookieName, token, {
    httpOnly: true,
    maxAge: cookieMaxAgeSeconds,
    path: '/',
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
  })
}

const credentialsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['username', 'password'],
  properties: {
    email: { type: ['string', 'null'], maxLength: 254 },
    password: { type: 'string', minLength: 6, maxLength: 128 },
    username: { type: 'string', minLength: 3, maxLength: 64 },
  },
} as const

export function registerAuthRoutes(app: FastifyInstance, config: AppConfig, dependencies: AuthRouteDependencies): void {
  app.post('/api/v1/auth/register', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    schema: { body: credentialsSchema },
  }, async (request, reply) => {
    requireOrigin(request, config)
    const result = await service(dependencies).register(request.body)
    setSessionCookie(reply, config, result.token)
    return reply.status(201).send({ data: { user: result.user } })
  })

  app.post('/api/v1/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: {
      body: {
        ...credentialsSchema,
        properties: { password: credentialsSchema.properties.password, username: credentialsSchema.properties.username },
      },
    },
  }, async (request, reply) => {
    requireOrigin(request, config)
    const result = await service(dependencies).login(request.body)
    setSessionCookie(reply, config, result.token)
    return { data: { user: result.user } }
  })

  app.get('/api/v1/auth/session', async (request) => {
    const userId = await dependencies.authenticate?.(request) ?? null
    if (!userId) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.')
    return { data: { user: await service(dependencies).currentUser(userId) } }
  })

  app.post('/api/v1/auth/logout', async (request, reply) => {
    requireOrigin(request, config)
    await service(dependencies).logout(readCookie(request.headers.cookie, sessionCookieName))
    reply.clearCookie(sessionCookieName, { path: '/' })
    return reply.status(204).send()
  })
}
