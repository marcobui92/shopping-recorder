import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { buildApp } from '../app.js'
import type { AppConfig } from '../config.js'
import type { AppUser, AuthRepository } from './repository.js'
import { AuthService } from './service.js'
import { readCookie, sessionCookieName, sessionTokenDigest } from './session.js'

const origin = 'http://localhost:5173'
const config: AppConfig = {
  corsOrigin: origin, host: '127.0.0.1', logLevel: 'silent' as AppConfig['logLevel'], nodeEnv: 'test', port: 3000,
  trustProxy: false,
}

class MemoryAuthRepository implements AuthRepository {
  users: AppUser[] = []
  sessions = new Map<string, string>()

  async createUser(username: string, usernameNormalized: string, email: string | null, passwordHash: string) {
    if (this.users.some((user) => user.usernameNormalized === usernameNormalized)) throw { code: '23505' }
    const user: AppUser = { email, id: randomUUID(), passwordHash, status: 'active', username, usernameNormalized }
    this.users.push(user)
    return user
  }

  async findUserById(userId: string) { return this.users.find((user) => user.id === userId) ?? null }
  async findUserByUsername(username: string) { return this.users.find((user) => user.usernameNormalized === username) ?? null }
  async createSession(userId: string, digest: string) { this.sessions.set(digest, userId) }
  async revokeSession(digest: string) { this.sessions.delete(digest) }
}

function fixture() {
  const repository = new MemoryAuthRepository()
  const service = new AuthService(repository)
  const authenticate = async (request: { headers: { cookie?: string } }) => {
    const token = readCookie(request.headers.cookie, sessionCookieName)
    return token ? repository.sessions.get(sessionTokenDigest(token)) ?? null : null
  }
  return { app: buildApp(config, { auth: { authenticate, service } }), repository }
}

test('registration hashes the password, creates a persistent session, and returns the current user', async () => {
  const { app, repository } = fixture()
  const registered = await app.inject({
    method: 'POST', url: '/api/v1/auth/register', headers: { origin },
    payload: { email: ' Operator@Example.com ', password: 'correct horse battery staple', username: 'Warehouse.One' },
  })
  assert.equal(registered.statusCode, 201)
  assert.equal(registered.json().data.user.email, 'operator@example.com')
  assert.doesNotMatch(repository.users[0].passwordHash, /correct horse battery staple/)
  const setCookie = registered.headers['set-cookie']
  const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie
  const cookie = cookieHeader?.split(';')[0]
  assert.match(cookie ?? '', /^recorder_session=/)
  assert.match(cookieHeader ?? '', /HttpOnly/)
  assert.match(cookieHeader ?? '', /SameSite=Lax/)

  const current = await app.inject({ method: 'GET', url: '/api/v1/auth/session', headers: { cookie } })
  assert.equal(current.statusCode, 200)
  assert.equal(current.json().data.user.username, 'Warehouse.One')
  assert.equal(current.headers['cache-control'], 'no-store')
  await app.close()
})

test('authentication accepts a six-character password and rejects five characters', async () => {
  const { app } = fixture()
  const accepted = await app.inject({
    method: 'POST', url: '/api/v1/auth/register', headers: { origin },
    payload: { password: 'abc123', username: 'six-character-password' },
  })
  assert.equal(accepted.statusCode, 201)

  const rejected = await app.inject({
    method: 'POST', url: '/api/v1/auth/register', headers: { origin },
    payload: { password: 'abc12', username: 'five-character-password' },
  })
  assert.equal(rejected.statusCode, 400)
  assert.equal(rejected.json().error.code, 'VALIDATION_ERROR')
  await app.close()
})

test('login is generic for invalid credentials and logout revokes the session', async () => {
  const { app } = fixture()
  await app.inject({
    method: 'POST', url: '/api/v1/auth/register', headers: { origin },
    payload: { password: 'correct horse battery staple', username: 'operator-two' },
  })
  const invalid = await app.inject({
    method: 'POST', url: '/api/v1/auth/login', headers: { origin },
    payload: { password: 'incorrect password value', username: 'operator-two' },
  })
  assert.equal(invalid.statusCode, 401)
  assert.equal(invalid.json().error.code, 'INVALID_CREDENTIALS')

  const loggedIn = await app.inject({
    method: 'POST', url: '/api/v1/auth/login', headers: { origin },
    payload: { password: 'correct horse battery staple', username: 'OPERATOR-TWO' },
  })
  const setCookie = loggedIn.headers['set-cookie']
  const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(';')[0]
  const loggedOut = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie, origin } })
  assert.equal(loggedOut.statusCode, 204)
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/auth/session', headers: { cookie } })).statusCode, 401)
  await app.close()
})

test('authentication mutations reject a cross-origin request', async () => {
  const { app } = fixture()
  const response = await app.inject({
    method: 'POST', url: '/api/v1/auth/register', headers: { origin: 'https://evil.example' },
    payload: { password: 'correct horse battery staple', username: 'operator-three' },
  })
  assert.equal(response.statusCode, 403)
  assert.equal(response.json().error.code, 'CSRF_VALIDATION_FAILED')
  await app.close()
})
