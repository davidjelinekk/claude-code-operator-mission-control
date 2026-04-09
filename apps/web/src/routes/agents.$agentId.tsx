import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useMemo } from 'react'
import { Loader2, ArrowLeft, Check, X, Trash2 } from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api, queryClient } from '@/lib/api'
import type { Agent } from '@/hooks/api/agents'
import { useDeleteAgent } from '@/hooks/api/agents'
import type { Task } from '@/hooks/api/boards'

export const Route = createFileRoute('/agents/$agentId')({
  component: AgentDetailPage,
})

interface AgentDetail extends Agent {
  skills?: Record<string, unknown>
  heartbeat?: unknown
}

interface AgentSession {
  id: string
  agentId?: string
  createdAt?: string
  status?: string
}

function useAgentDetail(agentId: string) {
  return useQuery<AgentDetail>({
    queryKey: ['agents', agentId],
    queryFn: () => api.get(`api/agents/${agentId}`).json<AgentDetail>(),
    refetchInterval: 15_000,
  })
}

function useAgentSessions(agentId: string) {
  return useQuery<AgentSession[]>({
    queryKey: ['agents', agentId, 'sessions'],
    queryFn: async () => {
      const result = await api.get(`api/agents/${agentId}/sessions`).json<AgentSession[] | { sessions: AgentSession[] }>()
      if (Array.isArray(result)) return result
      if ('sessions' in result) return result.sessions
      return []
    },
    refetchInterval: 15_000,
  })
}

function usePatchAgent(agentId: string) {
  return useMutation({
    mutationFn: (data: { name?: string; description?: string }) =>
      api.patch(`api/agents/${agentId}`, { json: data }).json<AgentDetail>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents', agentId] })
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })
}

