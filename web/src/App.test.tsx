import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { getSession } from './api'
import { App } from './App'

vi.mock('./api', async (importOriginal) => ({
  ...await importOriginal<typeof import('./api')>(),
  getSession: vi.fn(),
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
vi.mock('./components/GoogleDriveConnection', () => ({ GoogleDriveConnection: () => null }))
vi.mock('./components/RecorderHistory', () => ({ RecorderHistory: () => <div>Archive content</div> }))

beforeEach(() => {
  localStorage.setItem('shopping-recorder-locale', 'en')
  vi.clearAllMocks()
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
  fireEvent.change(screen.getByLabelText('Workspace draft'), { target: { value: 'keep this draft' } })
  expect(screen.getByRole('button', { name: 'Open profile' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('link', { name: 'Evidence archive' }))
  expect(await screen.findByText('Archive content')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('link', { name: 'Workspace' }))
  expect(screen.getByLabelText('Workspace draft')).toHaveValue('keep this draft')
  expect(screen.getByRole('button', { name: 'Open profile' })).toBeInTheDocument()
  await waitFor(() => expect(getSession).toHaveBeenCalledTimes(1))
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
