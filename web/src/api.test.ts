import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, cancelRecorderActivity, completeRecorderActivity, createRecorderActivity, deleteRecorderActivity, getActivityAuditEvents, getHealth, getRecorderActivity, getRecorderComparisonCandidates, listRecorderActivities, login, updateRecorderActivity } from './api'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getHealth', () => {
  it('returns the status from the documented health response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { status: 'ok' } }))))

    await expect(getHealth()).resolves.toEqual({ status: 'ok' })
  })

  it('maps a standard API error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
    }), { status: 500 })))

    await expect(getHealth()).rejects.toEqual(new ApiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.'))
  })
})

describe('recorder API', () => {
  it('uses credentialed session requests for login and the activity lifecycle', async () => {
    const user = { email: null, id: 'user-1', username: 'operator' }
    const activity = { id: 'activity-1', operationType: 'packing', status: 'draft', storageProvider: 's3' }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { user } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: activity }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { ...activity, status: 'complete' } })))
    vi.stubGlobal('fetch', fetchMock)

    await expect(login({ username: 'operator', password: 'correct horse battery staple' })).resolves.toEqual(user)
    await expect(createRecorderActivity({ notes: null, operationType: 'packing', reference: null, storageProvider: 's3' })).resolves.toEqual(activity)
    await expect(completeRecorderActivity(activity.id)).resolves.toEqual({ ...activity, status: 'complete' })
    expect(fetchMock.mock.calls.every((call) => call[1]?.credentials === 'include')).toBe(true)
  })

  it('lists filtered recorder history and retrieves activity assets', async () => {
    const activity = { id: 'activity-1', operationType: 'packing', status: 'complete', storageProvider: 's3' }
    const asset = { id: 'asset-1', activityId: activity.id, status: 'ready' }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [activity], meta: { page: 1, pageSize: 10, totalPages: 1, totalRecords: 1 },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { ...activity, assets: [asset] } })))
    vi.stubGlobal('fetch', fetchMock)

    await expect(listRecorderActivities({ operationType: 'packing', page: 1, pageSize: 10 })).resolves.toEqual({
      data: [activity], meta: { page: 1, pageSize: 10, totalPages: 1, totalRecords: 1 },
    })
    await expect(getRecorderActivity(activity.id)).resolves.toEqual({ ...activity, assets: [asset] })
    expect(fetchMock.mock.calls[0][0]).toContain('/recorder-activities?operationType=packing&page=1&pageSize=10')
    expect(fetchMock.mock.calls.every((call) => call[1]?.credentials === 'include')).toBe(true)
  })

  it('corrects, cancels, deletes, and reads recorder audit events with credentialed requests', async () => {
    const activity = { id: 'activity-1', operationType: 'packing', status: 'uploading', storageProvider: 's3' }
    const audit = [{ id: 'event-1', action: 'metadata_updated', before: {}, after: {}, createdAt: '2026-09-13T00:00:00.000Z' }]
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { ...activity, notes: 'Corrected' } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { activity: { ...activity, status: 'cancelled' }, cleanupPending: 1 } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { cleanupPending: 0 } }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: audit })))
    vi.stubGlobal('fetch', fetchMock)

    await expect(updateRecorderActivity(activity.id, { notes: 'Corrected' })).resolves.toMatchObject({ notes: 'Corrected' })
    await expect(cancelRecorderActivity(activity.id)).resolves.toMatchObject({ cleanupPending: 1 })
    await expect(deleteRecorderActivity(activity.id)).resolves.toEqual({ cleanupPending: 0 })
    await expect(getActivityAuditEvents(activity.id)).resolves.toEqual(audit)
    expect(fetchMock.mock.calls.map((call) => call[1]?.method)).toEqual(['PATCH', 'POST', 'DELETE', undefined])
    expect(fetchMock.mock.calls.every((call) => call[1]?.credentials === 'include')).toBe(true)
  })
})

it('sends cookies only to the server upload strategy and preserves upload progress', async () => {
  const { uploadMedia } = await import('./api')
  const requests: FakeRequest[] = []
  class FakeRequest {
    withCredentials = false
    status = 204
    listeners = new Map<string, () => void>()
    upload = { addEventListener: (_event: string, listener: (event: { lengthComputable: boolean; loaded: number; total: number }) => void) => listener({ lengthComputable: true, loaded: 1, total: 2 }) }
    constructor() { requests.push(this) }
    open() {}
    setRequestHeader() {}
    addEventListener(event: string, listener: () => void) { this.listeners.set(event, listener) }
    send() { this.listeners.get('load')?.() }
  }
  vi.stubGlobal('XMLHttpRequest', FakeRequest)
  const progress = vi.fn()
  for (const strategy of ['server', 'direct'] as const) await uploadMedia(new File(['bytes'], 'test.jpg'), { attemptId: 'attempt', expiresAt: '', headers: {}, method: 'PUT', strategy, url: 'https://example.test/upload' }, progress)
  expect(requests.map(request => request.withCredentials)).toEqual([true, false])
  expect(progress).toHaveBeenCalledWith(50)
})

it.each(['server', 'direct'] as const)('reports a %s upload network error without blaming B2 CORS', async (strategy) => {
  const { uploadMedia } = await import('./api')
  class FailedRequest {
    withCredentials = false
    listeners = new Map<string, () => void>()
    upload = { addEventListener() {} }
    open() {}
    setRequestHeader() {}
    addEventListener(event: string, listener: () => void) { this.listeners.set(event, listener) }
    send() { this.listeners.get('error')?.() }
  }
  vi.stubGlobal('XMLHttpRequest', FailedRequest)
  const error = await uploadMedia(new File(['bytes'], 'test.jpg'), { attemptId: 'attempt', expiresAt: '', headers: {}, method: 'PUT', strategy, url: 'https://example.test/upload' }, vi.fn()).catch(error => error)
  expect(error).toBeInstanceOf(ApiError)
  expect(error.code).toBe('UPLOAD_NETWORK_ERROR')
  expect(error.message).toContain(strategy === 'server' ? 'Google Drive upload service' : 'application storage')
  expect(error.message).not.toMatch(/Backblaze|bucket|CORS/)
})

it('encodes literal reference searches without changing special characters', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [], meta: { page: 1, pageSize: 10, totalPages: 0, totalRecords: 0 } })))
  vi.stubGlobal('fetch', fetchMock)
  const reference = String.raw`MÃ %_\&+#'`
  await listRecorderActivities({ reference, page: 1, pageSize: 10, operationType: 'packing' })
  const url = new URL(fetchMock.mock.calls[0][0])
  expect(url.searchParams.get('reference')).toBe(reference)
  expect(url.searchParams.get('operationType')).toBe('packing')
  expect(fetchMock.mock.calls[0][1].credentials).toBe('include')
})

it('encodes an exact comparison reference and validates the candidate response', async () => {
  const candidates = { packing: [{ id: 'packing-1' }], unpacking: [{ id: 'unpacking-1' }], truncated: false }
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: candidates })))
  vi.stubGlobal('fetch', fetchMock)
  await expect(getRecorderComparisonCandidates('ORDER %_&+')).resolves.toEqual(candidates)
  const url = new URL(fetchMock.mock.calls[0][0])
  expect(url.pathname).toContain('/recorder-activities/comparison-candidates')
  expect(url.searchParams.get('reference')).toBe('ORDER %_&+')
  expect(fetchMock.mock.calls[0][1].credentials).toBe('include')

  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: { packing: [], unpacking: [] } })))
  await expect(getRecorderComparisonCandidates('BROKEN')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
})
