import { DriveMediaStorage } from './storage/drive.js'
import { DriveUploadService } from './google/upload.js'
import 'dotenv/config'

import { Pool } from 'pg'

import { buildApp } from './app.js'
import { PostgresAuthRepository } from './auth/repository.js'
import { AuthService } from './auth/service.js'
import { createPostgresSessionAuthenticator } from './auth/session.js'
import { loadConfig } from './config.js'
import { PostgresRecorderRepository } from './recorder/repository.js'
import { RecorderMediaService } from './recorder/service.js'
import { B2MediaStorage } from './storage/s3.js'
import { GoogleConnectionRepository } from './google/repository.js'
import { GoogleDriveService } from './google/service.js'

async function start() {
  const config = loadConfig()
  const pool = config.databaseUrl ? new Pool({ connectionString: config.databaseUrl }) : undefined
  const recorderRepository = pool ? new PostgresRecorderRepository(pool) : undefined
  const authRepository = pool ? new PostgresAuthRepository(pool) : undefined
  const s3Storage = config.s3 ? new B2MediaStorage(config.s3) : undefined
  const googleRepository = pool ? new GoogleConnectionRepository(pool) : undefined
  const googleService = config.googleDrive && googleRepository ? new GoogleDriveService(config.googleDrive, googleRepository) : undefined
  const driveStorage = config.googleDrive && googleRepository ? new DriveMediaStorage(config.googleDrive, googleRepository, undefined, config.corsOrigin) : undefined
  const recorderService = recorderRepository
    ? new RecorderMediaService(recorderRepository, [...(s3Storage ? [s3Storage] : []), ...(driveStorage ? [driveStorage] : [])], config.s3)
    : undefined
  const app = buildApp(config, {
    driveUpload: config.googleDrive && pool && googleRepository ? new DriveUploadService(pool, config.googleDrive, googleRepository) : undefined,
    auth: {
      authenticate: pool ? createPostgresSessionAuthenticator(pool) : undefined,
      service: authRepository ? new AuthService(authRepository) : undefined,
    },
    recorder: {
      authenticate: pool ? createPostgresSessionAuthenticator(pool) : undefined,
      service: recorderService,
    },
    google: {
      authenticate: pool ? createPostgresSessionAuthenticator(pool) : undefined,
      repository: googleRepository,
      service: googleService,
    },
    readiness: async () => {
      if (!pool || !s3Storage) throw new Error('Required production dependencies are unavailable.')
      await pool.query('SELECT 1')
    },
  })

  let stopping = false
  let retentionSweepRunning = false
  let retentionTimer: NodeJS.Timeout | undefined
  const runRetentionSweep = async () => {
    if (!recorderService || retentionSweepRunning) return
    retentionSweepRunning = true
    try {
      const result = await recorderService.runRetentionSweep()
      if (result.expiredActivities || result.cleanupPending) app.log.info(result, 'Evidence retention sweep completed')
    } catch (error) {
      app.log.error(error, 'Evidence retention sweep failed')
    } finally {
      retentionSweepRunning = false
    }
  }
  const stop = async (signal: NodeJS.Signals) => {
    if (stopping) return
    stopping = true
    app.log.info({ signal }, 'Graceful shutdown started')
    try {
      await app.close()
    } catch (error) {
      app.log.error(error, 'Graceful shutdown failed')
      process.exitCode = 1
    }
  }
  const stopOnSigterm = () => { void stop('SIGTERM') }
  const stopOnSigint = () => { void stop('SIGINT') }
  process.once('SIGTERM', stopOnSigterm)
  process.once('SIGINT', stopOnSigint)
  app.addHook('onClose', async () => {
    if (retentionTimer) clearInterval(retentionTimer)
    process.removeListener('SIGTERM', stopOnSigterm)
    process.removeListener('SIGINT', stopOnSigint)
  })

  if (pool) {
    app.addHook('onClose', async () => {
      await pool.end()
    })
  }

  try {
    await app.listen({ host: config.host, port: config.port })
    if (recorderService) {
      void runRetentionSweep()
      retentionTimer = setInterval(() => { void runRetentionSweep() }, 60 * 60 * 1000)
      retentionTimer.unref()
    }
  } catch (error) {
    app.log.error(error)
    process.exitCode = 1
    await app.close().catch(() => undefined)
  }
}

void start()
