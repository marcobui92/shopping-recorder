import { registerDriveUploadRoute, type DriveUploadService } from './google/upload.js'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import Fastify, { type FastifyInstance } from 'fastify'

import { registerAuthRoutes, type AuthRouteDependencies } from './auth/routes.js'
import type { AppConfig } from './config.js'
import { AppError } from './errors.js'
import { registerRecorderRoutes, type RecorderRouteDependencies } from './recorder/routes.js'
import { registerGoogleRoutes, type GoogleRouteDependencies } from './google/routes.js'

interface AppDependencies {
  auth?: AuthRouteDependencies
  readiness?: () => Promise<void>
  recorder?: RecorderRouteDependencies
  driveUpload?: Pick<DriveUploadService, 'upload'>
  google?: GoogleRouteDependencies
}

export function buildApp(config: AppConfig, dependencies: AppDependencies = {}): FastifyInstance {
  const app = Fastify({
    ajv: { customOptions: { removeAdditional: false } },
    logger: { level: config.logLevel, serializers: { req: (request) => ({ method: request.method, url: request.url?.split('?')[0], hostname: request.hostname, remoteAddress: request.ip }) } },
    trustProxy: config.trustProxy,
  })

  void app.register(cookie)
  void app.register(rateLimit, {
    global: false,
    errorResponseBuilder: () => new AppError(429, 'RATE_LIMITED', 'Too many requests. Try again later.'),
  })
  void app.register(cors, { credentials: true, origin: config.corsOrigin, methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] })

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-request-id', request.id)
    reply.header('x-content-type-options', 'nosniff')
    reply.header('x-frame-options', 'DENY')
    reply.header('referrer-policy', 'no-referrer')
    reply.header('content-security-policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
    if (request.url.startsWith('/api/v1/health')
      || request.url.startsWith('/api/v1/auth/')
      || request.url.startsWith('/api/v1/recorder-activities')
      || request.url.startsWith('/api/v1/media-assets')
      || request.url.startsWith('/api/v1/google-drive')
      || request.url.startsWith('/api/v1/storage-providers')) {
      reply.header('cache-control', 'no-store')
    }
    return payload
  })

  // Register guarded routes after the plugins so their onRoute/onRequest hooks are active.
  void app.register(async (guarded) => {
    registerAuthRoutes(guarded, config, dependencies.auth ?? {})
    registerRecorderRoutes(guarded, config, dependencies.recorder ?? {})
    registerGoogleRoutes(guarded, config, dependencies.google ?? {})
    registerDriveUploadRoute(guarded, config, dependencies.google?.authenticate, dependencies.driveUpload)
  })

  app.get('/api/v1/health', {
    schema: {
      response: {
        200: {
          type: 'object',
          required: ['data'],
          properties: {
            data: {
              type: 'object',
              required: ['status'],
              properties: { status: { type: 'string' } },
            },
          },
        },
      },
    },
  }, async () => ({ data: { status: 'ok' } }))

  app.get('/api/v1/health/ready', async (request, reply) => {
    try {
      if (!dependencies.readiness) throw new Error('Readiness dependencies are not configured.')
      await dependencies.readiness()
      return { data: { status: 'ready' } }
    } catch (error) {
      request.log.warn({ err: error }, 'Readiness check failed')
      return reply.status(503).send({ data: { status: 'not-ready' } })
    }
  })

  app.setNotFoundHandler(async (_request, reply) => {
    return reply.status(404).send({
      error: { code: 'ROUTE_NOT_FOUND', message: 'The requested endpoint does not exist.' },
    })
  })

  app.setErrorHandler(async (error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message },
      })
    }

    if (typeof error === 'object' && error !== null && 'validation' in error) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'The request is invalid.' },
      })
    }

    request.log.error(error)
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
    })
  })

  return app
}
