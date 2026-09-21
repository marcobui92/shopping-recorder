import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { finalizeMediaAsset, getRecorderActivity, listRecorderActivities, retryMediaAsset, uploadMedia } from '../api'
import { I18nProvider } from '../i18n'
import { RecorderRecovery } from './RecorderRecovery'

vi.mock('../api', () => ({
  ApiError: class ApiError extends Error { constructor(public status: number, public code: string, message: string) { super(message) } },
  finalizeMediaAsset: vi.fn(), getRecorderActivity: vi.fn(), listRecorderActivities: vi.fn(), retryMediaAsset: vi.fn(), uploadMedia: vi.fn(),
}))

const activity = { id: 'unfinished-1', reference: 'ORDER-9', operationType: 'packing' as const, status: 'uploading' as const, storageProvider: 'google_drive' as const, completedAt: null, createdAt: '2026-09-01T00:00:00Z', evidenceExpiresAt: null, expiredAt: null, occurredAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:01:00Z', notes: null }
const asset = { id: 'asset-1', activityId: activity.id, contentType: 'text/plain', createdAt: activity.createdAt, mediaType: 'image' as const, ordinal: 1, originalFilename: 'proof.txt', readyAt: null, sha256: '8bb0cf6eb9b03a5f2f5d6f4f4f6f5d8b5a0f9e1efb2a6f2f4f5f9f9f9f9f9f9f9', sizeBytes: 4, status: 'pending_upload' as const, updatedAt: activity.updatedAt }

describe('RecorderRecovery', () => {
  it('lists unfinished records, keeps ready assets, and rejects a wrong file', async () => {
    vi.mocked(listRecorderActivities).mockResolvedValue({ data: [activity], meta: { page: 1, pageSize: 100, totalPages: 1, totalRecords: 1 } })
    vi.mocked(getRecorderActivity).mockResolvedValue({ ...activity, assets: [{ ...asset, id: 'ready-asset', status: 'ready', readyAt: activity.updatedAt }, asset] })
    render(<I18nProvider><RecorderRecovery /></I18nProvider>)
    await screen.findByText('ORDER-9')
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    await screen.findByText('Đã xác minh')
    const input = screen.getAllByLabelText('Chọn đúng tệp')[0] as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['bad'], 'wrong.txt', { type: 'text/plain' })] } })
    await screen.findByText('Tệp đã chọn không khớp bằng chứng ban đầu. Hãy chọn đúng tệp.')
    expect(retryMediaAsset).not.toHaveBeenCalled()
  })

  it('retries the same asset after exact file validation', async () => {
    const exact = new File(['test'], 'proof.txt', { type: 'text/plain' })
    const hash = '0'.repeat(64)
    vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(new Uint8Array(32).buffer)
    vi.mocked(listRecorderActivities).mockResolvedValue({ data: [activity], meta: { page: 1, pageSize: 100, totalPages: 1, totalRecords: 1 } })
    vi.mocked(getRecorderActivity).mockResolvedValue({ ...activity, assets: [{ ...asset, sha256: hash }] })
    vi.mocked(retryMediaAsset).mockResolvedValue({ asset, upload: { attemptId: 'attempt-1', expiresAt: '2026-10-01T00:00:00Z', headers: {}, method: 'PUT', strategy: 'direct', url: 'https://upload.test' } })
    vi.mocked(uploadMedia).mockResolvedValue(undefined); vi.mocked(finalizeMediaAsset).mockResolvedValue({ ...asset, status: 'ready', readyAt: activity.updatedAt })
    render(<I18nProvider><RecorderRecovery /></I18nProvider>)
    fireEvent.click(await screen.findByRole('button', { name: 'Tiếp tục' }))
    const input = await screen.findByLabelText('Chọn đúng tệp')
    fireEvent.change(input, { target: { files: [exact] } })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Thử tải lên lại' })).not.toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: 'Thử tải lên lại' }))
    await waitFor(() => expect(retryMediaAsset).toHaveBeenCalledWith('asset-1'))
    expect(finalizeMediaAsset).toHaveBeenCalledWith('asset-1', 'attempt-1')
  })
})