function AgentTasksSection({ agentId }: { agentId: string }) {
  const { data: allTasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ['tasks', 'agent', agentId],
    queryFn: () => api.get('api/tasks', { searchParams: { assignedAgentId: agentId, limit: '100' } }).json<Task[]>(),
    refetchInterval: 30_000,
  })

  const grouped = useMemo(() => {
    const map: Record<string, Task[]> = {}
    for (const t of allTasks) {
      if (!map[t.status]) map[t.status] = []
      map[t.status].push(t)
    }
    return map
  }, [allTasks])

  const statusOrder = ['in_progress', 'inbox', 'review', 'done', 'abandoned']
  const statusLabel: Record<string, string> = {
    in_progress: 'in progress',
    inbox: 'inbox',
    review: 'review',
    done: 'done',
    abandoned: 'abandoned',
  }
  const statusColor: Record<string, string> = {
    in_progress: 'text-warning',
    inbox: 'text-accent',
    review: 'text-text-secondary',
    done: 'text-success',
    abandoned: 'text-text-tertiary',
  }

  if (isLoading) return <div className="h-10 bg-surface-hover animate-pulse" />
  if (allTasks.length === 0) return <span className="font-mono text-xs text-text-tertiary">no assigned tasks</span>

  return (
    <div className="border-t border-border-subtle pt-3 flex flex-col gap-3">
      {statusOrder.filter((s) => grouped[s]?.length > 0).map((status) => (
        <div key={status}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`font-mono text-[10px] uppercase tracking-widest ${statusColor[status]}`}>
              {statusLabel[status]}
            </span>
            <span className="font-mono text-[10px] text-text-tertiary">({grouped[status].length})</span>
          </div>
          <div className="flex flex-col gap-0">
            {grouped[status].slice(0, 10).map((task, i) => (
              <Link
                key={task.id}
                to="/boards/$boardId"
                params={{ boardId: task.boardId }}
                className={`flex items-center justify-between gap-2 py-1.5 hover:bg-surface-hover/40 transition-colors px-1 ${
                  i < grouped[status].length - 1 ? 'border-b border-border-subtle' : ''
                }`}
              >
                <span className="font-mono text-xs text-text-primary truncate hover:text-accent">{task.title}</span>
                <span className="font-mono text-[10px] text-text-tertiary flex-shrink-0 truncate max-w-[100px]">{task.boardId.slice(0, 8)}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

const STATUS_DOT: Record<Agent['status'], string> = {
  available: 'bg-success',
  running: 'bg-warning',
  offline: 'bg-text-tertiary',
  error: 'bg-error',
}
const STATUS_TEXT: Record<Agent['status'], string> = {
  available: 'text-success',
  running: 'text-warning',
  offline: 'text-text-tertiary',
  error: 'text-error',
}

function EditableField({
  label,
  value,
  onSave,
  isPending,
  isError,
  error,
  savedOk,
}: {
  label: string
  value: string
  onSave: (v: string) => void
  isPending?: boolean
  isError?: boolean
  error?: Error | null
  savedOk?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  function commit() {
    if (draft.trim() !== value) onSave(draft.trim())
    setEditing(false)
  }

  function cancel() {
    setDraft(value)
    setEditing(false)
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest flex-shrink-0">{label}</span>
        {editing ? (
          <div className="flex items-center gap-1 flex-1 justify-end">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit()
                if (e.key === 'Escape') cancel()
              }}
              autoFocus
              className="bg-canvas border border-accent px-2 py-0.5 text-xs font-mono text-text-primary focus:outline-none max-w-[200px]"
            />
            <button onClick={commit} disabled={isPending} className="text-success hover:text-success p-0.5 disabled:opacity-50">
              <Check className="w-3 h-3" />
            </button>
            <button onClick={cancel} className="text-text-tertiary hover:text-text-secondary p-0.5">
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 justify-end">
            {savedOk && !isError && (
              <span className="font-mono text-[10px] text-success">Saved</span>
            )}
            <button
              onClick={() => { setDraft(value); setEditing(true) }}
              className="font-mono text-xs text-text-primary hover:text-accent transition-colors text-right truncate max-w-[200px]"
              title="Click to edit"
            >
              {value || '—'}
            </button>
          </div>
        )}
      </div>
      {isError && error && (
        <p className="text-[10px] font-mono text-error text-right">{error.message}</p>
      )}
    </div>
  )
}

function AgentDetailPage() {
  const { agentId } = Route.useParams()
  const navigate = useNavigate()
  const { data: agent, isLoading, isError } = useAgentDetail(agentId)
  const { data: sessions } = useAgentSessions(agentId)
  const patch = usePatchAgent(agentId)
  const deleteAgent = useDeleteAgent()
  const [lastSavedField, setLastSavedField] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    )
  }

  if (isError || !agent) {
    return (
      <div className="flex flex-col gap-4">
        <Link to="/agents" className="flex items-center gap-1.5 font-mono text-xs text-text-tertiary hover:text-text-secondary w-fit">
          <ArrowLeft className="w-3 h-3" /> back to agents
        </Link>
        <div className="text-center py-20 font-mono text-error">Agent not found</div>
      </div>
    )
  }

  const skillKeys = agent.skills ? Object.keys(agent.skills) : []

  return (
    <div className="flex flex-col gap-6">
      {/* header */}
      <div className="flex items-center justify-between pb-4 border-b border-border-subtle">
        <div className="flex items-center gap-3">
          <Link to="/agents" className="flex items-center gap-1.5 font-mono text-xs text-text-tertiary hover:text-accent transition-colors">
            <ArrowLeft className="w-3 h-3" />
          </Link>
          <div className="w-10 h-10 flex items-center justify-center bg-surface-hover border border-border text-xl">
            {'🤖'}
          </div>
          <div>
            <h1 className="font-mono text-[13px] font-semibold text-text-primary tracking-wide">
              {agent.name}
            </h1>
            <span className="font-mono text-[10px] text-text-tertiary">{agent.id}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${STATUS_DOT[agent.status]}`} />
            <span className={`font-mono text-xs ${STATUS_TEXT[agent.status]}`}>{agent.status}</span>
          </div>
          {showDeleteConfirm ? (
            <div className="flex items-center gap-2 border border-error/40 bg-error/10 px-2.5 py-1.5">
              <span className="font-mono text-xs text-error">Delete agent?</span>
              <button
                onClick={() => deleteAgent.mutate(agentId, { onSuccess: () => navigate({ to: '/agents' }) })}
                disabled={deleteAgent.isPending}
                className="font-mono text-xs text-error hover:text-white border border-error px-2 py-0.5 transition-colors disabled:opacity-50"
              >
                {deleteAgent.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'delete'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="font-mono text-xs text-text-tertiary hover:text-text-secondary transition-colors"
              >
                cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 border border-error/40 text-error hover:bg-error/10 font-mono text-xs transition-colors"
            >
              <Trash2 className="h-3 w-3" /> delete
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* info card */}
        <div className="border border-border bg-surface p-4 flex flex-col gap-3">
          <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest">Info</span>
          <div className="flex flex-col gap-2.5 border-t border-border-subtle pt-3">
            <EditableField
              label="name"
              value={agent.name}
              onSave={(v) => { setLastSavedField('name'); patch.mutate({ name: v }) }}
              isPending={patch.isPending && lastSavedField === 'name'}
              isError={patch.isError && lastSavedField === 'name'}
              error={patch.isError && lastSavedField === 'name' ? patch.error : null}
              savedOk={patch.isSuccess && lastSavedField === 'name'}
            />
            <EditableField
              label="description"
              value={agent.description ?? ''}
              onSave={(v) => { setLastSavedField('description'); patch.mutate({ description: v }) }}
              isPending={patch.isPending && lastSavedField === 'description'}
              isError={patch.isError && lastSavedField === 'description'}
              error={patch.isError && lastSavedField === 'description' ? patch.error : null}
              savedOk={patch.isSuccess && lastSavedField === 'description'}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest">provider</span>
              <span className="font-mono text-xs text-text-secondary">
                {agent.provider ?? 'claude'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest">model</span>
              <span className="font-mono text-xs text-text-secondary truncate max-w-[200px] text-right">
                {agent.model ?? '—'}
              </span>
            </div>
            {agent.tools && agent.tools.length > 0 && (
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest">tools</span>
                <span className="font-mono text-xs text-text-tertiary truncate max-w-[200px] text-right">
                  {agent.tools.join(', ')}
                </span>
              </div>
            )}
            {agent.permissionMode && (
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest">permissions</span>
                <span className="font-mono text-xs text-text-secondary">{agent.permissionMode}</span>
              </div>
            )}
          </div>
        </div>

        {/* skills card */}
        <div className="border border-border bg-surface p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest">Skills</span>
            <span className="font-mono text-[10px] text-accent border border-accent/30 bg-accent/10 px-1.5 py-0.5">
              {skillKeys.length}
            </span>
          </div>
          <div className="border-t border-border-subtle pt-3">
            {skillKeys.length === 0 ? (
              <span className="font-mono text-xs text-text-tertiary">no skills configured</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {skillKeys.map((sk) => (
                  <span key={sk} className="font-mono text-[11px] text-text-secondary border border-border-subtle px-2 py-0.5">
                    {sk}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* recent sessions */}
        <div className="border border-border bg-surface p-4 flex flex-col gap-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest">Recent Activity</span>
            <span className="font-mono text-[10px] text-text-tertiary">{(sessions ?? []).length} sessions</span>
          </div>
          <div className="border-t border-border-subtle pt-3">
            {(sessions ?? []).length === 0 ? (
              <span className="font-mono text-xs text-text-tertiary">no recent sessions</span>
            ) : (
              <div className="flex flex-col gap-0">
                {(sessions ?? []).slice(0, 10).map((s, i) => (
                  <div
                    key={s.id}
                    className={`flex items-center justify-between gap-3 py-2 ${
                      i < Math.min((sessions ?? []).length, 10) - 1 ? 'border-b border-border-subtle' : ''
                    }`}
                  >
                    <span className="font-mono text-xs text-text-primary truncate">{s.id}</span>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {s.status && (
                        <span className="font-mono text-[10px] text-text-tertiary">{s.status}</span>
                      )}
                      {s.createdAt && (
                        <span className="font-mono text-[10px] text-text-tertiary">
                          {new Date(s.createdAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Assigned Tasks section */}
        <div className="border border-border bg-surface p-4 flex flex-col gap-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest">Assigned Tasks</span>
          </div>
          <AgentTasksSection agentId={agentId} />
        </div>
      </div>
    </div>
  )
}
