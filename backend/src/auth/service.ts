import { randomBytes } from 'node:crypto'

import argon2 from 'argon2'

import { AppError } from '../errors.js'
import type { AppUser, AuthRepository } from './repository.js'
import { sessionTokenDigest } from './session.js'

const idleMilliseconds = 30 * 24 * 60 * 60 * 1_000
const absoluteMilliseconds = 90 * 24 * 60 * 60 * 1_000

export interface PublicUser {
  email: string | null
  id: string
  username: string
}

export interface AuthResult {
  token: string
  user: PublicUser
}

function publicUser(user: AppUser): PublicUser {
  return { email: user.email, id: user.id, username: user.username }
}

function normalizeUsername(value: unknown): { normalized: string; username: string } {
  if (typeof value !== 'string') throw new AppError(400, 'VALIDATION_ERROR', 'username is required.')
  const username = value.trim()
  if (!/^[A-Za-z0-9._-]{3,64}$/.test(username)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'username must be 3–64 characters using letters, numbers, dot, underscore, or hyphen.')
  }
  return { normalized: username.toLowerCase(), username }
}

function normalizeEmail(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw new AppError(400, 'VALIDATION_ERROR', 'email must be a string.')
  const email = value.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'email must be a valid email address.')
  }
  return email
}

function readPassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 6 || value.length > 128) {
    throw new AppError(400, 'VALIDATION_ERROR', 'password must be between 6 and 128 characters.')
  }
  return value
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === '23505')
}

export class AuthService {
  constructor(private readonly repository: AuthRepository) {}

  private async issueSession(user: AppUser): Promise<AuthResult> {
    const token = randomBytes(32).toString('base64url')
    const now = Date.now()
    await this.repository.createSession(
      user.id,
      sessionTokenDigest(token),
      new Date(now + idleMilliseconds).toISOString(),
      new Date(now + absoluteMilliseconds).toISOString(),
    )
    return { token, user: publicUser(user) }
  }

  async register(value: unknown): Promise<AuthResult> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'An account object is required.')
    }
    const input = value as Record<string, unknown>
    const { normalized, username } = normalizeUsername(input.username)
    const password = readPassword(input.password)
    const email = normalizeEmail(input.email)
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id })
    let user: AppUser
    try {
      user = await this.repository.createUser(username, normalized, email, passwordHash)
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError(409, 'USERNAME_TAKEN', 'That username is already in use.')
      throw error
    }
    return this.issueSession(user)
  }

  async login(value: unknown): Promise<AuthResult> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Login credentials are required.')
    }
    const input = value as Record<string, unknown>
    const { normalized } = normalizeUsername(input.username)
    const password = readPassword(input.password)
    const user = await this.repository.findUserByUsername(normalized)
    if (!user || user.status !== 'active' || !await argon2.verify(user.passwordHash, password)) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'The username or password is incorrect.')
    }
    return this.issueSession(user)
  }

  async currentUser(userId: string): Promise<PublicUser> {
    const user = await this.repository.findUserById(userId)
    if (!user || user.status !== 'active') throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.')
    return publicUser(user)
  }

  async logout(token: string | null): Promise<void> {
    if (token) await this.repository.revokeSession(sessionTokenDigest(token))
  }
}
