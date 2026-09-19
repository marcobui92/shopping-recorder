import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { ApiError, getHealth } from '../api'
import { HealthStatus } from './HealthStatus'

vi.mock('../api', () => ({
  ApiError: class ApiError extends Error {},
  getHealth: vi.fn(),
}))

const mockedGetHealth = vi.mocked(getHealth)

afterEach(() => {
  cleanup()
  mockedGetHealth.mockReset()
})

it('shows an online state after the health check succeeds', async () => {
  mockedGetHealth.mockResolvedValue({ status: 'ok' })

  render(<HealthStatus />)

  expect(screen.getByRole('status')).toHaveTextContent('Checking API connection')
  expect(await screen.findByText('API is ok')).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('API is ok')
})

it('shows a retryable error state after the health check fails', async () => {
  mockedGetHealth.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Unable to reach the API.'))

  render(<HealthStatus />)

  expect(await screen.findByRole('alert')).toHaveTextContent('API unavailable')
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
})
