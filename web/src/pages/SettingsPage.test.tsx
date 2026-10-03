import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n'
import { SettingsPage } from './SettingsPage'
import { getGoogleDriveStatus, getSettings, updateSettings } from '../api'

vi.mock('../api', () => ({
  getGoogleDriveStatus: vi.fn(), getSettings: vi.fn(),
  updateSettings: vi.fn(),
}))

const user = { id: 'user-1', username: 'operator', email: null }

describe('SettingsPage', () => {
  afterEach(() => cleanup())
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(getGoogleDriveStatus).mockResolvedValue({ configured: false, connected: false, updatedAt: null }); vi.mocked(getSettings).mockResolvedValue({ retentionDays: 30 }); vi.mocked(updateSettings).mockResolvedValue({ retentionDays: 14 }) })

  it('loads and saves the retention period', async () => {
    render(<I18nProvider><SettingsPage sessionStatus="verified" user={user} onUserChange={vi.fn()} /></I18nProvider>)
    const input = await screen.findByLabelText('Tự động xóa bằng chứng sau (ngày)')
    expect(input).toHaveValue(30)
    expect(await screen.findByText('Google Drive chưa được cấu hình.')).toBeInTheDocument()
    fireEvent.change(input, { target: { value: '14' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cài đặt' }))
    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith(14))
    expect(await screen.findByRole('status')).toHaveTextContent('Đã lưu cài đặt.')
  })

  it('rejects values outside the supported range', async () => {
    render(<I18nProvider><SettingsPage sessionStatus="verified" user={user} onUserChange={vi.fn()} /></I18nProvider>)
    const input = await screen.findByLabelText('Tự động xóa bằng chứng sau (ngày)')
    fireEvent.change(input, { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cài đặt' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Nhập số ngày từ 1 đến 3650.')
    expect(updateSettings).not.toHaveBeenCalled()
  })
})
