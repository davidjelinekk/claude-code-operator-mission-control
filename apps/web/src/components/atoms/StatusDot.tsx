import { cn } from '@/lib/utils'

interface StatusDotProps {
  status: 'online' | 'offline' | 'busy' | 'idle'
  className?: string
}

const statusColors: Record<StatusDotProps['status'], string> = {
  online: 'bg-[#3fb950]',
  offline: 'bg-[#6e7681]',
  busy: 'bg-[#f85149]',
  idle: 'bg-[#d29922]',
}

export function StatusDot({ status, className }: StatusDotProps) {
  return (
    <span
      className={cn('inline-block h-2 w-2 rounded-full flex-shrink-0', statusColors[status], className)}
      aria-label={status}
    />
  )
}
