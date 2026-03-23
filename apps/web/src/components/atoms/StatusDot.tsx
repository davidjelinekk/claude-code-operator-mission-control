import { cn } from '@/lib/utils'

interface StatusDotProps {
  status: 'online' | 'offline' | 'busy' | 'idle'
  className?: string
}

const statusColors: Record<StatusDotProps['status'], string> = {
  online: 'bg-success',
  offline: 'bg-text-tertiary',
  busy: 'bg-error',
  idle: 'bg-warning',
}

export function StatusDot({ status, className }: StatusDotProps) {
  return (
    <span
      className={cn('inline-block h-2 w-2 rounded-full flex-shrink-0', statusColors[status], className)}
      aria-label={status}
    />
  )
}
