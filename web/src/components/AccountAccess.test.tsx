import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { ApiError, getSession, login, logout, registerAccount } from '../api'
import { AccountAccess } from './AccountAccess'

vi.mock('../api', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) { super(message) }
  },
  getSession: vi.fn(), login: vi.fn(), logout: vi.fn(), registerAccount: vi.fn(),
}))

beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanup())

it('announces session restoration while authentication is pending', () => {
  vi.mocked(getSession).mockReturnValue(new Promise(() => {}))
  render(<AccountAccess onUserChange={vi.fn()} />)
  expect(screen.getByRole('status')).toHaveTextContent('Checking your session…')
})

it('restores an existing application session', async () => {
  const user = { email: null, id: 'user-1', username: 'operator' }
  vi.mocked(getSession).mockResolvedValue(user)
  const onUserChange = vi.fn()
  render(<AccountAccess onUserChange={onUserChange} />)

  await screen.findByText(/Signed in as/)
  expect(onUserChange).toHaveBeenCalledWith(user)
})

it('lets an operator create an account when no session exists', async () => {
  vi.mocked(getSession).mockRejectedValue(new ApiError(401, 'AUTH_REQUIRED', 'Authentication is required.'))
  const user = { email: 'operator@example.com', id: 'user-1', username: 'operator' }
  vi.mocked(registerAccount).mockResolvedValue(user)
  const onUserChange = vi.fn()
  render(<AccountAccess onUserChange={onUserChange} />)

  await screen.findByRole('button', { name: 'Create an account' })
  fireEvent.click(screen.getByRole('button', { name: 'Create an account' }))
  expect(screen.getByLabelText('Password')).toHaveAttribute('minLength', '6')
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'operator' } })
  fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'operator@example.com' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'abc123' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Create account' }).closest('form')!)

  await screen.findByText(/Signed in as/)
  expect(registerAccount).toHaveBeenCalledWith({
    email: 'operator@example.com', password: 'abc123', username: 'operator',
  })
  expect(login).not.toHaveBeenCalled()
  expect(logout).not.toHaveBeenCalled()
})
