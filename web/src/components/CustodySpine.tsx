import type { ReactNode } from 'react'
import { Check } from 'lucide-react'

import { cn } from '../lib/utils'

export type CustodySpineState = 'done' | 'current' | 'upcoming'

export interface CustodySpineNode {
  key: string
  label: ReactNode
  detail?: string
  state: CustodySpineState
}

const chipByState: Record<CustodySpineState, string> = {
  done: 'bg-seal-tint text-seal',
  current: 'bg-primary text-primary-foreground',
  upcoming: 'border border-input bg-transparent text-muted-foreground',
}

export function CustodySpine({ nodes, orientation = 'horizontal', ariaLabel, className }: {
  nodes: CustodySpineNode[]
  orientation?: 'horizontal' | 'vertical'
  ariaLabel: string
  className?: string
}) {
  if (orientation === 'vertical') {
    return (
      <ol aria-label={ariaLabel} className={cn('space-y-0', className)}>
        {nodes.map((node, index) => (
          <li key={node.key} className="relative flex gap-3 pb-4 last:pb-0" aria-current={node.state === 'current' ? 'step' : undefined}>
            {index < nodes.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-3 top-7 w-px bg-border" />}
            <span aria-hidden="true" className={cn('z-10 grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold', chipByState[node.state])}>
              {node.state === 'done' ? <Check className="size-3.5" /> : index + 1}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-sm font-medium text-foreground">{node.label}</p>
              {node.detail && <p className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">{node.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
    )
  }

  return (
    <ol aria-label={ariaLabel} className={cn('flex flex-wrap items-center gap-3', className)}>
      {nodes.map((node, index) => (
        <li key={node.key} className="flex items-center gap-2" aria-current={node.state === 'current' ? 'step' : undefined}>
          {index > 0 && <span aria-hidden="true" className="mr-1 h-px w-6 bg-border" />}
          <span aria-hidden="true" className={cn('grid size-6 place-items-center rounded-full text-xs font-semibold', chipByState[node.state])}>
            {node.state === 'done' ? <Check aria-hidden="true" className="size-3.5" /> : index + 1}
          </span>
          {node.label}
        </li>
      ))}
    </ol>
  )
}
