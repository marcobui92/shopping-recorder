import { createHash, randomBytes } from 'node:crypto'
import type { GoogleDriveConfig } from '../config.js'

export const driveFileScope = 'https://www.googleapis.com/auth/drive.file'

export interface OAuthState {
  state: string
  stateHash: string
  codeVerifier: string
  codeChallenge: string
}

export interface GoogleTokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope?: string
  token_type: string
}

export function createOAuthState(): OAuthState {
  const state = randomBytes(32).toString('base64url')
  const codeVerifier = randomBytes(48).toString('base64url')
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
  return { state, stateHash: hashOAuthState(state), codeVerifier, codeChallenge }
}

export function hashOAuthState(state: string): string {
  return createHash('sha256').update(state).digest('hex')
}

export function authorizationUrl(config: GoogleDriveConfig, state: OAuthState): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    access_type: 'offline',
    client_id: config.clientId,
    code_challenge: state.codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'consent',
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: driveFileScope,
    state: state.state,
  }).toString()
  return url.toString()
}

export async function exchangeAuthorizationCode(
  config: GoogleDriveConfig,
  code: string,
  codeVerifier: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleTokenResponse> {
  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`GOOGLE_TOKEN_EXCHANGE_FAILED:${response.status}`)
  const payload = await response.json() as Partial<GoogleTokenResponse>
  if (typeof payload.access_token !== 'string' || typeof payload.expires_in !== 'number' || payload.token_type?.toLowerCase() !== 'bearer' || !payload.access_token || !Number.isFinite(payload.expires_in) || payload.expires_in <= 0) {
    throw new Error('GOOGLE_TOKEN_RESPONSE_INVALID')
  }
  if (payload.scope && !payload.scope.split(' ').includes(driveFileScope)) throw new Error('GOOGLE_DRIVE_SCOPE_MISSING')
  return payload as GoogleTokenResponse
}
