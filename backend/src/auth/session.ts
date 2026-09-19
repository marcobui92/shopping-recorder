import { createHash } from 'node:crypto'

import type { Pool } from 'pg'

export const sessionCookieName = 'recorder_session'

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue
    try {
      return decodeURIComponent(part.slice(separator + 1).trim())
    } catch {
      return null
    }
  }
  return null
}

export function sessionTokenDigest(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export interface SessionRequest {
  headers: { cookie?: string }
}

export type SessionAuthenticator = (request: SessionRequest) => Promise<string | null>

export function createPostgresSessionAuthenticator(pool: Pool): SessionAuthenticator {
  return async (request) => {
    const token = readCookie(request.headers.cookie, sessionCookieName)
    if (!token || token.length < 32 || token.length > 256) return null
    const digest = sessionTokenDigest(token)
    const result = await pool.query<{ user_id: string }>(`
      UPDATE user_sessions s
      SET last_seen_at = now(), idle_expires_at = LEAST(now() + interval '30 days', s.absolute_expires_at)
      FROM app_users u
      WHERE s.token_digest = $1
        AND s.user_id = u.id
        AND u.status = 'active'
        AND s.revoked_at IS NULL
        AND s.idle_expires_at > now()
        AND s.absolute_expires_at > now()
      RETURNING s.user_id
    `, [digest])
    return result.rows[0]?.user_id ?? null
  }
}
