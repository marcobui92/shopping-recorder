import assert from 'node:assert/strict'
import test from 'node:test'

import { readCookie, sessionTokenDigest } from './session.js'

test('session cookie parsing matches an exact name and fails closed on malformed encoding', () => {
  assert.equal(readCookie('other_recorder_session=wrong; recorder_session=valid%20token', 'recorder_session'), 'valid token')
  assert.equal(readCookie('recorder_session=%E0%A4%A', 'recorder_session'), null)
  assert.equal(readCookie('recorder_session_backup=wrong', 'recorder_session'), null)
})

test('session tokens are represented by a deterministic SHA-256 digest', () => {
  const token = 'a'.repeat(48)
  const digest = sessionTokenDigest(token)
  assert.match(digest, /^[0-9a-f]{64}$/)
  assert.notEqual(digest, token)
  assert.equal(digest, sessionTokenDigest(token))
  assert.notEqual(digest, sessionTokenDigest(`${token}b`))
})
