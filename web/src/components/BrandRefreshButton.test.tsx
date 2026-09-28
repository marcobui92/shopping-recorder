import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { BrandRefreshButton } from './BrandRefreshButton'

afterEach(() => cleanup())

it("reloads the page when the LinhCj's logo is activated", () => {
  const onActivate = vi.fn()
  render(<BrandRefreshButton onActivate={onActivate} />)
  const button = screen.getByRole('button', { name: "Reload LinhCj's" })
  fireEvent.click(button)
  expect(onActivate).toHaveBeenCalledOnce()
})

it('does not reload the workspace while an upload operation is active', () => {
  const onActivate = vi.fn()
  render(<BrandRefreshButton disabled onActivate={onActivate} />)
  const button = screen.getByRole('button', { name: "Reload LinhCj's" })
  expect(button).toBeDisabled()
  fireEvent.click(button)
  expect(onActivate).not.toHaveBeenCalled()
})
