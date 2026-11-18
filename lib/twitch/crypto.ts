import crypto from 'node:crypto'

if (typeof window !== 'undefined') {
  throw new Error('lib/twitch/crypto.ts must only be imported on the server.')
}

export function getTwitchEncryptionKey(): Buffer {
  const secret = process.env.TWITCH_TOKEN_ENCRYPTION_KEY?.trim() || ''
  if (secret.length < 32) {
    throw new Error(
      'Missing or weak TWITCH_TOKEN_ENCRYPTION_KEY server environment variable.',
    )
  }

  return crypto.createHash('sha256').update(secret, 'utf8').digest()
}

export function encryptTwitchValue(value: unknown): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getTwitchEncryptionKey(), iv)
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return [iv, authTag, encrypted]
    .map((part) => part.toString('base64url'))
    .join('.')
}

export function decryptTwitchValue<T>(encoded: string): T | null {
  try {
    const [ivEncoded, authTagEncoded, encryptedEncoded] = encoded.split('.')
    if (!ivEncoded || !authTagEncoded || !encryptedEncoded) return null

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      getTwitchEncryptionKey(),
      Buffer.from(ivEncoded, 'base64url'),
    )
    decipher.setAuthTag(Buffer.from(authTagEncoded, 'base64url'))
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedEncoded, 'base64url')),
      decipher.final(),
    ]).toString('utf8')

    return JSON.parse(decrypted) as T
  } catch {
    return null
  }
}
