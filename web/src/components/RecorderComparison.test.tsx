import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { getRecorderActivity, getRecorderComparisonCandidates } from '../api'
import { I18nProvider, LanguageSwitcher } from '../i18n'
import { RecorderComparison } from './RecorderComparison'

vi.mock('../api', () => ({
  ApiError: class ApiError extends Error { constructor(public status: number, public code: string, message: string) { super(message) } },
  getMediaAssetContentUrl: (assetId: string) => `http://api.test/media-assets/${assetId}/content`,
  getRecorderActivity: vi.fn(),
  getRecorderComparisonCandidates: vi.fn(),
}))

const base = {
  completedAt: '2026-09-05T09:10:00.000Z', createdAt: '2026-09-05T09:00:00.000Z', notes: null,
  occurredAt: '2026-09-05T08:55:00.000Z', reference: 'ORDER-1042', status: 'complete' as const,
  storageProvider: 's3' as const, updatedAt: '2026-09-05T09:10:00.000Z',
}
const packing = { ...base, id: 'packing-1', operationType: 'packing' as const }
const packing2 = { ...base, id: 'packing-2', operationType: 'packing' as const, occurredAt: '2026-09-04T08:55:00.000Z' }
const unpacking = { ...base, id: 'unpacking-1', operationType: 'unpacking' as const, storageProvider: 'google_drive' as const }
const image = { activityId: packing.id, contentType: 'image/jpeg', createdAt: base.createdAt, id: 'asset-packing', mediaType: 'image' as const, ordinal: 1, originalFilename: 'before.jpg', readyAt: base.completedAt, sha256: '0'.repeat(64), sizeBytes: 1024, status: 'ready' as const, updatedAt: base.updatedAt }
const video = { ...image, activityId: unpacking.id, id: 'asset-unpacking', mediaType: 'video' as const, originalFilename: 'after.mp4' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getRecorderComparisonCandidates).mockResolvedValue({ packing: [packing, packing2], unpacking: [unpacking], truncated: false })
  vi.mocked(getRecorderActivity).mockImplementation(async (id) => id === unpacking.id ? { ...unpacking, notes: 'Opened safely', assets: [video] } : { ...(id === packing.id ? packing : packing2), notes: 'Sealed', assets: [image] })
})
afterEach(cleanup)

it('requires manual selection when a side has multiple candidates and compares protected evidence', async () => {
  render(<RecorderComparison />)
  fireEvent.change(screen.getByLabelText('Reference'), { target: { value: '  ORDER-1042  ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Find comparison records' }))
  await waitFor(() => expect(getRecorderComparisonCandidates).toHaveBeenCalledWith('ORDER-1042'))
  expect(screen.getByLabelText('Packing record')).toHaveValue('')
  expect(screen.getByLabelText('Unpacking record')).toHaveValue('unpacking-1')
  expect(await screen.findByText('Opened safely')).toBeInTheDocument()
  expect(screen.getByText('Select a packing record to compare.')).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('Packing record'), { target: { value: 'packing-1' } })
  expect(await screen.findByText('Sealed')).toBeInTheDocument()
  expect(screen.getByAltText('before.jpg')).toHaveAttribute('src', 'http://api.test/media-assets/asset-packing/content')
  fireEvent.click(screen.getByRole('button', { name: 'Unpacking' }))
  expect(screen.getByLabelText('after.mp4')).toHaveAttribute('src', 'http://api.test/media-assets/asset-unpacking/content')
  expect(screen.getAllByRole('link', { name: 'Download original' })[1]).toHaveAttribute('href', 'http://api.test/media-assets/asset-unpacking/content?download=1')
})

it('shows a missing side without inventing a pair and warns when candidates are bounded', async () => {
  vi.mocked(getRecorderComparisonCandidates).mockResolvedValue({ packing: [packing], unpacking: [], truncated: true })
  render(<RecorderComparison />)
  fireEvent.change(screen.getByLabelText('Reference'), { target: { value: 'ORDER-1042' } })
  fireEvent.submit(screen.getByRole('form', { name: 'Find records to compare' }))
  expect(await screen.findByText('No unpacking record has this exact reference.')).toBeInTheDocument()
  expect(screen.getByText(/Only the newest 50 per side/)).toBeInTheDocument()
  expect(screen.getByLabelText('Packing record')).toHaveValue('packing-1')
  expect(screen.queryByLabelText('Unpacking record')).not.toBeInTheDocument()
})

it('keeps the comparison through VI/EN switching', async () => {
  localStorage.removeItem('shopping-recorder-locale')
  vi.mocked(getRecorderComparisonCandidates).mockResolvedValue({ packing: [packing], unpacking: [unpacking], truncated: false })
  render(<I18nProvider><LanguageSwitcher /><RecorderComparison /></I18nProvider>)
  fireEvent.change(screen.getByLabelText('Mã tham chiếu'), { target: { value: 'ORDER-1042' } })
  fireEvent.click(screen.getByRole('button', { name: 'Tìm bản ghi đối chiếu' }))
  expect(await screen.findByText('Opened safely')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'EN' }))
  expect(screen.getByLabelText('Reference')).toHaveValue('ORDER-1042')
  expect(screen.getByText('Sealed')).toBeInTheDocument()
  localStorage.removeItem('shopping-recorder-locale')
})
