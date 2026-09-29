import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { clearStorageProvidersCache, getSession, getSettings, login, logout } from './api'
import { App } from './App'
import { GoogleDriveConnection } from './components/GoogleDriveConnection'

vi.mock('./api', async (importOriginal) => ({
  ...await importOriginal<typeof import('./api')>(),
  getSession: vi.fn(),
  getSettings: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  clearStorageProvidersCache: vi.fn(),
}))
vi.mock('./components/RecorderWorkflow', () => ({
  RecorderWorkflow: ({ onBusyChange }: { onBusyChange?: (busy: boolean) => void }) => {
    const [draft, setDraft] = useState('')
    return <div>
    Workspace content
    <input aria-label="Workspace draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
    <button type="button" onClick={() => onBusyChange?.(true)}>Simulate active upload</button>
  </div>
  },
}))
vi.mock('./components/GoogleDriveConnection', () => ({ GoogleDriveConnection: vi.fn(() => null) }))
vi.mock('./components/RecorderHistory', () => ({ RecorderHistory: () => {
  const [filter, setFilter] = useState('')
  return <div>Archive content<input aria-label="Archive filter" value={filter} onChange={(event) => setFilter(event.target.value)} /></div>
} }))

beforeEach(() => {
  localStorage.setItem('shopping-recorder-locale', 'en')
  vi.clearAllMocks()
  vi.mocked(getSettings).mockResolvedValue({ retentionDays: 30 })
})

afterEach(() => {
  cleanup()
  localStorage.removeItem('shopping-recorder-locale')
})

it('shows an accessible workspace skeleton while the silent session check is pending', () => {
  vi.mocked(getSession).mockReturnValue(new Promise(() => {}))
  render(<MemoryRouter><App /></MemoryRouter>)

  expect(screen.queryByRole('link', { name: 'Workspace' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Evidence archive' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()
  expect(screen.queryByText(/Checking (API connection|your session)/)).not.toBeInTheDocument()
  expect(screen.getByRole('status', { name: 'Loading your workspace' })).toBeInTheDocument()
  const language = screen.getByRole('button', { name: 'Language' })
  expect(language).toHaveTextContent('🇺🇸')
  expect(language).not.toHaveTextContent(/VI|EN/)
  fireEvent.click(language)
  expect(screen.getByRole('option', { name: 'Tiếng Việt' })).toHaveTextContent('🇻🇳')
  expect(screen.getByRole('option', { name: 'English' })).toHaveTextContent('🇺🇸')
})

it('centers a compact login form after silent session restoration', async () => {
  vi.mocked(getSession).mockRejectedValue(new Error('No session'))
  render(<MemoryRouter><App /></MemoryRouter>)

  const heading = await screen.findByRole('heading', { name: 'Sign in' })
  const card = heading.closest('section')
  expect(card).toHaveClass('max-w-lg')
  expect(card?.parentElement).toHaveClass('items-center', 'justify-center', 'min-h-[calc(100dvh-9rem)]')
  expect(screen.getByLabelText('Username')).toBeInTheDocument()
  expect(screen.getByLabelText('Password')).toBeInTheDocument()
  expect(screen.getByText('Proof for every packing handoff.')).toBeInTheDocument()
  expect(screen.getByText('Capture packing and unpacking evidence, verify every file, and keep each operational record accountable.')).toBeInTheDocument()
  expect(screen.getByText("LinhCj's records packing and unpacking evidence with private photos and videos.")).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Workspace' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Evidence archive' })).not.toBeInTheDocument()
  expect(screen.queryByText('Welcome back to your evidence workspace.')).not.toBeInTheDocument()
})

