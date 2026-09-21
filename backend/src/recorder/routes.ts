import type { FastifyInstance, FastifyRequest } from 'fastify'

import type { SessionAuthenticator } from '../auth/session.js'
import type { AppConfig } from '../config.js'
import { AppError } from '../errors.js'
import {
  parseCreateMediaAssetInput,
  parseCreateRecorderActivityInput,
  parseCompareRecorderActivitiesInput,
  parseListRecorderActivitiesInput,
  parseUpdateRecorderActivityInput,
} from './domain.js'
import type { RecorderMediaService } from './service.js'

export interface RecorderRouteDependencies {
  authenticate?: SessionAuthenticator
  service?: RecorderMediaService
}

async function requireOwner(
  request: FastifyRequest,
  config: AppConfig,
  dependencies: RecorderRouteDependencies,
  stateChanging: boolean,
): Promise<string> {
  const ownerUserId = await dependencies.authenticate?.(request) ?? null
  if (!ownerUserId) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.')
  if (stateChanging && request.headers.origin !== config.corsOrigin) {
    throw new AppError(403, 'CSRF_VALIDATION_FAILED', 'The request origin is not allowed.')
  }
  return ownerUserId
}

function service(dependencies: RecorderRouteDependencies): RecorderMediaService {
  if (!dependencies.service) {
    throw new AppError(503, 'DATABASE_UNAVAILABLE', 'Recorder storage is unavailable until the database is configured.')
  }
  return dependencies.service
}

const recorderMutationConfig = { rateLimit: { groupId: 'recorder-mutations', max: 30, timeWindow: '1 minute' } }
const uploadMutationConfig = { rateLimit: { groupId: 'recorder-uploads', max: 60, timeWindow: '1 minute' } }

const uuidParams = {
  type: 'object',
  additionalProperties: false,
  required: ['assetId'],
  properties: { assetId: { type: 'string', format: 'uuid' } },
} as const

