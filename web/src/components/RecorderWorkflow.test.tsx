import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ApiError,
  completeRecorderActivity,
  createMediaAsset,
  createRecorderActivity,
  finalizeMediaAsset,
  getStorageProviders,
  getGoogleDriveStatus,
  connectGoogleDrive,
  retryMediaAsset,
  uploadMedia,
} from '../api'
import { I18nProvider, LanguageSwitcher } from '../i18n'
import { RecorderWorkflow } from './RecorderWorkflow'

vi.mock('../api', () => ({
  completeRecorderActivity: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) { super(message) }
  },
  createMediaAsset: vi.fn(),
  createRecorderActivity: vi.fn(),
  finalizeMediaAsset: vi.fn(),
  getStorageProviders: vi.fn(),
  getGoogleDriveStatus: vi.fn(),
  connectGoogleDrive: vi.fn(),
  retryMediaAsset: vi.fn(),
  uploadMedia: vi.fn(),
}))

const activity = {
  completedAt: null, createdAt: '2026-09-05T00:00:00.000Z', id: 'activity-1', notes: null,
  occurredAt: '2026-09-05T00:00:00.000Z', operationType: 'packing' as const, reference: null,
  status: 'draft' as const, storageProvider: 's3' as const, updatedAt: '2026-09-05T00:00:00.000Z',
}
const asset = {
  activityId: activity.id, contentType: 'image/jpeg', createdAt: activity.createdAt, id: 'asset-1',
  mediaType: 'image' as const, ordinal: 1, originalFilename: 'seal.jpg', readyAt: null,
  sha256: '0'.repeat(64), sizeBytes: 4, status: 'pending_upload' as const, updatedAt: activity.updatedAt,
}
const upload = { attemptId: 'attempt-1', expiresAt: '2026-09-05T01:00:00.000Z', headers: {}, method: 'PUT' as const, strategy: 'direct' as const, url: 'https://upload.example' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getStorageProviders).mockResolvedValue({ s3: { available: true }, google_drive: { available: false, configured: false, state: 'unavailable' } })
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:evidence-preview') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  vi.stubGlobal('crypto', { subtle: { digest: vi.fn().mockResolvedValue(new Uint8Array(32).buffer) } })
  vi.mocked(createRecorderActivity).mockResolvedValue(activity)
  vi.mocked(createMediaAsset).mockResolvedValue({ asset, upload })
  vi.mocked(uploadMedia).mockImplementation(async (_file, _capability, onProgress) => { onProgress(100) })
  vi.mocked(finalizeMediaAsset).mockResolvedValue({ ...asset, readyAt: activity.createdAt, status: 'ready' })
  vi.mocked(completeRecorderActivity).mockResolvedValue({ ...activity, completedAt: activity.createdAt, status: 'complete' })
})

afterEach(() => cleanup())

function selectEvidence() {
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], 'seal.jpg', { type: 'image/jpeg' })
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array([0xff, 0xd8, 0xff, 0x00]).buffer })
  fireEvent.change(screen.getByLabelText('Evidence files'), { target: { files: [file] } })
  return file
}

