import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const algorithm = 'aes-256-gcm'

export interface EncryptedSecret {
  ciphertext: string
  iv: string
  tag: string
  version: number
}

export function encryptSecret(value: string, key: Buffer, version = 1): EncryptedSecret {
  if (key.length !== 32) throw new Error('Secret encryption key must be 32 bytes.')
  const iv = randomBytes(12)
  const cipher = createCipheriv(algorithm, key, iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return { ciphertext: ciphertext.toString('base64url'), iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), version }
}

export function decryptSecret(secret: EncryptedSecret, key: Buffer): string {
  if (key.length !== 32) throw new Error('Secret encryption key must be 32 bytes.')
  const decipher = createDecipheriv(algorithm, key, Buffer.from(secret.iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(secret.tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(secret.ciphertext, 'base64url')), decipher.final()]).toString('utf8')
}
