import { cn } from '@/lib/utils'

interface AgentChipProps {
  emoji: string
  name: string
  online?: boolean
  className?: string
}

export function AgentChip({ emoji, name, online = false, className }: AgentChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 border border-border bg-surface-hover px-2 py-0.5 text-xs text-text-primary',
        className,
      )}
    >
      <span>{emoji}</span>
      <span>{name}</span>
      <span
        className={cn('inline-block h-2 w-2 rounded-full flex-shrink-0', online ? 'bg-success' : 'bg-text-tertiary')}
        aria-label={online ? 'online' : 'offline'}
      />
    </span>
  )
}
