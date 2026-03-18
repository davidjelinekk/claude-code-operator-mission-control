import { cn } from '@/lib/utils'
import type { Task } from '@/hooks/api/boards'
import type { Agent } from '@/hooks/api/agents'

interface KanbanCardProps {
  task: Task
  agents?: Agent[]
  isDragging?: boolean
  onClick?: () => void
}

const outcomeBadge: Record<NonNullable<Task['outcome']>, { label: string; className: string }> = {
  success:   { label: 'SUCCESS',   className: 'text-[#3fb950] border-[#238636] bg-[#238636]/10' },
  failed:    { label: 'FAILED',    className: 'text-[#f85149] border-[#da3633] bg-[#da3633]/15' },
  partial:   { label: 'PARTIAL',   className: 'text-[#d29922] border-[#9e6a03] bg-[#9e6a03]/10' },
  abandoned: { label: 'ABANDONED', className: 'text-[#6e7681] border-[#30363d]' },
}

const priorityBadge: Record<Task['priority'], { label: string; className: string; borderLeft: string }> = {
  high: { label: 'HIGH', className: 'text-[#f85149] border border-[#6e0000]', borderLeft: 'border-l-2 border-l-[#f85149]' },
  medium: { label: 'MED', className: 'text-[#d29922] border border-[#9e6a03]', borderLeft: 'border-l-2 border-l-[#d29922]' },
  low: { label: 'LOW', className: 'text-[#8b949e] border border-[#30363d]', borderLeft: 'border-l-2 border-l-[#30363d]' },
}

function formatRelativeDate(dateStr: string): { label: string; overdue: boolean } {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  const overdue = diffMs < 0

  if (overdue) {
    const abs = Math.abs(diffDays)
    return { label: abs === 0 ? 'Today' : `${abs}d overdue`, overdue: true }
  }
  if (diffDays === 0) return { label: 'Today', overdue: false }
  if (diffDays === 1) return { label: 'Tomorrow', overdue: false }
  return { label: `in ${diffDays}d`, overdue: false }
}

function formatCompletedAt(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function timeInStatus(task: Task): { label: string; warn: boolean } | null {
  const now = Date.now()
  if (task.status === 'in_progress' && task.inProgressAt) {
    const diff = now - new Date(task.inProgressAt).getTime()
    const h = Math.floor(diff / 3600000)
    const d = Math.floor(h / 24)
    const label = d > 0 ? `${d}d` : `${h}h`
    return { label, warn: h > 4 }
  }
  if (task.status === 'inbox') {
    if (!task.createdAt) return null
    const diff = now - new Date(task.createdAt).getTime()
    const h = Math.floor(diff / 3600000)
    const d = Math.floor(h / 24)
    if (h < 24) return null
    return { label: `waiting ${d}d`, warn: false }
  }
  if (task.status === 'review' && task.updatedAt) {
    const diff = now - new Date(task.updatedAt).getTime()
    const h = Math.floor(diff / 3600000)
    if (h < 2) return null
    return { label: `review ${h}h`, warn: true }
  }
  return null
}

export function KanbanCard({ task, agents, isDragging, onClick }: KanbanCardProps) {
  const priority = priorityBadge[task.priority as Task['priority']] ?? priorityBadge.medium
  const assignedAgent = task.assignedAgentId ? agents?.find((a) => a.id === task.assignedAgentId) : undefined
  const dueDateInfo = task.dueDate ? formatRelativeDate(task.dueDate) : null
  const outcome = task.outcome ? outcomeBadge[task.outcome] : null
  const statusTime = timeInStatus(task)

  return (
    <div
      onClick={onClick}
      className={cn(
        'border border-[#30363d] p-3 cursor-pointer select-none transition-colors',
        priority.borderLeft,
        'hover:border-[#58a6ff]',
        isDragging && 'opacity-50',
      )}
      style={{
        background: task.status === 'in_progress'
          ? 'linear-gradient(135deg, #1a1600 0%, #161b22 40%)'
          : task.status === 'done'
          ? 'linear-gradient(135deg, #0d1a0d 0%, #161b22 40%)'
          : '#161b22',
      }}
    >
      <p className="text-sm text-[#e6edf3] font-medium line-clamp-2 leading-snug mb-2">{task.title}</p>

      <div className="flex flex-wrap gap-1.5 items-center">
        <span className={cn('text-[10px] font-mono font-semibold px-1.5 py-0.5', priority.className)}>
          {priority.label}
        </span>

        {task.depCount != null && task.depCount > 0 && (
          <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 text-[#8b949e] border border-[#30363d]">
            BLOCKED
          </span>
        )}

        {task.pendingApproval && (
          <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 text-[#d29922] border border-[#9e6a03]">
            APPROVAL
          </span>
        )}
      </div>

      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {task.tags.slice(0, 3).map((tag) => (
            <span
              key={tag.id}
              className="text-[9px] font-mono px-1 py-0.5 border"
              style={{ color: `#${tag.color}`, borderColor: `#${tag.color}33` }}
            >
              {tag.name}
            </span>
          ))}
          {task.tags.length > 3 && (
            <span className="text-[9px] font-mono text-[#6e7681]">+{task.tags.length - 3}</span>
          )}
        </div>
      )}

      {(assignedAgent || dueDateInfo) && (
        <div className="flex items-center justify-between mt-2 gap-2">
          {assignedAgent ? (
            <span className="inline-flex items-center gap-1 text-xs text-[#8b949e] bg-[#0d1117] border border-[#30363d] px-1.5 py-0.5 truncate max-w-[120px] font-mono">
              <span>{'🤖'}</span>
              <span className="truncate">{assignedAgent.name}</span>
            </span>
          ) : (
            <span />
          )}

          {dueDateInfo && (
            <span className={cn('text-[11px] font-mono font-medium flex-shrink-0', dueDateInfo.overdue ? 'text-[#f85149]' : 'text-[#6e7681]')}>
              {dueDateInfo.label}
            </span>
          )}
        </div>
      )}

      {(outcome || (task.status === 'done' && task.completedAt)) && (
        <div className="flex items-center justify-between mt-2 gap-2">
          {outcome ? (
            <span className={cn('text-[10px] font-mono font-semibold px-1.5 py-0.5 border', outcome.className)}>
              {outcome.label}
            </span>
          ) : (
            <span />
          )}
          {task.status === 'done' && task.completedAt && (
            <span className="text-[10px] font-mono text-[#6e7681] flex-shrink-0">
              {formatCompletedAt(task.completedAt)}
            </span>
          )}
        </div>
      )}

      {statusTime && (
        <div className="mt-1.5">
          <span className={cn(
            'text-[10px] font-mono',
            statusTime.warn ? 'text-[#d29922]' : 'text-[#6e7681]',
          )}>
            {statusTime.label}
          </span>
        </div>
      )}
    </div>
  )
}
