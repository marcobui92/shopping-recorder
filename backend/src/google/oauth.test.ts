import assert from 'node:assert/strict'
import test from 'node:test'
import { randomBytes } from 'node:crypto'
import { authorizationUrl, createOAuthState, driveFileScope, exchangeAuthorizationCode, hashOAuthState } from './oauth.js'

const config = {
  clientId: 'client-id', clientSecret: 'client-secret', redirectUri: 'http://localhost:3000/api/v1/google-drive/callback',
  tokenEncryptionKey: randomBytes(32), oauthStateTtlSeconds: 600,
}

test('authorization URL uses Drive file scope, offline consent, and PKCE', () => {
  const state = createOAuthState()
  const params = new URL(authorizationUrl(config, state)).searchParams
  assert.equal(params.get('scope'), driveFileScope)
  assert.equal(params.get('access_type'), 'offline')
  assert.equal(params.get('prompt'), 'consent')
  assert.equal(params.get('code_challenge_method'), 'S256')
  assert.equal(params.get('state'), state.state)
  assert.equal(hashOAuthState(state.state), state.stateHash)
})

test('token exchange rejects provider errors and validates response shape', async () => {
  const failingFetch = async () => new Response('{}', { status: 400 })
  await assert.rejects(exchangeAuthorizationCode(config, 'code', 'verifier', failingFetch as typeof fetch), /GOOGLE_TOKEN_EXCHANGE_FAILED:400/)
  const validFetch = async () => new Response(JSON.stringify({ access_token: 'access', expires_in: 3600, token_type: 'Bearer' }), { status: 200 })
  const token = await exchangeAuthorizationCode(config, 'code', 'verifier', validFetch as typeof fetch)
  assert.equal(token.access_token, 'access')
})
