import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

import { BrandRefreshButton } from './BrandRefreshButton'

it("reloads the page when the LinhCj's logo is activated", () => {
  const onActivate = vi.fn()
  render(<BrandRefreshButton onActivate={onActivate} />)
  const button = screen.getByRole('button', { name: "Reload LinhCj's" })
  fireEvent.click(button)
  expect(onActivate).toHaveBeenCalledOnce()
})
