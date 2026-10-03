import type { AppUser } from './api'

const storageKey = 'shopping-recorder-session-user'

export type SessionStatus = 'checking' | 'verified' | 'anonymous'

export function readRememberedUser(): AppUser | null {
  try {
    const raw = sessionStorage.getItem(storageKey)
    if (!raw) return null
    const value = JSON.parse(raw) as { id?: unknown; username?: unknown; email?: unknown }
    if (typeof value.id !== 'string' || typeof value.username !== 'string') return null
    if (value.email !== undefined && value.email !== null && typeof value.email !== 'string') return null
    return { email: (value.email as string | null | undefined) ?? null, id: value.id, username: value.username }
  } catch {
    return null
  }
}

export function saveRememberedUser(user: AppUser): void {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify({ email: user.email ?? null, id: user.id, username: user.username }))
  } catch { /* storage unavailable (private mode, quota) */ }
}

export function clearRememberedUser(): void {
  try {
    sessionStorage.removeItem(storageKey)
  } catch { /* storage unavailable */ }
}

export const rememberedUserStorageKey = storageKey
