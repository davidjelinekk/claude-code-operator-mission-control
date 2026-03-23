import { cn } from '@/lib/utils'

interface CostBadgeProps {
  cost: string
  className?: string
}

export function CostBadge({ cost, className }: CostBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center border border-border bg-surface-hover px-1.5 py-0.5 text-xs font-mono text-text-secondary',
        className,
      )}
    >
      {cost}
    </span>
  )
}
