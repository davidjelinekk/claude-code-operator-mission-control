import { useState } from 'react'
import { Loader2, Users, ChevronRight, ChevronDown } from 'lucide-react'
import { useSessionSubagents, useSubagentMessages } from '@/hooks/api/orchestration'

interface SubagentViewerProps {
  sessionId: string
}

export function SubagentViewer({ sessionId }: SubagentViewerProps) {
  const { data: agentIds, isLoading, isError, error } = useSessionSubagents(sessionId)
  const [expanded, setExpanded] = useState<string | null>(null)

  const toggle = (id: string) => {
    setExpanded((prev) => (prev === id ? null : id))
  }

  return (
    <div className="border border-border bg-surface p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-text-tertiary" />
          <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest">
            Subagents
          </span>
        </div>
        <span className="font-mono text-[10px] text-accent border border-accent/30 bg-accent/10 px-1.5 py-0.5">
          {agentIds?.length ?? 0}
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
        </div>
      ) : isError ? (
        <div className="border-t border-border-subtle pt-3">
          <span className="font-mono text-xs text-error">
            {error instanceof Error ? error.message : 'failed to load subagents'}
          </span>
        </div>
      ) : !agentIds || agentIds.length === 0 ? (
        <div className="border-t border-border-subtle pt-3">
          <span className="font-mono text-xs text-text-tertiary">no subagents</span>
        </div>
      ) : (
        <div className="border-t border-border-subtle pt-3 flex flex-col gap-0">
          {agentIds.map((id, i) => {
            const isOpen = expanded === id
            return (
              <div
                key={id}
                className={i < agentIds.length - 1 ? 'border-b border-border-subtle' : ''}
              >
                <button
                  onClick={() => toggle(id)}
                  className="w-full flex items-center gap-2 py-2 text-left hover:bg-canvas transition-colors"
                >
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 text-accent shrink-0" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-text-tertiary shrink-0" />
                  )}
                  <span
                    className="font-mono text-xs text-text-primary truncate flex-1"
                    title={id}
                  >
                    {id}
                  </span>
                </button>
                {isOpen && <SubagentMessages sessionId={sessionId} agentId={id} />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SubagentMessages({ sessionId, agentId }: { sessionId: string; agentId: string }) {
  const { data: messages, isLoading, isError, error } = useSubagentMessages(sessionId, agentId)

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2 pl-5">
        <Loader2 className="h-3 w-3 animate-spin text-accent" />
        <span className="font-mono text-xs text-text-tertiary">loading messages...</span>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="py-2 pl-5">
        <span className="font-mono text-[11px] text-error">
          {error instanceof Error ? error.message : 'failed to load messages'}
        </span>
      </div>
    )
  }

  if (!messages || messages.length === 0) {
    return (
      <div className="py-2 pl-5">
        <span className="font-mono text-[11px] text-text-tertiary">no messages</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1 py-2 pl-5 max-h-64 overflow-y-auto">
      {messages.map((msg, i) => {
        const type = typeof msg.type === 'string' ? msg.type : 'message'
        // subtype lives on the nested `message` object for SessionMessage shape
        const nested = (msg.message as Record<string, unknown> | undefined) ?? undefined
        const subtype =
          (typeof msg.subtype === 'string' ? msg.subtype : undefined) ??
          (nested && typeof nested.subtype === 'string' ? (nested.subtype as string) : undefined)
        const preview = extractPreview(msg)
        return (
          <div key={i} className="font-mono text-[11px] flex gap-2">
            <span className="text-text-tertiary w-6 text-right shrink-0 select-none">
              {i + 1}
            </span>
            <span className="text-accent-hover shrink-0">
              {type}
              {subtype && <span className="text-text-tertiary">:{subtype}</span>}
            </span>
            {preview && (
              <span className="text-text-secondary truncate flex-1" title={preview}>
                {preview.length > 140 ? preview.slice(0, 140) + '...' : preview}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function extractPreview(msg: Record<string, unknown>): string {
  if (typeof msg.content === 'string') return msg.content
  if (typeof msg.text === 'string') return msg.text
  const message = msg.message as Record<string, unknown> | undefined
  if (message) {
    if (typeof message.content === 'string') return message.content
    if (Array.isArray(message.content)) {
      const first = message.content.find(
        (b): b is { text: string } =>
          typeof b === 'object' && b !== null && typeof (b as { text?: unknown }).text === 'string',
      )
      if (first) return first.text
    }
  }
  return ''
}

export default SubagentViewer
