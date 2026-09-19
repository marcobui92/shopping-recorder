import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GoogleDriveConnection } from './GoogleDriveConnection'
import { getGoogleDriveStatus, unlinkGoogleDrive, connectGoogleDrive } from '../api'
vi.mock('../api', () => ({ getGoogleDriveStatus: vi.fn(), unlinkGoogleDrive: vi.fn(), connectGoogleDrive: vi.fn() }))
beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)
it('shows missing configuration without offering a broken connection action', async () => {
  vi.mocked(getGoogleDriveStatus).mockResolvedValue({ configured: false, connected: false, updatedAt: null })
  render(<GoogleDriveConnection />)
  await screen.findByText('Google Drive is not configured.')
  expect(screen.queryByRole('button', { name: 'Connect Google Drive' })).not.toBeInTheDocument()
})
it('requires confirmation before unlink and preserves the account on cancellation', async () => {
  vi.mocked(getGoogleDriveStatus).mockResolvedValue({ configured: true, connected: true, updatedAt: null })
  vi.mocked(unlinkGoogleDrive).mockResolvedValue()
  render(<GoogleDriveConnection />)
  fireEvent.click(await screen.findByRole('button', { name: 'Unlink Google Drive' }))
  expect(screen.getByText(/Drive files will be kept/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(unlinkGoogleDrive).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Unlink Google Drive' }))
  vi.mocked(getGoogleDriveStatus).mockResolvedValue({ configured: true, connected: false, updatedAt: null })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await screen.findByText('Google Drive is not connected.')
  expect(unlinkGoogleDrive).toHaveBeenCalledTimes(1)
})
it('warns before leaving the page for OAuth and allows retry after failure', async () => {
  vi.mocked(getGoogleDriveStatus).mockResolvedValue({ configured: true, connected: false, updatedAt: null })
  vi.mocked(connectGoogleDrive).mockRejectedValue(new Error('network'))
  render(<GoogleDriveConnection />)
  fireEvent.click(await screen.findByRole('button', { name: 'Connect Google Drive' }))
  expect(screen.getByText(/unsaved fields and selected files may be lost/)).toBeInTheDocument()
  expect(connectGoogleDrive).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Unable to update Google Drive. Please retry.'))
})
