import { type ProgressHTMLAttributes } from 'react'

import { cn } from '../../lib/utils'

export function Progress({ className, value = 0, ...props }: ProgressHTMLAttributes<HTMLProgressElement>) {
  return <progress className={cn('h-2 w-full overflow-hidden rounded-full bg-secondary accent-primary', className)} data-slot="progress" value={value} max={100} {...props} />
}
