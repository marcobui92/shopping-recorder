import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { cancelRecorderActivity, deleteRecorderActivity, getActivityAuditEvents, getRecorderActivity, listRecorderActivities, updateRecorderActivity } from '../api'
import { I18nProvider, LanguageSwitcher } from '../i18n'
import { RecorderHistory } from './RecorderHistory'

vi.mock('../api', () => ({
  ApiError: class ApiError extends Error { constructor(public status: number, public code: string, message: string) { super(message) } },
  cancelRecorderActivity: vi.fn(),
  deleteRecorderActivity: vi.fn(),
  getActivityAuditEvents: vi.fn(),
  getMediaAssetDriveLink: vi.fn(),
  getMediaAssetDriveOpenUrl: (id: string) => `http://api.test/media-assets/${id}/drive-link?redirect=1`,
  getMediaAssetContentUrl: (assetId: string) => `http://api.test/media-assets/${assetId}/content`,
  getRecorderActivity: vi.fn(),
  listRecorderActivities: vi.fn(),
  updateRecorderActivity: vi.fn(),
}))

const activity = {
  completedAt: '2026-09-05T09:10:00.000Z', createdAt: '2026-09-05T09:00:00.000Z', evidenceExpiresAt: '2026-10-05T09:10:00.000Z', expiredAt: null, id: 'activity-1',
  notes: 'Carton seal', occurredAt: '2026-09-05T08:55:00.000Z', operationType: 'packing' as const,
  reference: 'ORDER-1042', status: 'complete' as const, storageProvider: 's3' as const,
  updatedAt: '2026-09-05T09:10:00.000Z',
}
const image = {
  activityId: activity.id, contentType: 'image/jpeg', createdAt: activity.createdAt, id: 'asset-1',
  mediaType: 'image' as const, ordinal: 1, originalFilename: 'seal.jpg', readyAt: activity.completedAt,
  sha256: '0'.repeat(64), sizeBytes: 1024, status: 'ready' as const, updatedAt: activity.updatedAt,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listRecorderActivities).mockResolvedValue({
    data: [activity], meta: { page: 1, pageSize: 10, totalPages: 1, totalRecords: 1 },
  })
  vi.mocked(getRecorderActivity).mockResolvedValue({ ...activity, assets: [image] })
  vi.mocked(getActivityAuditEvents).mockResolvedValue([])
  vi.mocked(updateRecorderActivity).mockResolvedValue({ ...activity, notes: 'Updated note' })
  vi.mocked(cancelRecorderActivity).mockResolvedValue({ activity: { ...activity, completedAt: null, status: 'cancelled' }, cleanupPending: 0 })
  vi.mocked(deleteRecorderActivity).mockResolvedValue({ cleanupPending: 0 })
})

afterEach(() => cleanup())