export function registerRecorderRoutes(
  app: FastifyInstance,
  config: AppConfig,
  dependencies: RecorderRouteDependencies,
): void {
  app.post('/api/v1/recorder-activities', {
    config: recorderMutationConfig,
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['operationType', 'storageProvider'],
        properties: {
          notes: { type: ['string', 'null'], maxLength: 2_000 },
          occurredAt: { type: 'string', format: 'date-time' },
          operationType: { type: 'string', enum: ['packing', 'unpacking'] },
          reference: { type: ['string', 'null'], maxLength: 160 },
          storageProvider: { type: 'string', enum: ['s3', 'google_drive'] },
        },
      },
    },
  }, async (request, reply) => {
    const ownerUserId = await requireOwner(request, config, dependencies, true)
    const activity = await service(dependencies).createActivity(ownerUserId, parseCreateRecorderActivityInput(request.body))
    return reply.status(201).send({ data: activity })
  })

  app.get('/api/v1/recorder-activities', {
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          reference: { type: 'string', maxLength: 160 },
          occurredFrom: { type: 'string', format: 'date-time' },
          occurredTo: { type: 'string', format: 'date-time' },
          operationType: { type: 'string', enum: ['packing', 'unpacking'] },
          page: { type: 'integer', minimum: 1, maximum: 1_000_000 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100 },
          sortDirection: { type: 'string', enum: ['asc', 'desc'] },
          status: { type: 'string', enum: ['draft', 'uploading', 'complete', 'expired', 'cancelled'] },
          storageProvider: { type: 'string', enum: ['s3', 'google_drive'] },
        },
      },
    },
  }, async (request) => {
    const ownerUserId = await requireOwner(request, config, dependencies, false)
    const input = parseListRecorderActivitiesInput(request.query)
    const result = await service(dependencies).listActivities(ownerUserId, input)
    return {
      data: result.activities,
      meta: {
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.ceil(result.totalRecords / input.pageSize),
        totalRecords: result.totalRecords,
      },
    }
  })

  app.get('/api/v1/recorder-activities/comparison-candidates', {
    schema: {
      querystring: {
        type: 'object', additionalProperties: false, required: ['reference'],
        properties: { reference: { type: 'string', minLength: 1, maxLength: 160 } },
      },
    },
  }, async (request) => {
    const ownerUserId = await requireOwner(request, config, dependencies, false)
    const input = parseCompareRecorderActivitiesInput(request.query)
    return { data: await service(dependencies).listComparisonCandidates(ownerUserId, input.reference) }
  })

  app.get('/api/v1/recorder-activities/:activityId', {
    schema: {
      params: {
        type: 'object', additionalProperties: false, required: ['activityId'],
        properties: { activityId: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (request) => {
    const ownerUserId = await requireOwner(request, config, dependencies, false)
    const { activityId } = request.params as { activityId: string }
    return { data: await service(dependencies).getActivity(ownerUserId, activityId) }
  })

  app.patch('/api/v1/recorder-activities/:activityId', {
    config: recorderMutationConfig,
    schema: {
      params: {
        type: 'object', additionalProperties: false, required: ['activityId'],
        properties: { activityId: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object', additionalProperties: false, minProperties: 1,
        properties: {
          notes: { type: ['string', 'null'], maxLength: 2_000 },
          occurredAt: { type: 'string', format: 'date-time' },
          operationType: { type: 'string', enum: ['packing', 'unpacking'] },
          reference: { type: ['string', 'null'], maxLength: 160 },
        },
      },
    },
  }, async (request) => {
    const ownerUserId = await requireOwner(request, config, dependencies, true)
    const { activityId } = request.params as { activityId: string }
    return { data: await service(dependencies).updateActivity(ownerUserId, activityId, parseUpdateRecorderActivityInput(request.body)) }
  })

  app.post('/api/v1/recorder-activities/:activityId/cancel', {
    config: recorderMutationConfig,
    schema: {
      params: {
        type: 'object', additionalProperties: false, required: ['activityId'],
        properties: { activityId: { type: 'string', format: 'uuid' } },
      },
      body: { type: 'object', additionalProperties: false },
    },
  }, async (request) => {
    const ownerUserId = await requireOwner(request, config, dependencies, true)
    const { activityId } = request.params as { activityId: string }
    return { data: await service(dependencies).cancelActivity(ownerUserId, activityId) }
  })

  app.delete('/api/v1/recorder-activities/:activityId', {
    config: recorderMutationConfig,
    schema: {
      params: {
        type: 'object', additionalProperties: false, required: ['activityId'],
        properties: { activityId: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (request, reply) => {
    const ownerUserId = await requireOwner(request, config, dependencies, true)
    const { activityId } = request.params as { activityId: string }
    const result = await service(dependencies).deleteActivity(ownerUserId, activityId)
    return reply.status(202).send({ data: result })
  })

  app.post('/api/v1/recorder-activities/:activityId/cleanup-retry', {
    config: recorderMutationConfig,
    schema: {
      params: {
        type: 'object', additionalProperties: false, required: ['activityId'],
        properties: { activityId: { type: 'string', format: 'uuid' } },
      },
      body: { type: 'object', additionalProperties: false },
    },
  }, async (request) => {
    const ownerUserId = await requireOwner(request, config, dependencies, true)
    const { activityId } = request.params as { activityId: string }
    return { data: await service(dependencies).retryCleanup(ownerUserId, activityId) }
  })

  app.get('/api/v1/recorder-activities/:activityId/audit-events', {
    schema: {
      params: {
        type: 'object', additionalProperties: false, required: ['activityId'],
        properties: { activityId: { type: 'string', format: 'uuid' } },
      },
    },
  }, async (request) => {
    const ownerUserId = await requireOwner(request, config, dependencies, false)
    const { activityId } = request.params as { activityId: string }
    return { data: await service(dependencies).listAuditEvents(ownerUserId, activityId) }
  })

  app.post('/api/v1/recorder-activities/:activityId/media-assets', {
    config: uploadMutationConfig,
    schema: {
      params: {
        type: 'object', additionalProperties: false, required: ['activityId'],
        properties: { activityId: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['mediaType', 'originalFilename', 'contentType', 'sizeBytes', 'sha256'],
        properties: {
          contentType: { type: 'string', minLength: 1, maxLength: 127 },
          mediaType: { type: 'string', enum: ['image', 'video'] },
          originalFilename: { type: 'string', minLength: 1, maxLength: 255 },
          sha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
          sizeBytes: { type: 'integer', minimum: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const ownerUserId = await requireOwner(request, config, dependencies, true)
    const { activityId } = request.params as { activityId: string }
    const result = await service(dependencies).createAsset(ownerUserId, activityId, parseCreateMediaAssetInput(request.body))
    return reply.status(201).send({ data: result })
  })

  app.post('/api/v1/recorder-activities/:activityId/complete', {
    config: recorderMutationConfig,
    schema: {
      params: {
        type: 'object', additionalProperties: false, required: ['activityId'],
        properties: { activityId: { type: 'string', format: 'uuid' } },
      },
      body: { type: 'object', additionalProperties: false },
    },
  }, async (request) => {
    const ownerUserId = await requireOwner(request, config, dependencies, true)
    const { activityId } = request.params as { activityId: string }
    return { data: await service(dependencies).completeActivity(ownerUserId, activityId) }
  })

  app.post('/api/v1/media-assets/:assetId/upload-attempts', {
    config: uploadMutationConfig,
    schema: { params: uuidParams, body: { type: 'object', additionalProperties: false } },
  }, async (request, reply) => {
    const ownerUserId = await requireOwner(request, config, dependencies, true)
    const { assetId } = request.params as { assetId: string }
    const result = await service(dependencies).retryAsset(ownerUserId, assetId)
    return reply.status(201).send({ data: result })
  })

  app.post('/api/v1/media-assets/:assetId/upload-attempts/:attemptId/finalize', {
    config: uploadMutationConfig,
    schema: {
      params: {
        type: 'object', additionalProperties: false, required: ['assetId', 'attemptId'],
        properties: {
          assetId: { type: 'string', format: 'uuid' },
          attemptId: { type: 'string', format: 'uuid' },
        },
      },
      body: { type: 'object', additionalProperties: false },
    },
  }, async (request) => {
    const ownerUserId = await requireOwner(request, config, dependencies, true)
    const { assetId, attemptId } = request.params as { assetId: string; attemptId: string }
    return { data: await service(dependencies).finalizeAsset(ownerUserId, assetId, attemptId) }
  })

  app.get('/api/v1/media-assets/:assetId/content', {
    schema: { params: uuidParams },
  }, async (request, reply) => {
    const ownerUserId = await requireOwner(request, config, dependencies, false)
    const { assetId } = request.params as { assetId: string }
    const download = await service(dependencies).retrieveAsset(ownerUserId, assetId)
    if ('body' in download) {
      const disposition = (request.query as { download?: string }).download === '1' ? 'attachment' : 'inline'
      const filename = encodeURIComponent((download.filename ?? 'evidence').replace(/[\r\n/\\]/g, '_')).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
      return reply.type(download.contentType).header('content-length', download.sizeBytes).header('content-disposition', `${disposition}; filename*=UTF-8''${filename}`).send(download.body)
    }
    return reply.status(307).header('location', download.url).header('cache-control', 'no-store').send()
  })
}
