import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useMemo } from 'react'
import { useActivity, type ActivityEvent } from '@/hooks/api/activity'
import { useAgentNameMap } from '@/hooks/api/agents'
import { useBoards } from '@/hooks/api/boards'
import { relativeTime } from '@/lib/utils'

export const Route = createFileRoute('/activity')({
  component: ActivityPage,
})

type EventFilter = 'all' | 'task.note' | 'approval' | 'board.chat'

function eventColor(eventType: string): string {
  if (eventType === 'task.note') return '#58a6ff'
  if (eventType.startsWith('approval.')) return '#d29922'
  if (eventType === 'board.chat') return '#3fb950'
  return '#6e7681'
}

function EventItem({ event, agentName, boardName }: { event: ActivityEvent; agentName: (id: string) => string; boardName: (id: string) => string }) {
  const color = eventColor(event.eventType)
  return (
    <div className="flex gap-3 py-3 border-b border-border-subtle">
      <div className="flex-shrink-0 mt-1.5">
        <span
          className="block w-2 h-2 rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 border"
            style={{ color, borderColor: `${color}55` }}
          >
            {event.eventType}
          </span>
          {event.agentId && (
            <span className="text-[11px] font-mono text-text-tertiary">{agentName(event.agentId)}</span>
          )}
          <span className="text-[11px] font-mono text-text-tertiary ml-auto">{relativeTime(event.createdAt)}</span>
        </div>
        <p className="text-sm text-text-primary leading-snug">{event.message}</p>
        {(event.boardId || event.taskId) && (
          <div className="flex gap-3 mt-1">
            {event.boardId && (
              <a
                href={`/boards/${event.boardId}`}
                className="text-[11px] font-mono text-accent hover:underline"
              >
                {boardName(event.boardId)}
              </a>
            )}
            {event.taskId && event.boardId && (
              <Link
                to="/boards/$boardId"
                params={{ boardId: event.boardId }}
                className="text-[11px] font-mono text-accent hover:underline"
              >
                task:{event.taskId.slice(0, 8)}
              </Link>
            )}
            {event.taskId && !event.boardId && (
              <span className="text-[11px] font-mono text-text-tertiary">task:{event.taskId.slice(0, 8)}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const FILTERS: { value: EventFilter; label: string }[] = [
  { value: 'all', label: 'all' },
  { value: 'task.note', label: 'task.note' },
  { value: 'approval', label: 'approval.*' },
  { value: 'board.chat', label: 'board.chat' },
]

function ActivityPage() {
  const [filter, setFilter] = useState<EventFilter>('all')
  const { data: events, isLoading } = useActivity()
  const agentName = useAgentNameMap()
  const boards = useBoards()
  const boardName = useMemo(() => {
    const map = new Map<string, string>()
    for (const b of boards.data ?? []) map.set(b.id, b.name)
    return (id: string) => map.get(id) ?? 'board'
  }, [boards.data])

  const filtered = (events ?? []).filter((e) => {
    if (filter === 'all') return true
    if (filter === 'approval') return e.eventType.startsWith('approval.')
    return e.eventType === filter
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between border-b border-border-subtle pb-4 mb-5">
        <h1 className="font-mono text-[13px] font-semibold text-text-primary tracking-wide uppercase">
          <span className="text-accent">~/</span>activity
        </h1>
        <div className="flex gap-1">
          {FILTERS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`px-2.5 py-1 font-mono text-[11px] uppercase transition-colors border ${
                filter === value
                  ? 'text-accent border-accent bg-accent/[0.13]'
                  : 'text-text-tertiary border-border hover:text-text-secondary hover:border-text-tertiary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-16 font-mono text-text-tertiary">loading…</div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16 font-mono text-text-tertiary">[ ]</div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="border border-border bg-surface px-4">
          {filtered.map((event) => (
            <EventItem key={event.id} event={event} agentName={agentName} boardName={boardName} />
          ))}
        </div>
      )}
    </div>
  )
}
