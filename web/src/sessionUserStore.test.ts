import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  clearRememberedUser,
  readRememberedUser,
  rememberedUserStorageKey,
  saveRememberedUser,
} from './sessionUserStore'

describe('sessionUserStore', () => {
  beforeEach(() => sessionStorage.clear())
  afterEach(() => sessionStorage.clear())

  it('round-trips the public user fields', () => {
    saveRememberedUser({ email: 'op@example.com', id: 'user-1', username: 'operator' })
    expect(readRememberedUser()).toEqual({ email: 'op@example.com', id: 'user-1', username: 'operator' })
  })

  it('normalizes a missing email to null', () => {
    sessionStorage.setItem(rememberedUserStorageKey, JSON.stringify({ id: 'user-1', username: 'operator' }))
    expect(readRememberedUser()).toEqual({ email: null, id: 'user-1', username: 'operator' })
  })

  it('returns null for corrupt or partial payloads', () => {
    sessionStorage.setItem(rememberedUserStorageKey, '{not json')
    expect(readRememberedUser()).toBeNull()
    sessionStorage.setItem(rememberedUserStorageKey, JSON.stringify({ id: 42, username: 'operator' }))
    expect(readRememberedUser()).toBeNull()
    sessionStorage.setItem(rememberedUserStorageKey, JSON.stringify({ id: 'user-1', username: 'operator', email: 7 }))
    expect(readRememberedUser()).toBeNull()
  })

  it('returns null when nothing is stored and clears safely', () => {
    expect(readRememberedUser()).toBeNull()
    clearRememberedUser()
    saveRememberedUser({ email: null, id: 'user-1', username: 'operator' })
    clearRememberedUser()
    expect(readRememberedUser()).toBeNull()
  })
})
