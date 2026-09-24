import { Children, type ChangeEvent, type SelectHTMLAttributes, useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

import { cn } from '../../lib/utils'

export function Select({ className, children, value, defaultValue, onChange, id, disabled, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const options = Children.toArray(children).filter((child): child is React.ReactElement<{ value?: string; disabled?: boolean; children?: React.ReactNode }> => Boolean(child && typeof child === 'object' && 'props' in child))
  const initial = String(value ?? defaultValue ?? (options[0]?.props.value ?? ''))
  const [current, setCurrent] = useState(initial)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => { if (value !== undefined) setCurrent(String(value)) }, [value])
  useEffect(() => { const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }; document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close) }, [])
  const selected = options.find((option) => String(option.props.value ?? '') === current)
  function choose(next: string) { setCurrent(next); setOpen(false); onChange?.({ target: { value: next, name: props.name } } as ChangeEvent<HTMLSelectElement>) }
  return <div className="relative" ref={root}>
    <select aria-hidden="true" className="pointer-events-none absolute h-px w-px opacity-0" disabled={disabled} id={id} tabIndex={-1} value={current} onChange={(event) => choose(event.target.value)} {...props}>{children}</select>
    <button aria-controls={open ? `${id}-options` : undefined} aria-expanded={open} aria-haspopup="listbox" className={cn('flex h-10 w-full items-center justify-between rounded-lg border border-input bg-background px-3 text-left text-base shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm', className)} disabled={disabled} id={`${id}-trigger`} type="button" onClick={() => setOpen((state) => !state)} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen(true) } }}><span className="truncate">{selected?.props.children}</span><ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /></button>
    {open && !disabled && <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border bg-card p-1 text-foreground shadow-xl" id={`${id}-options`} role="listbox">{options.map((option) => { const optionValue = String(option.props.value ?? ''); return <button className="flex min-h-10 w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent disabled:pointer-events-none disabled:opacity-50" disabled={option.props.disabled} key={optionValue} role="option" aria-selected={optionValue === current} type="button" onClick={() => choose(optionValue)}><span>{option.props.children}</span>{optionValue === current && <Check aria-hidden="true" className="size-4" />}</button> })}</div>}
  </div>
}
