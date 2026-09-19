export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'

export interface S3Config {
  accessKeyId: string
  bucket: string
  downloadExpiresSeconds: number
  endpoint: string
  maxImageBytes: number
  maxVideoBytes: number
  region: string
  secretAccessKey: string
  uploadExpiresSeconds: number
}

export interface GoogleDriveConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  tokenEncryptionKey: Buffer
  oauthStateTtlSeconds: number
}

export interface AppConfig {
  corsOrigin: string
  databaseUrl?: string
  host: string
  logLevel: LogLevel
  nodeEnv: 'development' | 'test' | 'production'
  port: number
  googleDrive?: GoogleDriveConfig
  s3?: S3Config
  trustProxy: boolean
}

const logLevels = new Set<LogLevel>(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
const nodeEnvironments = new Set<AppConfig['nodeEnv']>(['development', 'test', 'production'])

function readPort(value: string | undefined): number {
  const port = Number(value ?? '3000')

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.')
  }

  return port
}

function readDatabaseUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  try {
    const url = new URL(value)
    if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
      throw new Error('DATABASE_URL must use the postgres or postgresql protocol.')
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('DATABASE_URL')) {
      throw error
    }
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.')
  }

  return value
}

function readBoolean(value: string | undefined, name: string, defaultValue: boolean): boolean {
  if (value === undefined || value === '') return defaultValue
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error(`${name} must be true or false.`)
}

function readInteger(
  value: string | undefined,
  name: string,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined || value === '') return defaultValue
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer.`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`)
  }
  return parsed
}

function readS3Config(environment: NodeJS.ProcessEnv): S3Config | undefined {
  const accessKeyId = environment.B2_APPLICATION_KEY_ID?.trim()
  const bucket = environment.B2_BUCKET_NAME?.trim()
  const region = environment.B2_REGION?.trim()
  const secretAccessKey = environment.B2_APPLICATION_KEY?.trim()

  if (!accessKeyId && !bucket && !region && !secretAccessKey) return undefined
  if (!accessKeyId || !bucket || !region || !secretAccessKey) {
    throw new Error('B2_REGION, B2_BUCKET_NAME, B2_APPLICATION_KEY_ID, and B2_APPLICATION_KEY are all required when Backblaze B2 is configured.')
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(region)) {
    throw new Error('B2_REGION must be a valid Backblaze region such as us-west-004.')
  }

  return {
    accessKeyId,
    bucket,
    downloadExpiresSeconds: readInteger(environment.B2_DOWNLOAD_EXPIRES_SECONDS, 'B2_DOWNLOAD_EXPIRES_SECONDS', 300, 60, 3600),
    endpoint: `https://s3.${region}.backblazeb2.com`,
    maxImageBytes: readInteger(environment.B2_MAX_IMAGE_BYTES, 'B2_MAX_IMAGE_BYTES', 25 * 1024 * 1024, 1, Number.MAX_SAFE_INTEGER),
    maxVideoBytes: readInteger(environment.B2_MAX_VIDEO_BYTES, 'B2_MAX_VIDEO_BYTES', 500 * 1024 * 1024, 1, Number.MAX_SAFE_INTEGER),
    region,
    secretAccessKey,
    uploadExpiresSeconds: readInteger(environment.B2_UPLOAD_EXPIRES_SECONDS, 'B2_UPLOAD_EXPIRES_SECONDS', 900, 60, 3600),
  }
}

function readGoogleDriveConfig(environment: NodeJS.ProcessEnv): GoogleDriveConfig | undefined {
  const clientId = environment.GOOGLE_CLIENT_ID?.trim()
  const clientSecret = environment.GOOGLE_CLIENT_SECRET?.trim()
  const redirectUri = environment.GOOGLE_REDIRECT_URI?.trim()
  const encodedKey = environment.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim()
  if (!clientId && !clientSecret && !redirectUri && !encodedKey) return undefined
  if (!clientId || !clientSecret || !redirectUri || !encodedKey) {
    throw new Error('GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, and GOOGLE_TOKEN_ENCRYPTION_KEY are all required when Google Drive is configured.')
  }
  let tokenEncryptionKey: Buffer
  try { tokenEncryptionKey = Buffer.from(encodedKey, 'base64') } catch { throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must be base64 encoded.') }
  if (tokenEncryptionKey.length !== 32) throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.')
  try {
    const url = new URL(redirectUri)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error()
  } catch { throw new Error('GOOGLE_REDIRECT_URI must be a valid HTTP(S) URL.') }
  return {
    clientId,
    clientSecret,
    redirectUri,
    tokenEncryptionKey,
    oauthStateTtlSeconds: readInteger(environment.GOOGLE_OAUTH_STATE_TTL_SECONDS, 'GOOGLE_OAUTH_STATE_TTL_SECONDS', 600, 60, 1800),
  }
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = (environment.NODE_ENV ?? 'development') as AppConfig['nodeEnv']
  const logLevel = (environment.LOG_LEVEL ?? 'info') as LogLevel
  const host = environment.HOST ?? '127.0.0.1'
  const corsOrigin = environment.CORS_ORIGIN ?? 'http://localhost:5173'
  const databaseUrl = readDatabaseUrl(environment.DATABASE_URL)
  const s3 = readS3Config(environment)
  const googleDrive = readGoogleDriveConfig(environment)
  const trustProxy = readBoolean(environment.TRUST_PROXY, 'TRUST_PROXY', false)

  if (!nodeEnvironments.has(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test, or production.')
  }
  if (!logLevels.has(logLevel)) {
    throw new Error('LOG_LEVEL must be fatal, error, warn, info, debug, or trace.')
  }
  if (!host.trim()) {
    throw new Error('HOST must not be empty.')
  }
  if (!corsOrigin.trim()) {
    throw new Error('CORS_ORIGIN must not be empty.')
  }
  if (nodeEnv === 'production') {
    if (!databaseUrl) throw new Error('DATABASE_URL is required in production.')
    if (!s3) throw new Error('Backblaze B2 configuration is required in production.')
    if (!corsOrigin.startsWith('https://')) throw new Error('CORS_ORIGIN must use HTTPS in production.')
  }

  return {
    corsOrigin,
    databaseUrl,
    host,
    logLevel,
    nodeEnv,
    port: readPort(environment.PORT),
    googleDrive,
    s3,
    trustProxy,
  }
}
