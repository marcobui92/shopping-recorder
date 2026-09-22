import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { cancelRecorderActivity, deleteRecorderActivity, getActivityAuditEvents, getRecorderActivity, listRecorderActivities, updateRecorderActivity } from '../api'
import { I18nProvider, LanguageSwitcher } from '../i18n'
import { RecorderHistory } from './RecorderHistory'

vi.mock('./RecorderRecovery', () => ({ RecorderRecovery: () => null }))

vi.mock('../api', () => ({
  ApiError: class ApiError extends Error { constructor(public status: number, public code: string, message: string) { super(message) } },
  cancelRecorderActivity: vi.fn(),
  deleteRecorderActivity: vi.fn(),
  getActivityAuditEvents: vi.fn(),
  getMediaAssetContentUrl: (assetId: string) => `http://api.test/media-assets/${assetId}/content`,
  getRecorderActivity: vi.fn(),
  getRecorderComparisonCandidates: vi.fn(),
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
  it('loads owner history, applies filters, and renders evidence detail', async () => {
    render(<RecorderHistory />)
    await screen.findByText('ORDER-1042')
    expect(screen.getByRole('form', { name: 'Filter recorder history' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Operation'), { target: { value: 'packing' } })
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'complete' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
    await waitFor(() => expect(listRecorderActivities).toHaveBeenLastCalledWith(expect.objectContaining({
      operationType: 'packing', page: 1, pageSize: 10, status: 'complete',
    })))

    expect(vi.mocked(listRecorderActivities).mock.lastCall?.[0]).not.toHaveProperty('storageProvider')
    fireEvent.click(screen.getByRole('button', { name: 'View evidence' }))
    const preview = await screen.findByAltText('seal.jpg')
    const detail = screen.getByRole('dialog', { name: 'ORDER-1042' })
    expect(detail).toHaveClass('max-h-[calc(100dvh-1.5rem)]', 'max-w-5xl', 'overflow-y-auto')
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
  fireEvent.change(screen.getByLabelText('Operation'), { target: { value: 'packing' } })
  fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
  await waitFor(() => expect(listRecorderActivities).toHaveBeenLastCalledWith(expect.objectContaining({ reference: 'AbC%_', operationType: 'packing', page: 1 })))
  await screen.findByText('Page 1 of 3')
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await screen.findByText('Page 2 of 3')
  expect(listRecorderActivities).toHaveBeenLastCalledWith(expect.objectContaining({ reference: 'AbC%_', page: 2 }))
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
  await waitFor(() => expect(listRecorderActivities).toHaveBeenLastCalledWith(expect.objectContaining({ reference: undefined, operationType: 'packing', page: 1 })))
  expect(screen.getByLabelText('Search order or shipment reference')).toHaveValue('')
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
  fireEvent.click(screen.getByRole('button', { name: 'Áp dụng bộ lọc' }))
  await screen.findByText('Không có bản ghi phù hợp với bộ lọc.')
  expect(listRecorderActivities).toHaveBeenLastCalledWith(expect.objectContaining({ reference: 'MÃ-GIỮ', page: 1 }))
  fireEvent.click(screen.getByRole('button', { name: 'EN' }))
  expect(screen.getByLabelText('Search order or shipment reference')).toHaveValue('MÃ-GIỮ')
  expect(screen.getByText('No evidence records match these filters.')).toBeInTheDocument()
  localStorage.removeItem('shopping-recorder-locale')
})
