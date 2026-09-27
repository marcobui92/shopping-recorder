import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { getGoogleDriveStatus, login, logout, registerAccount } from '../api'
import { I18nProvider } from '../i18n'
import { AccountAccess } from './AccountAccess'

vi.mock('../api', () => ({
  getGoogleDriveStatus: vi.fn(), login: vi.fn(), logout: vi.fn(), registerAccount: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.removeItem('shopping-recorder-remembered-username')
})
afterEach(() => {
  cleanup()
  localStorage.removeItem('shopping-recorder-remembered-username')
  Reflect.deleteProperty(globalThis, 'PasswordCredential')
  Reflect.deleteProperty(navigator, 'credentials')
})

it('renders the shared signed-in profile without checking the session itself', async () => {
  const user = { email: null, id: 'user-1', username: 'operator' }
  const onUserChange = vi.fn()
  render(<AccountAccess onUserChange={onUserChange} user={user} />)

  await screen.findByText(/Signed in as/)
  expect(onUserChange).not.toHaveBeenCalled()
})

it('contains Vietnamese profile actions and dismisses the popup outside or with Escape', async () => {
  localStorage.setItem('shopping-recorder-locale', 'vi')
  const target = document.createElement('span')
  target.id = 'header-profile'
  document.body.append(target)
  vi.mocked(getGoogleDriveStatus).mockResolvedValue({ configured: true, connected: true, state: 'connected', updatedAt: null })
  render(<I18nProvider><AccountAccess onUserChange={vi.fn()} user={{ email: null, id: 'user-1', username: 'operator' }} /></I18nProvider>)

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
  const user = { email: 'operator@example.com', id: 'user-1', username: 'operator' }
  vi.mocked(registerAccount).mockResolvedValue(user)
  const onUserChange = vi.fn()
  render(<AccountAccess onUserChange={onUserChange} user={null} />)

  const account = await screen.findByRole('region', { name: 'Sign in' })
  expect(account).toHaveClass('max-w-lg')
  expect(screen.getByText('Proof for every packing handoff.')).toBeInTheDocument()
  expect(screen.getByText('File-level verification')).toBeInTheDocument()
  expect(screen.getByText('Private application storage')).toBeInTheDocument()
  expect(screen.queryByText('Welcome back to your evidence workspace.')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Create an account' }))
  expect(screen.getByLabelText('Password')).toHaveAttribute('minLength', '6')
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'operator' } })
  fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'operator@example.com' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'abc123' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Create account' }).closest('form')!)

  await vi.waitFor(() => expect(onUserChange).toHaveBeenCalledWith(user))
  expect(registerAccount).toHaveBeenCalledWith({
    email: 'operator@example.com', password: 'abc123', username: 'operator',
  })
  expect(login).not.toHaveBeenCalled()
  expect(logout).not.toHaveBeenCalled()
})

it('remembers the username and delegates password storage to the browser manager', async () => {
  const store = vi.fn().mockResolvedValue(undefined)
  class TestPasswordCredential {
    id: string
    name: string
    password: string
    constructor(data: { id: string; name: string; password: string }) { Object.assign(this, data); this.id = data.id; this.name = data.name; this.password = data.password }
  }
  Object.defineProperty(globalThis, 'PasswordCredential', { configurable: true, value: TestPasswordCredential })
  Object.defineProperty(navigator, 'credentials', { configurable: true, value: { store } })
  vi.mocked(login).mockResolvedValue({ email: null, id: 'user-1', username: 'operator' })
  const onUserChange = vi.fn()
  render(<AccountAccess onUserChange={onUserChange} user={null} />)

  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'operator' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
  fireEvent.click(screen.getByRole('checkbox', { name: /Remember username and password/ }))
  fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!)

  await vi.waitFor(() => expect(onUserChange).toHaveBeenCalledWith({ email: null, id: 'user-1', username: 'operator' }))
  expect(localStorage.getItem('shopping-recorder-remembered-username')).toBe('operator')
  expect([...Array(localStorage.length)].map((_, index) => localStorage.getItem(localStorage.key(index)!))).not.toContain('secret123')
  expect(store).toHaveBeenCalledWith(expect.objectContaining({ id: 'operator', password: 'secret123' }))

  cleanup()
  render(<AccountAccess onUserChange={vi.fn()} user={null} />)
  expect(screen.getByLabelText('Username')).toHaveValue('operator')
  expect(screen.getByRole('checkbox', { name: /Remember username and password/ })).toBeChecked()
})
