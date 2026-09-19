import type { Pool } from 'pg'

export interface AppUser {
  email: string | null
  id: string
  passwordHash: string
  status: 'active' | 'disabled'
  username: string
  usernameNormalized: string
}

export interface AuthRepository {
  createSession(userId: string, tokenDigest: string, idleExpiresAt: string, absoluteExpiresAt: string): Promise<void>
  createUser(username: string, usernameNormalized: string, email: string | null, passwordHash: string): Promise<AppUser>
  findUserById(userId: string): Promise<AppUser | null>
  findUserByUsername(usernameNormalized: string): Promise<AppUser | null>
  revokeSession(tokenDigest: string): Promise<void>
}

interface UserRow {
  email: string | null
  id: string
  password_hash: string
  status: AppUser['status']
  username: string
  username_normalized: string
}

function toUser(row: UserRow): AppUser {
  return {
    email: row.email,
    id: row.id,
    passwordHash: row.password_hash,
    status: row.status,
    username: row.username,
    usernameNormalized: row.username_normalized,
  }
}

const userColumns = 'id, username, username_normalized, email, password_hash, status'

export class PostgresAuthRepository implements AuthRepository {
  constructor(private readonly pool: Pool) {}

  async createUser(username: string, usernameNormalized: string, email: string | null, passwordHash: string): Promise<AppUser> {
    const result = await this.pool.query<UserRow>(`
      INSERT INTO app_users (username, username_normalized, email, password_hash)
      VALUES ($1, $2, $3, $4)
      RETURNING ${userColumns}
    `, [username, usernameNormalized, email, passwordHash])
    return toUser(result.rows[0])
  }

  async findUserById(userId: string): Promise<AppUser | null> {
    const result = await this.pool.query<UserRow>(`
      SELECT ${userColumns} FROM app_users WHERE id = $1
    `, [userId])
    return result.rows[0] ? toUser(result.rows[0]) : null
  }

  async findUserByUsername(usernameNormalized: string): Promise<AppUser | null> {
    const result = await this.pool.query<UserRow>(`
      SELECT ${userColumns} FROM app_users WHERE username_normalized = $1
    `, [usernameNormalized])
    return result.rows[0] ? toUser(result.rows[0]) : null
  }

  async createSession(userId: string, tokenDigest: string, idleExpiresAt: string, absoluteExpiresAt: string): Promise<void> {
    await this.pool.query(`
      INSERT INTO user_sessions (user_id, token_digest, idle_expires_at, absolute_expires_at)
      VALUES ($1, $2, $3, $4)
    `, [userId, tokenDigest, idleExpiresAt, absoluteExpiresAt])
  }

  async revokeSession(tokenDigest: string): Promise<void> {
    await this.pool.query(`
      UPDATE user_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE token_digest = $1
    `, [tokenDigest])
  }
}