describe('RecorderWorkflow', () => {
  it('uses labelled controls and announces validation failures as alerts', async () => {
    render(<RecorderWorkflow />)
    expect(screen.getByLabelText('Operation')).toBeInTheDocument()
    expect(screen.getByLabelText('Reference')).toBeInTheDocument()
    expect(screen.getByLabelText('Notes')).toBeInTheDocument()
    expect(screen.getByLabelText('Evidence files')).toHaveAttribute('accept', expect.stringContaining('image/jpeg'))
    expect(screen.getByLabelText('Evidence files')).not.toBeRequired()
    fireEvent.submit(screen.getByRole('button', { name: 'Review complete · Upload' }).closest('form')!)
    expect(await screen.findByRole('alert')).toHaveTextContent('Select at least one image or video.')
  })

  it('shows dropped files immediately and lets the operator remove them before upload', async () => {
    render(<RecorderWorkflow />)
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], 'handoff.jpg', { type: 'image/jpeg' })
    const dropTarget = screen.getByText('Drop evidence here or choose files').closest('label')!

    fireEvent.dragEnter(dropTarget, { dataTransfer: { files: [file] } })
    fireEvent.drop(dropTarget, { dataTransfer: { files: [file] } })

    expect(screen.getByText('1 file ready for review')).toBeInTheDocument()
    expect(screen.getByText('Review selected evidence')).toBeInTheDocument()
    expect(screen.getAllByText(/handoff\.jpg/)).toHaveLength(2)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Review complete · Upload' })).toBeEnabled())

    fireEvent.click(screen.getByRole('button', { name: 'Remove handoff.jpg' }))
    expect(screen.getByText('Drop evidence here or choose files')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review complete · Upload' })).toBeDisabled()
  })

  it('offers phone capture controls and appends later selections', () => {
    render(<RecorderWorkflow />)
    const first = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'front.jpg', { type: 'image/jpeg' })
    const second = new File([new Uint8Array([0x89, 0x50, 0x4e])], 'seal.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Evidence files'), { target: { files: [first] } })
    fireEvent.change(document.getElementById('record-photo')!, { target: { files: [second] } })

    expect(screen.getByRole('button', { name: 'Take photo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record video' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose files' })).toBeInTheDocument()
    expect(document.getElementById('record-photo')).toHaveAttribute('capture', 'environment')
    expect(document.getElementById('record-video')).toHaveAttribute('capture', 'environment')
    expect(screen.getByText('2 files ready for review')).toBeInTheDocument()
    expect(screen.getAllByText(/front\.jpg|seal\.png/)).toHaveLength(3)
  })

  it('uploads, finalizes, and completes a packing evidence record', async () => {
    render(<RecorderWorkflow />)
    selectEvidence()
    expect(screen.getByAltText('Preview of seal.jpg')).toHaveAttribute('src', 'blob:evidence-preview')
    expect(screen.getByRole('link', { name: 'Open full preview of seal.jpg' })).toHaveAttribute('href', 'blob:evidence-preview')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Review complete · Upload' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Review complete · Upload' }))

    expect(await screen.findAllByText(/seal\.jpg/)).toHaveLength(2)
    await waitFor(() => expect(screen.getByText(/^ready$/i)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Complete record' }))
    await screen.findByText('Evidence record completed and secured.')

    expect(createRecorderActivity).toHaveBeenCalledWith(expect.objectContaining({ operationType: 'packing', storageProvider: 's3' }))
    expect(uploadMedia).toHaveBeenCalledOnce()
    expect(finalizeMediaAsset).toHaveBeenCalledWith('asset-1', 'attempt-1')
    expect(completeRecorderActivity).toHaveBeenCalledWith('activity-1')
  })

  it('keeps the active local preview URL valid when StrictMode replays effects', async () => {
    vi.mocked(URL.createObjectURL)
      .mockReturnValueOnce('blob:first-preview')
      .mockReturnValueOnce('blob:active-preview')

    render(<StrictMode><RecorderWorkflow /></StrictMode>)
    selectEvidence()

    const preview = await screen.findByAltText('Preview of seal.jpg')
    await waitFor(() => expect(preview).toHaveAttribute('src', 'blob:active-preview'))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first-preview')
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:active-preview')
  })

  it('creates a new attempt under the same asset after verification confirms an interrupted upload failed', async () => {
    vi.mocked(uploadMedia).mockRejectedValueOnce(new Error('Upload interrupted.'))
    vi.mocked(finalizeMediaAsset)
      .mockRejectedValueOnce(new ApiError(422, 'UPLOAD_VERIFICATION_FAILED', 'The uploaded media could not be verified.'))
      .mockResolvedValueOnce({ ...asset, readyAt: activity.createdAt, status: 'ready' })
    vi.mocked(retryMediaAsset).mockResolvedValue({
      asset: { ...asset, status: 'pending_upload' }, upload: { ...upload, attemptId: 'attempt-2' },
    })
    render(<RecorderWorkflow />)
    selectEvidence()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Review complete · Upload' })).toBeEnabled())
    fireEvent.submit(screen.getByRole('button', { name: 'Review complete · Upload' }).closest('form')!)

    await screen.findByRole('button', { name: 'Retry' })
    expect(screen.getByText('Upload interrupted.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByText(/ready/)).toBeInTheDocument())
    expect(retryMediaAsset).toHaveBeenCalledWith('asset-1')
    expect(finalizeMediaAsset).toHaveBeenLastCalledWith('asset-1', 'attempt-2')
  })
})

const linkedStorage = { s3: { available: true }, google_drive: { available: true, configured: true, state: 'connected' as const } }

it('prefers Drive and preserves an explicit B2 choice on background refresh', async () => {
  vi.mocked(getStorageProviders).mockResolvedValue(linkedStorage)
  render(<RecorderWorkflow />)
  await waitFor(() => expect(screen.getByLabelText('Storage')).toHaveValue('google_drive'))
  selectEvidence()
  fireEvent.change(screen.getByLabelText('Reference'), { target: { value: 'KEEP-THIS' } })
  fireEvent.change(screen.getByLabelText('Storage'), { target: { value: 's3' } })
  fireEvent(window, new Event('focus'))
  await waitFor(() => expect(screen.getByLabelText('Storage')).toHaveValue('s3'))
  expect(screen.getByLabelText('Storage')).toHaveValue('s3')
  expect(screen.getByLabelText('Reference')).toHaveValue('KEEP-THIS')
  expect(screen.getByAltText('Preview of seal.jpg')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Review complete · Upload' }))
  await waitFor(() => expect(createRecorderActivity).toHaveBeenCalledWith(expect.objectContaining({ storageProvider: 's3' })))
  await screen.findByText(/^ready$/i)
})

it.each(['disconnected', 'reauthorization_required', 'unavailable'] as const)('uses available B2 when Drive is %s', async (state) => {
  vi.mocked(getStorageProviders).mockResolvedValue({ s3: { available: true }, google_drive: { available: false, configured: true, state } })
  render(<RecorderWorkflow />)
  await waitFor(() => expect(screen.getByLabelText('Storage')).toHaveValue('s3'))
  fireEvent.click(screen.getByRole('button', { name: 'Application storage' }))
  expect(screen.getByRole('option', { name: 'Google Drive' })).toBeDisabled()
})

it('blocks creation without storage, preserves files, and recovers after refresh', async () => {
  vi.mocked(getStorageProviders).mockResolvedValue({ s3: { available: false }, google_drive: { available: false, configured: true, state: 'disconnected' } })
  render(<RecorderWorkflow />)
  selectEvidence()
  await screen.findByText(/Selected storage is unavailable/)
  expect(screen.getByRole('button', { name: 'Review complete · Upload' })).toBeDisabled()
  expect(createRecorderActivity).not.toHaveBeenCalled()
  vi.mocked(getStorageProviders).mockResolvedValue({ ...linkedStorage, s3: { available: false } })
  fireEvent(window, new Event('focus'))
  await waitFor(() => expect(screen.getByLabelText('Storage')).toHaveValue('google_drive'))
  expect(screen.getByAltText('Preview of seal.jpg')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Review complete · Upload' })).toBeEnabled()
})

it('keeps an explicit revoked Drive selection and requires a deliberate alternative', async () => {
  vi.mocked(getStorageProviders).mockResolvedValue(linkedStorage)
  render(<RecorderWorkflow />)
  await waitFor(() => expect(screen.getByLabelText('Storage')).toHaveValue('google_drive'))
  fireEvent.change(screen.getByLabelText('Storage'), { target: { value: 'google_drive' } })
  selectEvidence()
  vi.mocked(getStorageProviders).mockResolvedValue({ ...linkedStorage, google_drive: { available: false, configured: true, state: 'reauthorization_required' } })
  fireEvent(window, new Event('focus'))
  await screen.findByText('Reconnect Google Drive to restore access.')
  expect(screen.getByLabelText('Storage')).toHaveValue('google_drive')
  expect(screen.getByRole('button', { name: 'Review complete · Upload' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Storage'), { target: { value: 's3' } })
  expect(screen.getByRole('button', { name: 'Review complete · Upload' })).toBeEnabled()
})

it('locks Drive after creation and retries provider errors without creating a B2 record', async () => {
  vi.mocked(getStorageProviders).mockResolvedValue(linkedStorage)
  vi.mocked(createRecorderActivity).mockResolvedValue({ ...activity, storageProvider: 'google_drive' })
  vi.mocked(createMediaAsset).mockRejectedValueOnce(new ApiError(503, 'STORAGE_PROVIDER_UNAVAILABLE', 'Provider failed'))
  render(<RecorderWorkflow />)
  selectEvidence()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Review complete · Upload' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Review complete · Upload' }))
  await screen.findByText(/Storage failed. Check the connection or free space/)
  expect(screen.getByLabelText('Storage')).toBeDisabled()
  vi.mocked(getStorageProviders).mockResolvedValue({ ...linkedStorage, google_drive: { available: false, configured: true, state: 'unavailable' } })
  fireEvent(window, new Event('focus'))
  await waitFor(() => expect(screen.getByLabelText('Storage')).toHaveValue('google_drive'))
  expect(screen.getByLabelText('Storage')).toHaveValue('google_drive')
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await screen.findByText(/^ready$/i)
  expect(createRecorderActivity).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ storageProvider: 'google_drive' }))
})

