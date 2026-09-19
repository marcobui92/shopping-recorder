import { GoogleDriveClient, GoogleReauthorizationError } from './client.js'
import type { GoogleDriveConfig } from '../config.js'
import { decryptSecret, encryptSecret } from '../storage/secret.js'
import { authorizationUrl, createOAuthState, exchangeAuthorizationCode, hashOAuthState } from './oauth.js'
import type { GoogleConnectionStore } from './repository.js'

export class GoogleDriveService {
  constructor(private readonly config: GoogleDriveConfig, private readonly repository: GoogleConnectionStore, private readonly fetchImpl: typeof fetch = fetch) {}

  async connectionState(userId: string): Promise<'disconnected' | 'connected' | 'reauthorization_required' | 'unavailable'> {
    const connection = await this.repository.get(userId)
    if (!connection) return 'disconnected'
    try {
      const root = await new GoogleDriveClient(this.config, this.fetchImpl).metadata(connection, connection.rootFolderId)
      return root.trashed ? 'unavailable' : 'connected'
    } catch (error) { return error instanceof GoogleReauthorizationError ? 'reauthorization_required' : 'unavailable' }
  }

  async begin(userId: string): Promise<string> {
    const state = createOAuthState()
    await this.repository.saveOAuthState(state.stateHash, userId, state.codeVerifier, new Date(Date.now() + this.config.oauthStateTtlSeconds * 1000))
    return authorizationUrl(this.config, state)
  }

  async complete(stateValue: string, code: string, userId: string): Promise<string> {
    const state = await this.repository.consumeOAuthState(hashOAuthState(stateValue), userId)
    if (!state) throw new Error('GOOGLE_OAUTH_STATE_INVALID')
    const token = await exchangeAuthorizationCode(this.config, code, state.codeVerifier, this.fetchImpl)
    const existing = await this.repository.get(state.userId)
    const about = await this.fetchImpl('https://www.googleapis.com/drive/v3/about?fields=user%2FpermissionId', { headers: { authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(10_000) })
    if (!about.ok) throw new Error(`GOOGLE_ACCOUNT_LOOKUP_FAILED:${about.status}`)
    const aboutPayload = await about.json() as { user?: { permissionId?: string } }
    const providerAccountId = aboutPayload.user?.permissionId
    if (!providerAccountId) throw new Error('GOOGLE_ACCOUNT_ID_MISSING')
    const sameAccount = existing?.providerAccountId === providerAccountId
    const refreshToken = token.refresh_token ?? (existing && sameAccount ? decryptSecret({ ciphertext: existing.encryptedRefreshToken, iv: existing.refreshTokenIv, tag: existing.refreshTokenTag, version: existing.encryptionKeyVersion }, this.config.tokenEncryptionKey) : null)
    if (!refreshToken) throw new Error('GOOGLE_REFRESH_TOKEN_MISSING')
    let rootFolderId = sameAccount ? existing!.rootFolderId : null
    if (rootFolderId) {
      const root = await this.fetchImpl(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(rootFolderId)}?fields=id,trashed`, { headers: { authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(10_000) })
      if (root.status === 404 || (root.ok && (await root.json() as { trashed?: boolean }).trashed)) rootFolderId = null
      else if (!root.ok) throw new Error('GOOGLE_FOLDER_LOOKUP_FAILED')
    }
    if (!rootFolderId) {
      const q = `trashed = false and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='recorderOwner' and value='${state.userId.replace(/'/g, "\\'")}' }`
      const lookup = await this.fetchImpl(`https://www.googleapis.com/drive/v3/files?${new URLSearchParams({ q, fields: 'files(id)', pageSize: '1' })}`, { headers: { authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(10_000) })
      if (!lookup.ok) throw new Error('GOOGLE_FOLDER_LOOKUP_FAILED')
      rootFolderId = (await lookup.json() as { files?: { id: string }[] }).files?.[0]?.id ?? null
    }
    if (!rootFolderId) {
      const folder = await this.fetchImpl('https://www.googleapis.com/drive/v3/files', {
        signal: AbortSignal.timeout(10_000), method: 'POST', headers: { authorization: `Bearer ${token.access_token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Shopping Recorder', mimeType: 'application/vnd.google-apps.folder', appProperties: { recorderOwner: state.userId } }),
      })
      if (!folder.ok) throw new Error(`GOOGLE_FOLDER_CREATE_FAILED:${folder.status}`)
      const folderPayload = await folder.json() as { id?: string }
      if (!folderPayload.id) throw new Error('GOOGLE_FOLDER_ID_MISSING')
      rootFolderId = folderPayload.id
    }
    const encrypted = encryptSecret(refreshToken, this.config.tokenEncryptionKey)
    await this.repository.upsert(state.userId, { providerAccountId, encryptedRefreshToken: encrypted.ciphertext, refreshTokenIv: encrypted.iv, refreshTokenTag: encrypted.tag, encryptionKeyVersion: encrypted.version, rootFolderId })
    return state.userId
  }

  async revoke(userId: string): Promise<void> {
    const connection = await this.repository.get(userId)
    if (!connection) return
    const refreshToken = decryptSecret({ ciphertext: connection.encryptedRefreshToken, iv: connection.refreshTokenIv, tag: connection.refreshTokenTag, version: connection.encryptionKeyVersion }, this.config.tokenEncryptionKey)
    const response = await this.fetchImpl('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: refreshToken }), signal: AbortSignal.timeout(10_000) })
    if (!response.ok && response.status !== 400) throw new Error(`GOOGLE_REVOKE_FAILED:${response.status}`)
  }
}
