import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getMediaAssetDriveLink } from '../api'
import { DriveFileActions } from './DriveFileActions'
import { I18nProvider } from '../i18n'

vi.mock('../api', () => ({
  getMediaAssetDriveLink: vi.fn(),
  getMediaAssetDriveOpenUrl: (id: string) => `/api/v1/media-assets/${id}/drive-link?redirect=1`,
}))
const url = 'https://drive.google.com/file/d/file/view?resourcekey=key'
const writeText = vi.fn()
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getMediaAssetDriveLink).mockResolvedValue(url)
  writeText.mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
})
afterEach(() => {
  cleanup()
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
  else Reflect.deleteProperty(navigator, 'clipboard')
})

it('loads links only on copy and opens Drive through an authenticated redirect', async () => {
  render(<DriveFileActions assetId="asset-1" />)
  expect(getMediaAssetDriveLink).not.toHaveBeenCalled()
  expect(screen.getByRole('link', { name: 'Open in Drive' })).toHaveAttribute('href', '/api/v1/media-assets/asset-1/drive-link?redirect=1')
  expect(screen.getByRole('link', { name: 'Open in Drive' })).toHaveAttribute('rel', 'noopener noreferrer')
  fireEvent.click(screen.getByRole('button', { name: 'Copy Drive link' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Drive link copied.')
  expect(writeText).toHaveBeenCalledWith(url)
  expect(getMediaAssetDriveLink).toHaveBeenCalledWith('asset-1')
})

it('provides a selectable link when clipboard permission is denied', async () => {
  writeText.mockRejectedValue(new Error('NotAllowedError'))
  render(<DriveFileActions assetId="asset-1" />)
  fireEvent.click(screen.getByRole('button', { name: 'Copy Drive link' }))
  expect(await screen.findByLabelText('Copy this link manually')).toHaveValue(url)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it('supports Vietnamese and manual copying when clipboard is unavailable', async () => {
  Reflect.deleteProperty(navigator, 'clipboard')
  localStorage.setItem('shopping-recorder-locale', 'vi')
  try {
    render(<I18nProvider><DriveFileActions assetId="asset-1" /></I18nProvider>)
    expect(screen.getByRole('link', { name: 'Mở trong Drive' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sao chép liên kết Drive' }))
    expect(await screen.findByLabelText('Sao chép liên kết này thủ công')).toHaveValue(url)
  } finally { localStorage.removeItem('shopping-recorder-locale') }
})

it('shows a recoverable error without reporting copy success', async () => {
  vi.mocked(getMediaAssetDriveLink).mockRejectedValueOnce(new Error('unavailable'))
  render(<DriveFileActions assetId="asset-1" />)
  fireEvent.click(screen.getByRole('button', { name: 'Copy Drive link' }))
  await screen.findByRole('alert')
  expect(writeText).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Copy Drive link' }))
  await screen.findByRole('status')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