it('recalculates the default for the next record after completing an explicit B2 record', async () => {
  vi.mocked(getStorageProviders).mockResolvedValue(linkedStorage)
  render(<RecorderWorkflow />)
  await waitFor(() => expect(screen.getByLabelText('Storage')).toHaveValue('google_drive'))
  fireEvent.change(screen.getByLabelText('Storage'), { target: { value: 's3' } })
  selectEvidence()
  fireEvent.click(screen.getByRole('button', { name: 'Review complete · Upload' }))
  await screen.findByText(/^ready$/i)
  fireEvent.click(screen.getByRole('button', { name: 'Complete record' }))
  await screen.findByText('Submitted evidence')
  expect(screen.getByLabelText('Reference')).toHaveValue('')
  expect(screen.getByAltText('Preview of seal.jpg')).toBeInTheDocument()
  fireEvent.click(await screen.findByRole('button', { name: 'Start another record' }))
  await waitFor(() => expect(screen.getByLabelText('Storage')).toHaveValue('google_drive'))
  expect(screen.queryByAltText('Preview of seal.jpg')).not.toBeInTheDocument()
})

it('localizes storage controls and preserves form/files when switching languages or cancelling OAuth', async () => {
  localStorage.removeItem('shopping-recorder-locale')
  vi.mocked(getStorageProviders).mockResolvedValue(linkedStorage)
  vi.mocked(getGoogleDriveStatus).mockResolvedValue({ configured: true, connected: true, state: 'connected', updatedAt: null })
  render(<I18nProvider><LanguageSwitcher /><RecorderWorkflow /></I18nProvider>)
  await waitFor(() => expect(screen.getByLabelText('Nơi lưu')).toHaveValue('google_drive'))
  fireEvent.change(screen.getByLabelText('Mã tham chiếu'), { target: { value: 'GIU-LAI' } })
  fireEvent.change(screen.getByLabelText('Tệp bằng chứng'), { target: { files: [new File(['bytes'], 'local.jpg', { type: 'image/jpeg' })] } })
  fireEvent.click(screen.getByRole('button', { name: 'EN' }))
  expect(screen.getByLabelText('Reference')).toHaveValue('GIU-LAI')
  expect(screen.getByLabelText('Storage')).toHaveValue('google_drive')
  expect(screen.queryByRole('button', { name: 'Manage Google Drive' })).not.toBeInTheDocument()
  expect(screen.getByLabelText('Reference')).toHaveValue('GIU-LAI')
  expect(screen.getByAltText('Preview of local.jpg')).toBeInTheDocument()
  expect(connectGoogleDrive).not.toHaveBeenCalled()
  expect(createRecorderActivity).not.toHaveBeenCalled()
  localStorage.removeItem('shopping-recorder-locale')
})

it('fails closed on a status request error and allows retry without discarding files', async () => {
  vi.mocked(getStorageProviders).mockRejectedValueOnce(new Error('network'))
  render(<RecorderWorkflow />)
  selectEvidence()
  await screen.findByText('Unable to check storage. Retry without losing your selected files.')
  expect(screen.getByRole('button', { name: 'Review complete · Upload' })).toBeDisabled()
  fireEvent(window, new Event('focus'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Review complete · Upload' })).toBeEnabled())
  expect(screen.getByAltText('Preview of seal.jpg')).toBeInTheDocument()
})