it('reuses one resolved session across workspace and archive navigation', async () => {
  vi.mocked(getSession).mockResolvedValue({ email: null, id: 'user-1', username: 'operator' })
  render(<MemoryRouter><App /></MemoryRouter>)

  expect(await screen.findByText('Workspace content')).toBeInTheDocument()
  expect(screen.queryByText('Archive content')).not.toBeInTheDocument()
  expect(getSettings).not.toHaveBeenCalled()
  expect(GoogleDriveConnection).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Workspace draft'), { target: { value: 'keep this draft' } })
  expect(screen.getByRole('button', { name: 'Open profile' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('link', { name: 'Evidence archive' }))
  expect(await screen.findByText('Archive content')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Archive filter'), { target: { value: 'order-123' } })
  fireEvent.click(screen.getByRole('link', { name: 'Workspace' }))
  expect(screen.getByLabelText('Workspace draft')).toHaveValue('keep this draft')
  expect(screen.getByText('Archive content')).not.toBeVisible()
  fireEvent.click(screen.getByRole('link', { name: 'Evidence archive' }))
  expect(screen.getByLabelText('Archive filter')).toHaveValue('order-123')
  expect(getSettings).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Open profile' })).toBeInTheDocument()
  await waitFor(() => expect(getSession).toHaveBeenCalledTimes(1))
})

it('loads Settings only when opened and retains its unsaved value without refetching', async () => {
  vi.mocked(getSession).mockResolvedValue({ email: null, id: 'user-1', username: 'operator' })
  render(<MemoryRouter><App /></MemoryRouter>)
  await screen.findByText('Workspace content')
  expect(getSettings).not.toHaveBeenCalled()
  expect(GoogleDriveConnection).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('link', { name: 'Settings' }))
  const retention = await screen.findByLabelText('Auto-delete evidence after (days)')
  fireEvent.change(retention, { target: { value: '7' } })
  expect(GoogleDriveConnection).toHaveBeenCalled()
  fireEvent.click(screen.getByRole('link', { name: 'Workspace' }))
  expect(retention).not.toBeVisible()
  fireEvent.click(screen.getByRole('link', { name: 'Settings' }))
  expect(retention).toBeVisible()
  expect(retention).toHaveValue(7)
  expect(getSettings).toHaveBeenCalledTimes(1)
  expect(screen.queryByText('Archive content')).not.toBeInTheDocument()
})

it.each(['/archive', '/settings'])('opens %s directly without mounting Workspace', async (path) => {
  vi.mocked(getSession).mockResolvedValue({ email: null, id: 'user-1', username: 'operator' })
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
  if (path === '/archive') {
    await screen.findByText('Archive content')
    expect(getSettings).not.toHaveBeenCalled()
    expect(GoogleDriveConnection).not.toHaveBeenCalled()
  } else {
    await screen.findByLabelText('Auto-delete evidence after (days)')
    expect(screen.queryByText('Archive content')).not.toBeInTheDocument()
  }
  expect(screen.queryByText('Workspace content')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('link', { name: 'Workspace' }))
  expect(await screen.findByText('Workspace content')).toBeVisible()
  expect(getSession).toHaveBeenCalledTimes(1)
})

it('clears visited pages and drafts on logout before the next login', async () => {
  const user = { email: null, id: 'user-1', username: 'operator' }
  vi.mocked(getSession).mockResolvedValue(user)
  vi.mocked(logout).mockResolvedValue(undefined)
  vi.mocked(login).mockResolvedValue(user)
  render(<MemoryRouter><App /></MemoryRouter>)
  await screen.findByText('Workspace content')
  fireEvent.change(screen.getByLabelText('Workspace draft'), { target: { value: 'private draft' } })
  fireEvent.click(screen.getByRole('link', { name: 'Evidence archive' }))
  await screen.findByText('Archive content')
  fireEvent.click(screen.getByRole('button', { name: 'Open profile' }))
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  await screen.findByRole('heading', { name: 'Sign in' })
  expect(screen.queryByText('Workspace content')).not.toBeInTheDocument()
  expect(screen.queryByText('Archive content')).not.toBeInTheDocument()
  expect(clearStorageProvidersCache).toHaveBeenCalledTimes(1)

  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'operator' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  await screen.findByText('Archive content')
  expect(screen.queryByText('Workspace content')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('link', { name: 'Workspace' }))
  expect(screen.getByLabelText('Workspace draft')).toHaveValue('')
})

it('disables the header reload control while the recorder reports active work', async () => {
  vi.mocked(getSession).mockResolvedValue({ email: null, id: 'user-1', username: 'operator' })
  render(<MemoryRouter><App /></MemoryRouter>)

  const reload = await screen.findByRole('button', { name: "Reload LinhCj's" })
  expect(reload).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Simulate active upload' }))
  expect(reload).toBeDisabled()
})

it('keeps Vietnamese authenticated navigation compact on mobile and labeled accessibly', async () => {
  localStorage.setItem('shopping-recorder-locale', 'vi')
  vi.mocked(getSession).mockResolvedValue({ email: null, id: 'user-1', username: 'operator' })
  render(<MemoryRouter><App /></MemoryRouter>)

  const workspace = await screen.findByRole('link', { name: 'Không gian làm việc' })
  const archive = screen.getByRole('link', { name: 'Kho bằng chứng' })
  expect(workspace).toHaveClass('size-9', 'sm:w-auto')
  expect(archive).toHaveClass('size-9', 'sm:w-auto')
  expect(workspace.querySelector('span')).toHaveClass('hidden', 'sm:inline')
  expect(archive.querySelector('span')).toHaveClass('hidden', 'sm:inline')
  expect(workspace.closest('nav')).toHaveClass('gap-1', 'sm:gap-2')
})
