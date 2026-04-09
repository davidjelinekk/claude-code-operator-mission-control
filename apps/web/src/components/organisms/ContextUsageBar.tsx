import { Gauge } from 'lucide-react'
import { useContextUsage } from '@/hooks/api/orchestration'

/** Fallback when the SDK doesn't provide maxTokens (shouldn't happen, but safe default) */
const DEFAULT_CONTEXT_WINDOW = 200_000

const DEFAULT_COLORS = [
  '#d2a8ff', // assistant purple
  '#7ee787', // success green
  '#79c0ff', // accent blue
  '#ffa657', // warning orange
  '#ff7b72', // error red
  '#a5d6ff', // light blue
  '#f0883e', // orange
  '#56d364', // bright green
]

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

interface ContextUsageBarProps {
  sessionId: string
  enabled?: boolean
}

export function ContextUsageBar({ sessionId, enabled = true }: ContextUsageBarProps) {
  const { data, isLoading, isError } = useContextUsage(enabled ? sessionId : null)

  if (!enabled) return null

  const categories = data?.categories ?? []
  const total = data?.totalTokens ?? 0
  // Prefer the SDK-reported maxTokens (respects 1M beta, compaction, etc.)
  const maxTokens = data?.maxTokens ?? DEFAULT_CONTEXT_WINDOW
  const pct = data?.percentage ?? (total > 0 ? Math.min(100, (total / maxTokens) * 100) : 0)

  const visible = categories.filter((c) => !c.isDeferred && c.tokens > 0)

  return (
    <div className="border border-border bg-surface p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="h-3.5 w-3.5 text-text-tertiary" />
          <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest">
            Context Usage
          </span>
        </div>
        <span className="font-mono text-xs text-text-secondary">
          {isLoading || isError || !data ? (
            <span className="text-text-tertiary">—</span>
          ) : (
            <>
              <span className="text-accent">{formatTokens(total)}</span>
              <span className="text-text-tertiary"> / {formatTokens(maxTokens)}</span>
              <span className="text-text-tertiary"> ({pct.toFixed(1)}%)</span>
            </>
          )}
        </span>
      </div>

      <div className="border-t border-border-subtle pt-3 flex flex-col gap-2">
        {/* stacked bar */}
        <div className="w-full h-2 bg-canvas border border-border flex overflow-hidden">
          {visible.length === 0 ? (
            <div className="w-full h-full" />
          ) : (
            visible.map((c, i) => {
              const width = total > 0 ? (c.tokens / maxTokens) * 100 : 0
              const color = c.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]
              return (
                <div
                  key={c.name}
                  title={`${c.name}: ${formatTokens(c.tokens)}`}
                  style={{ width: `${width}%`, backgroundColor: color }}
                  className="h-full"
                />
              )
            })
          )}
        </div>

        {/* legend */}
        {visible.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {visible.map((c, i) => {
              const color = c.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]
              return (
                <div key={c.name} className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 inline-block"
                    style={{ backgroundColor: color }}
                  />
                  <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest">
                    {c.name}
                  </span>
                  <span className="font-mono text-[10px] text-text-secondary">
                    {formatTokens(c.tokens)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
        {visible.length === 0 && (
          <span className="font-mono text-xs text-text-tertiary">
            {isLoading ? 'loading...' : '—'}
          </span>
        )}
      </div>
    </div>
  )
}

export default ContextUsageBar
