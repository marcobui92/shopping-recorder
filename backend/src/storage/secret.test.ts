import assert from 'node:assert/strict'
import test from 'node:test'
import { randomBytes } from 'node:crypto'
import { decryptSecret, encryptSecret } from './secret.js'

test('encrypted secrets round-trip and do not contain plaintext', () => {
  const key = randomBytes(32)
  const value = 'refresh-token-value'
  const encrypted = encryptSecret(value, key)
  assert.notEqual(encrypted.ciphertext, value)
  assert.equal(decryptSecret(encrypted, key), value)
  assert.throws(() => decryptSecret(encrypted, randomBytes(32)))
})

test('secret encryption requires a 32-byte key', () => {
  assert.throws(() => encryptSecret('token', Buffer.alloc(31)), /32 bytes/)
})
