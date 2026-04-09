import { createFileRoute, Link } from '@tanstack/react-router'
import { useAgents, type Agent } from '@/hooks/api/agents'
import { useAgentInProgressCount } from '@/hooks/api/tasks'
import { Loader2, Plus } from 'lucide-react'

export const Route = createFileRoute('/agents')({
  component: AgentsPage,
})

const STATUS_DOT: Record<string, string> = {
  available: 'bg-success',
  running: 'bg-warning',
  offline: 'bg-text-tertiary',
  error: 'bg-error',
}

const STATUS_LABEL: Record<string, string> = {
  available: 'available',
  running: 'running',
  offline: 'offline',
  error: 'error',
}

const STATUS_TEXT: Record<string, string> = {
  available: 'text-success',
  running: 'text-warning',
  offline: 'text-text-tertiary',
  error: 'text-error',
}

function AgentCard({ agent }: { agent: Agent }) {
  const inProgress = useAgentInProgressCount(agent.id)
  return (
    <Link to="/agents/$agentId" params={{ agentId: agent.id }} className="block hover:no-underline">
      <div className="border border-border bg-surface p-4 flex flex-col gap-3 hover:border-accent/40 transition-colors">
        {/* header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 flex items-center justify-center bg-surface-hover border border-border text-xl flex-shrink-0">
              {'🤖'}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-text-primary truncate">{agent.name}</p>
              <p className="font-mono text-[10px] text-text-tertiary truncate">{agent.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[agent.status]}`} />
            <span className={`font-mono text-xs ${STATUS_TEXT[agent.status]}`}>
              {STATUS_LABEL[agent.status]}
            </span>
          </div>
        </div>

        {/* model info */}
        <div className="flex flex-col gap-1.5 border-t border-border-subtle pt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest">provider</span>
            <span className="font-mono text-xs text-text-secondary">
              {agent.provider ?? 'claude'}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest">model</span>
            <span className="font-mono text-xs text-text-secondary truncate max-w-[60%] text-right">
              {agent.model ?? '—'}
            </span>
          </div>

          {agent.tools && agent.tools.length > 0 && (
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest">tools</span>
              <span className="font-mono text-xs text-text-tertiary truncate max-w-[60%] text-right">
                {agent.tools.length}
              </span>
            </div>
          )}

          {agent.permissionMode && (
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest">permissions</span>
              <span className="font-mono text-xs text-text-secondary">
                {agent.permissionMode}
              </span>
            </div>
          )}

          {/* In-progress count */}
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest">in progress</span>
            <span className={`font-mono text-xs ${(inProgress.data?.length ?? 0) > 0 ? 'text-warning' : 'text-text-tertiary'}`}>
              {inProgress.data?.length ?? 0}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

function AgentsPage() {
  const { data: agents, isLoading } = useAgents()

  const online = (agents ?? []).filter((a) => a.status === 'available' || a.status === 'running').length
  const total = (agents ?? []).length

  return (
    <div className="flex flex-col gap-6">
      {/* header */}
      <div className="flex items-center justify-between pb-4 border-b border-border-subtle">
        <h1 className="font-mono text-[13px] font-semibold text-text-primary tracking-wide uppercase flex items-center gap-2">
          <span className="text-accent">~/</span>agents
        </h1>
        <div className="flex items-center gap-3">
          {!isLoading && agents && (
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${online > 0 ? 'bg-success' : 'bg-text-tertiary'}`} />
              <span className="font-mono text-xs text-text-secondary">
                {online}/{total} online
              </span>
            </div>
          )}
          <Link to="/agents/new">
            <button className="flex items-center gap-1.5 px-2.5 py-1.5 bg-accent hover:bg-accent text-white font-mono text-xs transition-colors">
              <Plus className="h-3.5 w-3.5" /> New Agent
            </button>
          </Link>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      )}

      {!isLoading && (agents ?? []).length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-text-tertiary">
          <span className="font-mono text-4xl opacity-20">[]</span>
          <span className="font-mono text-sm">no agents configured</span>
          <span className="font-mono text-xs text-border">add agent .md files to ~/.claude/agents/</span>
        </div>
      )}

      {!isLoading && (agents ?? []).length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {(agents ?? []).map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  )
}
