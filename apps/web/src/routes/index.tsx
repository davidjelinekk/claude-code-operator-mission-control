import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useAnalyticsSummary, useAnalyticsByAgent } from '@/hooks/api/analytics'
import { useBoards } from '@/hooks/api/boards'
import { useInboxQueue, useOverdueTasks, useFailedTasksAnalytics } from '@/hooks/api/tasks'
import { useAgentNameMap } from '@/hooks/api/agents'

export const Route = createFileRoute('/')({
  component: DashboardPage,
})

function getRangeDates(): { start: string; end: string } {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  return { start: start.toISOString(), end: end.toISOString() }
}

const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-[#3d1c1c] border border-[#f85149]/50 text-[#f85149]',
  medium: 'bg-[#271700] border border-[#d29922]/50 text-[#d29922]',
  low: 'bg-[#0d1117] border border-[#30363d] text-[#6e7681]',
}

function DashboardPage() {
  const { start, end } = useMemo(() => getRangeDates(), [])

  const summary = useAnalyticsSummary(start, end)
  const byAgent = useAnalyticsByAgent(start, end)
  const boards = useBoards()
  const queue = useInboxQueue(undefined, 10)
  const agentName = useAgentNameMap()

  const boardCount = boards.data?.length ?? 0

  const totalCost = summary.data ? `$${parseFloat(summary.data.totalCostUsd).toFixed(2)}` : '—'
  const cacheHitPct = summary.data ? `${summary.data.cacheHitPct.toFixed(1)}%` : '—'

  const turnCount = useMemo(() => {
    if (!byAgent.data) return '—'
    return String(byAgent.data.reduce((sum, a) => sum + a.turnCount, 0))
  }, [byAgent.data])

  const topAgents = useMemo(() => {
    if (!byAgent.data) return []
    return [...byAgent.data]
      .sort((a, b) => parseFloat(b.totalCostUsd) - parseFloat(a.totalCostUsd))
      .slice(0, 5)
  }, [byAgent.data])

  const boardsById = useMemo(() => {
    const map = new Map<string, string>()
    boards.data?.forEach((b) => map.set(b.id, b.name))
    return map
  }, [boards.data])

  const overdue = useOverdueTasks()
  const failed = useFailedTasksAnalytics(start, end)
  const blockedTasks = useMemo(() => {
    return (queue.data ?? []).filter((t) => t.depCount && t.depCount > 0).slice(0, 5)
  }, [queue.data])

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 mb-5 border-b border-[#21262d]">
        <h1 className="font-mono text-[13px] font-semibold text-[#e6edf3] tracking-wide uppercase flex items-center gap-2">
          <span className="text-[#58a6ff]">~/</span>mission control
        </h1>
        <span className="font-mono text-[11px] text-[#6e7681]">last 30 days</span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="border border-[#30363d] bg-[#161b22] p-5" style={{ borderTop: '2px solid #58a6ff' }}>
          <p className="text-xs font-medium uppercase tracking-wider text-[#8b949e] mb-1">Total Cost</p>
          <p className="text-3xl font-bold text-[#58a6ff] font-mono">{totalCost}</p>
        </div>
        <div className="border border-[#30363d] bg-[#161b22] p-5" style={{ borderTop: '2px solid #a371f7' }}>
          <p className="text-xs font-medium uppercase tracking-wider text-[#8b949e] mb-1">Turns</p>
          <p className="text-3xl font-bold text-[#e6edf3] font-mono">{turnCount}</p>
        </div>
        <div className="border border-[#30363d] bg-[#161b22] p-5" style={{ borderTop: '2px solid #3fb950' }}>
          <p className="text-xs font-medium uppercase tracking-wider text-[#8b949e] mb-1">Active Boards</p>
          <p className="text-3xl font-bold text-[#3fb950] font-mono">
            {boards.isLoading ? '—' : boardCount}
          </p>
        </div>
        <div
          className="border border-[#30363d] bg-[#161b22] p-5"
          style={{ borderTop: summary.data ? (summary.data.cacheHitPct > 50 ? '2px solid #3fb950' : '2px solid #d29922') : '2px solid #d29922' }}
        >
          <p className="text-xs font-medium uppercase tracking-wider text-[#8b949e] mb-1">Cache Hit %</p>
          <p className={`text-3xl font-bold font-mono ${
            summary.data
              ? summary.data.cacheHitPct > 50
                ? 'text-[#3fb950]'
                : 'text-[#d29922]'
              : 'text-[#e6edf3]'
          }`}>
            {cacheHitPct}
          </p>
        </div>
      </div>

      {/* Two-column layout: Inbox Queue + Cost by Agent */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Left: Inbox Queue */}
        <div className="xl:col-span-2 border border-[#30363d] bg-[#161b22] p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-medium uppercase tracking-wider text-[#8b949e]">Inbox Queue</p>
            <Link
              to="/boards"
              className="font-mono text-[11px] text-[#58a6ff] hover:text-[#79c0ff] transition-colors"
            >
              view all →
            </Link>
          </div>

          {queue.isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 bg-[#21262d] animate-pulse" />
              ))}
            </div>
          )}

          {!queue.isLoading && (!queue.data || queue.data.length === 0) && (
            <div className="py-10 flex flex-col items-center gap-2 text-[#6e7681]">
              <span className="font-mono text-[28px] opacity-20">[]</span>
              <span className="font-mono text-[12px]">inbox is empty</span>
            </div>
          )}

          {queue.data && queue.data.length > 0 && (
            <div className="space-y-1">
              {queue.data.map((task) => (
                <Link
                  key={task.id}
                  to="/boards/$boardId"
                  params={{ boardId: task.boardId }}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-[#21262d]/60 transition-colors group"
                >
                  <span className={`font-mono text-[10px] px-1.5 py-0.5 flex-shrink-0 ${PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.low}`}>
                    {task.priority}
                  </span>
                  <span className="flex-1 text-sm text-[#e6edf3] group-hover:text-[#58a6ff] transition-colors truncate">
                    {task.title}
                  </span>
                  {boardsById.has(task.boardId) && (
                    <span className="flex-shrink-0 font-mono text-[10px] text-[#6e7681] bg-[#0d1117] border border-[#21262d] px-1.5 py-0.5 truncate max-w-[120px]">
                      {boardsById.get(task.boardId)}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Right: Cost by Agent */}
        <div className="border border-[#30363d] bg-[#161b22] p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-medium uppercase tracking-wider text-[#8b949e]">Cost by Agent</p>
            <Link
              to="/analytics"
              className="font-mono text-[11px] text-[#58a6ff] hover:text-[#79c0ff] transition-colors"
            >
              details →
            </Link>
          </div>

          {byAgent.isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-8 bg-[#21262d] animate-pulse" />
              ))}
            </div>
          )}

          {!byAgent.isLoading && topAgents.length === 0 && (
            <div className="py-10 flex flex-col items-center gap-2 text-[#6e7681]">
              <span className="font-mono text-[28px] opacity-20">—</span>
              <span className="font-mono text-[12px]">no agent data</span>
            </div>
          )}

          {topAgents.length > 0 && (
            <div className="space-y-2">
              {topAgents.map((agent) => {
                const cost = parseFloat(agent.totalCostUsd)
                const maxCost = parseFloat(topAgents[0].totalCostUsd)
                const pct = maxCost > 0 ? (cost / maxCost) * 100 : 0
                return (
                  <div key={agent.agentId} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-[#e6edf3] truncate">{agentName(agent.agentId)}</span>
                      <span className="font-mono text-[11px] text-[#58a6ff] flex-shrink-0">${cost.toFixed(4)}</span>
                    </div>
                    <div className="h-1 bg-[#21262d]">
                      <div
                        className="h-full bg-[#1f6feb]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Observability row: Failed / Blocked / Overdue */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Failed Tasks */}
        <div className="border border-[#30363d] bg-[#161b22] p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-medium uppercase tracking-wider text-[#8b949e] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#f85149] flex-shrink-0" />
              Failed Tasks
              {(failed.data?.count ?? 0) > 0 && (
                <span className="ml-2 font-mono text-[#f85149]">{failed.data?.count}</span>
              )}
            </p>
            <Link to="/analytics" className="font-mono text-[11px] text-[#58a6ff] hover:text-[#79c0ff] transition-colors">
              view all →
            </Link>
          </div>
          {failed.isLoading && <div className="h-20 bg-[#21262d] animate-pulse" />}
          {!failed.isLoading && (!failed.data?.tasks || failed.data.tasks.length === 0) && (
            <div className="py-6 text-center font-mono text-[12px] text-[#6e7681]">no failures</div>
          )}
          {failed.data?.tasks && failed.data.tasks.length > 0 && (
            <div className="space-y-1">
              {failed.data.tasks.slice(0, 5).map((t) => (
                <Link
                  key={t.taskId}
                  to="/boards/$boardId"
                  params={{ boardId: t.boardId }}
                  className="flex items-center gap-2 px-2 py-1.5 hover:bg-[#21262d]/60 transition-colors group"
                >
                  <span className="flex-1 text-xs text-[#e6edf3] group-hover:text-[#58a6ff] truncate">{t.title}</span>
                  {t.assignedAgentId && (
                    <span className="font-mono text-[10px] text-[#6e7681] truncate max-w-[80px]">{t.assignedAgentId}</span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Blocked Tasks */}
        <div className="border border-[#30363d] bg-[#161b22] p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-medium uppercase tracking-wider text-[#8b949e] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#d29922] flex-shrink-0" />
              Blocked Tasks
              {blockedTasks.length > 0 && (
                <span className="ml-2 font-mono text-[#d29922]">{blockedTasks.length}</span>
              )}
            </p>
          </div>
          {queue.isLoading && <div className="h-20 bg-[#21262d] animate-pulse" />}
          {!queue.isLoading && blockedTasks.length === 0 && (
            <div className="py-6 text-center font-mono text-[12px] text-[#6e7681]">no blocked tasks</div>
          )}
          {blockedTasks.length > 0 && (
            <div className="space-y-1">
              {blockedTasks.map((task) => (
                <Link
                  key={task.id}
                  to="/boards/$boardId"
                  params={{ boardId: task.boardId }}
                  className="flex items-center gap-2 px-2 py-1.5 hover:bg-[#21262d]/60 transition-colors group"
                >
                  <span className="flex-1 text-xs text-[#e6edf3] group-hover:text-[#58a6ff] truncate">{task.title}</span>
                  {boardsById.has(task.boardId) && (
                    <span className="font-mono text-[10px] text-[#6e7681] bg-[#0d1117] border border-[#21262d] px-1.5 py-0.5 truncate max-w-[80px]">
                      {boardsById.get(task.boardId)}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Overdue Tasks */}
        <div className="border border-[#30363d] bg-[#161b22] p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-medium uppercase tracking-wider text-[#8b949e] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#f85149] flex-shrink-0" />
              Overdue Tasks
              {(overdue.data?.length ?? 0) > 0 && (
                <span className="ml-2 font-mono text-[#f85149]">{overdue.data?.length}</span>
              )}
            </p>
          </div>
          {overdue.isLoading && <div className="h-20 bg-[#21262d] animate-pulse" />}
          {!overdue.isLoading && (!overdue.data || overdue.data.length === 0) && (
            <div className="py-6 text-center font-mono text-[12px] text-[#6e7681]">no overdue tasks</div>
          )}
          {overdue.data && overdue.data.length > 0 && (
            <div className="space-y-1">
              {overdue.data.slice(0, 5).map((task) => (
                <Link
                  key={task.id}
                  to="/boards/$boardId"
                  params={{ boardId: task.boardId }}
                  className="flex items-center gap-2 px-2 py-1.5 hover:bg-[#21262d]/60 transition-colors group"
                >
                  <span className="flex-1 text-xs text-[#e6edf3] group-hover:text-[#58a6ff] truncate">{task.title}</span>
                  {task.dueDate && (
                    <span className="font-mono text-[10px] text-[#f85149] flex-shrink-0">
                      {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
