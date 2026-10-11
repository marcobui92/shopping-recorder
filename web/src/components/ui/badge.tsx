import { type HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../../lib/utils'

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold', {
  variants: {
    variant: {
      default: 'border-transparent bg-muted text-muted-foreground',
      outline: 'border-border bg-background text-muted-foreground',
      success: 'border-seal/30 bg-seal-tint text-seal',
      warning: 'border-ledger-amber/30 bg-ledger-amber-tint text-ledger-amber',
      danger: 'border-seal-crimson/30 bg-seal-crimson-tint text-seal-crimson',
    },
  },
  defaultVariants: { variant: 'default' },
})

export function Badge({ className, variant, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ className, variant }))} data-slot="badge" {...props} />
}
