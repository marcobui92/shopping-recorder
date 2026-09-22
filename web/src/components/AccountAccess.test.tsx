import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { ApiError, getGoogleDriveStatus, getSession, login, logout, registerAccount } from '../api'
import { I18nProvider } from '../i18n'
import { AccountAccess } from './AccountAccess'

vi.mock('../api', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) { super(message) }
  },
  getGoogleDriveStatus: vi.fn(), getSession: vi.fn(), login: vi.fn(), logout: vi.fn(), registerAccount: vi.fn(),
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

it('contains Vietnamese profile actions and dismisses the popup outside or with Escape', async () => {
  localStorage.setItem('shopping-recorder-locale', 'vi')
  const target = document.createElement('span')
  target.id = 'header-profile'
  document.body.append(target)
  vi.mocked(getSession).mockResolvedValue({ email: null, id: 'user-1', username: 'operator' })
  vi.mocked(getGoogleDriveStatus).mockResolvedValue({ configured: true, connected: true, state: 'connected', updatedAt: null })
  render(<I18nProvider><AccountAccess onUserChange={vi.fn()} /></I18nProvider>)

  const trigger = await screen.findByRole('button', { name: 'Mở hồ sơ' })
  fireEvent.click(trigger)
  const dialog = await screen.findByRole('dialog', { name: 'Menu hồ sơ' })
  const reconnect = await screen.findByRole('button', { name: 'Kết nối lại hoặc đổi tài khoản Google' })
  expect(dialog).toHaveClass('max-w-[calc(100vw-1.5rem)]')
  expect(reconnect).toHaveClass('max-w-full', 'whitespace-normal', 'break-words')
  fireEvent.pointerDown(reconnect)
  expect(screen.getByRole('dialog', { name: 'Menu hồ sơ' })).toBeInTheDocument()
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole('dialog', { name: 'Menu hồ sơ' })).not.toBeInTheDocument()

  fireEvent.click(trigger)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog', { name: 'Menu hồ sơ' })).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
  target.remove()
  localStorage.removeItem('shopping-recorder-locale')
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