describe('RecorderHistory', () => {
  it.each(['image', 'video'] as const)('shows Drive actions for ready %s evidence in detail and viewer', async (mediaType) => {
    vi.mocked(getRecorderActivity).mockResolvedValue({ ...activity, storageProvider: 'google_drive', assets: [{ ...image, mediaType }] })
    render(<RecorderHistory />)
    await screen.findByText('ORDER-1042')
    fireEvent.click(screen.getByRole('button', { name: 'View evidence' }))
    expect(await screen.findByRole('button', { name: 'Copy Drive link' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open in Drive' })).toHaveAttribute('href', 'http://api.test/media-assets/asset-1/drive-link?redirect=1')
    fireEvent.click(screen.getByRole('button', { name: 'Open viewer' }))
    expect(screen.getAllByRole('button', { name: 'Copy Drive link' })).toHaveLength(2)
  })

  it('hides Drive actions for expired evidence', async () => {
    vi.mocked(getRecorderActivity).mockResolvedValue({ ...activity, status: 'expired', storageProvider: 'google_drive', assets: [image] })
    render(<RecorderHistory />)
    await screen.findByText('ORDER-1042')
    fireEvent.click(screen.getByRole('button', { name: 'View evidence' }))
    await screen.findByText('seal.jpg')
    expect(screen.queryByRole('button', { name: 'Copy Drive link' })).not.toBeInTheDocument()
  })

  it('loads owner history, applies filters, and renders evidence detail', async () => {
    render(<RecorderHistory />)
    await screen.findByText('ORDER-1042')
    expect(screen.getByRole('heading', { name: 'Recorded handoffs' }).parentElement?.parentElement).toHaveClass('py-3')
    expect(screen.queryByText('Compare packing and unpacking')).not.toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Filter recorder history' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.change(screen.getByLabelText('Operation'), { target: { value: 'packing' } })
    await waitFor(() => expect(listRecorderActivities).toHaveBeenLastCalledWith(expect.objectContaining({ operationType: 'packing', page: 1 })))
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'complete' } })
    await waitFor(() => expect(listRecorderActivities).toHaveBeenLastCalledWith(expect.objectContaining({
      operationType: 'packing', page: 1, pageSize: 10, status: 'complete',
    })))

    expect(vi.mocked(listRecorderActivities).mock.lastCall?.[0]).not.toHaveProperty('storageProvider')
    fireEvent.click(screen.getByRole('button', { name: 'View evidence' }))
    const preview = await screen.findByAltText('seal.jpg')
    expect(screen.queryByRole('button', { name: 'Copy Drive link' })).not.toBeInTheDocument()
    const detail = screen.getByRole('dialog', { name: 'ORDER-1042' })
    expect(detail).toHaveClass('max-h-[calc(100dvh-1.5rem)]', 'max-w-5xl', 'overflow-hidden')
    expect(screen.getByRole('form', { name: 'Correct activity metadata' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Recorder history pages' })).toBeInTheDocument()
    expect(preview).toHaveAttribute('src', 'http://api.test/media-assets/asset-1/content')
    expect(getRecorderActivity).toHaveBeenCalledWith('activity-1')

    fireEvent.click(screen.getByRole('button', { name: 'Open viewer' }))
    expect(screen.getByRole('dialog', { name: 'Evidence viewer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Download original' })[1]).toHaveAttribute('download', 'seal.jpg')
    fireEvent.click(screen.getByRole('button', { name: 'Close viewer' }))
    expect(screen.queryByRole('dialog', { name: 'Evidence viewer' })).not.toBeInTheDocument()
  })

  it('dismisses centered activity detail outside and with Escape while retaining archive state', async () => {
    render(<RecorderHistory />)
    await screen.findByText('ORDER-1042')
    fireEvent.change(screen.getByLabelText('Search order or shipment reference'), { target: { value: 'KEEP-FILTER' } })
    const trigger = screen.getByRole('button', { name: 'View evidence' })
    fireEvent.click(trigger)
    await screen.findByRole('dialog', { name: 'ORDER-1042' })
    fireEvent.pointerDown(screen.getByTestId('activity-detail-backdrop'))
    expect(screen.queryByRole('dialog', { name: 'ORDER-1042' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Search order or shipment reference')).toHaveValue('KEEP-FILTER')
    await waitFor(() => expect(trigger).toHaveFocus())

    fireEvent.click(trigger)
    await screen.findByRole('dialog', { name: 'ORDER-1042' })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'ORDER-1042' })).not.toBeInTheDocument()
    expect(document.body).not.toHaveStyle({ overflow: 'hidden' })
  })

  it('shows an empty state and retries a failed history request', async () => {
    vi.mocked(listRecorderActivities)
      .mockRejectedValueOnce(new Error('History unavailable.'))
      .mockResolvedValueOnce({ data: [], meta: { page: 1, pageSize: 10, totalPages: 0, totalRecords: 0 } })
    render(<RecorderHistory />)
    await screen.findByText('Unable to load recorder history.')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('No evidence records match these filters.')
    expect(listRecorderActivities).toHaveBeenCalledTimes(2)
  })

  it('updates metadata and requires confirmation before deleting completed evidence', async () => {
    render(<RecorderHistory />)
    await screen.findByText('ORDER-1042')
    fireEvent.click(screen.getByRole('button', { name: 'View evidence' }))
    await screen.findByAltText('seal.jpg')
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Updated note' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }))
    await screen.findByText('Activity metadata updated and recorded in the audit trail.')
    expect(updateRecorderActivity).toHaveBeenCalledWith('activity-1', expect.objectContaining({ notes: 'Updated note' }))

    fireEvent.click(screen.getByRole('button', { name: 'Delete activity' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await screen.findByText('Activity and stored evidence deleted.')
    expect(deleteRecorderActivity).toHaveBeenCalledWith('activity-1')
  })

  it('bulk deletes selected records after one confirmation and reports the result', async () => {
    const second = { ...activity, id: 'activity-2', reference: 'ORDER-2048', status: 'expired' as const }
    const draft = { ...activity, id: 'activity-3', reference: 'ORDER-3072', status: 'draft' as const, completedAt: null, evidenceExpiresAt: null }
    vi.mocked(listRecorderActivities).mockResolvedValue({ data: [activity, second, draft], meta: { page: 1, pageSize: 10, totalPages: 1, totalRecords: 3 } })
    render(<RecorderHistory />)
    await screen.findByText('ORDER-1042')

    expect(screen.queryByLabelText('Select ORDER-3072')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Select ORDER-1042'))
    fireEvent.click(screen.getByLabelText('Select ORDER-2048'))
    expect(screen.getByText('2 records selected')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(deleteRecorderActivity).toHaveBeenCalledWith('activity-1'))
    await waitFor(() => expect(deleteRecorderActivity).toHaveBeenCalledWith('activity-2'))
    expect(deleteRecorderActivity).not.toHaveBeenCalledWith('activity-3')
    await screen.findByText('2 activities deleted.')
    expect(listRecorderActivities).toHaveBeenCalledTimes(2)
    expect(screen.getByLabelText('Select ORDER-1042')).not.toBeChecked()
  })

  it('selects every deletable record at once and reports partial bulk failures', async () => {
    const second = { ...activity, id: 'activity-2', reference: 'ORDER-2048' }
    vi.mocked(listRecorderActivities).mockResolvedValue({ data: [activity, second], meta: { page: 1, pageSize: 10, totalPages: 1, totalRecords: 2 } })
    vi.mocked(deleteRecorderActivity).mockRejectedValueOnce(new Error('Storage unavailable.'))
    render(<RecorderHistory />)
    await screen.findByText('ORDER-1042')

    fireEvent.click(screen.getByLabelText('Select all'))
    expect(screen.getByText('2 records selected')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await screen.findByText('1 activities deleted.')
    expect(screen.getByRole('alert')).toHaveTextContent('1 could not be deleted.')
  })

  it('pins the detail header outside the scroll body and places evidence media first', async () => {
    render(<RecorderHistory />)
    await screen.findByText('ORDER-1042')
    fireEvent.click(screen.getByRole('button', { name: 'View evidence' }))
    const detail = await screen.findByRole('dialog', { name: 'ORDER-1042' })
    expect(detail).toHaveClass('flex', 'flex-col', 'overflow-hidden')
    const preview = await screen.findByAltText('seal.jpg')
    const form = screen.getByRole('form', { name: 'Correct activity metadata' })
    expect(preview.compareDocumentPosition(form)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    const scrollBody = detail.querySelector('.overflow-y-auto')
    expect(scrollBody).toContainElement(form)
    expect(scrollBody).not.toContainElement(screen.getByRole('button', { name: 'Close detail' }))
  })

  it('keeps expired record metadata visible without exposing evidence controls', async () => {
    const expired = { ...activity, status: 'expired' as const, expiredAt: '2026-10-05T09:10:00.000Z' }
    vi.mocked(listRecorderActivities).mockResolvedValue({ data: [expired], meta: { page: 1, pageSize: 10, totalPages: 1, totalRecords: 1 } })
    vi.mocked(getRecorderActivity).mockResolvedValue({ ...expired, assets: [image] })
    render(<RecorderHistory />)
    await screen.findByText('ORDER-1042')
    expect(screen.getAllByText('Expired').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'View evidence' }))
    await screen.findByText('Stored evidence expired after 30 days and is no longer available. The record metadata is preserved.')
    expect(screen.getByText('Evidence expired')).toBeInTheDocument()
    expect(screen.queryByAltText('seal.jpg')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open viewer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Download original' })).not.toBeInTheDocument()
  })
})

it('searches on the server, resets pagination on apply/clear, and retains other filters', async () => {
  vi.mocked(listRecorderActivities).mockImplementation(async (input = {}) => ({ data: [activity], meta: { page: input.page ?? 1, pageSize: 10, totalPages: 3, totalRecords: 30 } }))
  render(<RecorderHistory />)
  await screen.findByText('ORDER-1042')
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await screen.findByText('Page 2 of 3')
  fireEvent.change(screen.getByLabelText('Search order or shipment reference'), { target: { value: '  AbC%_  ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
  fireEvent.change(screen.getByLabelText('Operation'), { target: { value: 'packing' } })
  await waitFor(() => expect(listRecorderActivities).toHaveBeenLastCalledWith(expect.objectContaining({ operationType: 'packing', page: 1 })))
  fireEvent.submit(screen.getByRole('form', { name: 'Filter recorder history' }))
  await waitFor(() => expect(listRecorderActivities).toHaveBeenLastCalledWith(expect.objectContaining({ reference: 'AbC%_', operationType: 'packing', page: 1 })))
  await screen.findByText('Page 1 of 3')
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await screen.findByText('Page 2 of 3')
  expect(listRecorderActivities).toHaveBeenLastCalledWith(expect.objectContaining({ reference: 'AbC%_', page: 2 }))
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
  await waitFor(() => expect(listRecorderActivities).toHaveBeenLastCalledWith(expect.objectContaining({ reference: undefined, operationType: 'packing', page: 1 })))
  expect(screen.getByLabelText('Search order or shipment reference')).toHaveValue('')
})

it('collapses advanced filters by default, auto-applies changes and shows the active count', async () => {
  render(<RecorderHistory />)
  await screen.findByText('ORDER-1042')
  expect(screen.queryByLabelText('Operation')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Occurred from')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
  expect(screen.getByLabelText('Operation')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'complete' } })
  await waitFor(() => expect(listRecorderActivities).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'complete', page: 1 })))

  fireEvent.click(screen.getByRole('button', { name: /Filters/ }))
  expect(screen.queryByLabelText('Operation')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Filters/ })).toHaveTextContent('1')
  fireEvent.change(screen.getByLabelText('Search order or shipment reference'), { target: { value: 'ORDER' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Filter recorder history' }))
  await screen.findByText('ORDER-1042')
  expect(listRecorderActivities).toHaveBeenLastCalledWith(expect.objectContaining({ reference: 'ORDER', status: 'complete' }))
})

it('clears every filter from the panel', async () => {
  render(<RecorderHistory />)
  await screen.findByText('ORDER-1042')
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
  fireEvent.change(screen.getByLabelText('Operation'), { target: { value: 'unpacking' } })
  await waitFor(() => expect(listRecorderActivities).toHaveBeenLastCalledWith(expect.objectContaining({ operationType: 'unpacking' })))
  fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }))
  await waitFor(() => expect(listRecorderActivities).toHaveBeenLastCalledWith({ page: 1, pageSize: 10, sortDirection: 'desc' }))
})

it('localizes search loading/error/empty states, retains input through retry and language changes', async () => {
  localStorage.removeItem('shopping-recorder-locale')
  let fail: (error: Error) => void = () => {}
  vi.mocked(listRecorderActivities).mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject }))
  render(<I18nProvider><LanguageSwitcher /><RecorderHistory /></I18nProvider>)
  expect(screen.getByRole('status')).toHaveTextContent('Đang tải bản ghi bằng chứng…')
  fireEvent.change(screen.getByLabelText('Tìm mã đơn hoặc mã vận đơn'), { target: { value: 'MÃ-GIỮ' } })
  fail(new Error('untranslated backend detail'))
  expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải lịch sử bản ghi.')
  vi.mocked(listRecorderActivities).mockResolvedValue({ data: [], meta: { page: 1, pageSize: 10, totalPages: 0, totalRecords: 0 } })
  fireEvent.submit(screen.getByRole('form', { name: 'Lọc lịch sử bản ghi' }))
  await screen.findByText('Không có bản ghi phù hợp với bộ lọc.')
  expect(listRecorderActivities).toHaveBeenLastCalledWith(expect.objectContaining({ reference: 'MÃ-GIỮ', page: 1 }))
  fireEvent.click(screen.getByRole('button', { name: 'Language' }))
  fireEvent.click(screen.getByRole('option', { name: 'English' }))
  expect(screen.getByLabelText('Search order or shipment reference')).toHaveValue('MÃ-GIỮ')
  expect(screen.getByText('No evidence records match these filters.')).toBeInTheDocument()
  localStorage.removeItem('shopping-recorder-locale')
})
