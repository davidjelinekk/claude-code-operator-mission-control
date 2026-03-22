import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { useTasksInProgress, useInboxQueue, useCancelTask } from '@/hooks/api/tasks'
import type { Task } from '@/hooks/api/boards'
import { useBoards } from '@/hooks/api/boards'
import { useAgentNameMap } from '@/hooks/api/agents'
import { relativeTime } from '@/lib/utils'

export const Route = createFileRoute('/workload')({
  component: WorkloadPage,
})

const PRIORITY_COLOR: Record<Task['priority'], string> = {
  high: 'text-[#f85149]',
  medium: 'text-[#d29922]',
  low: 'text-[#8b949e]',
}

function PriorityBadge({ priority }: { priority: Task['priority'] }) {
  return (
    <span className={`font-mono text-[10px] uppercase tracking-widest ${PRIORITY_COLOR[priority]}`}>
      {priority}
    </span>
  )
}

type TaskWithInProgressAt = Task & { inProgressAt?: string | null }

function WorkloadPage() {
  const inProgress = useTasksInProgress()
  const queue = useInboxQueue(undefined, 25)
  const boards = useBoards()
  const cancelTask = useCancelTask()
  const agentName = useAgentNameMap()

  const boardsById = useMemo(() => {
    const map = new Map<string, string>()
    boards.data?.forEach((b) => map.set(b.id, b.name))
    return map
  }, [boards.data])

  const grouped = useMemo(() => {
    const tasks = (inProgress.data ?? []) as TaskWithInProgressAt[]
    const map = new Map<string, TaskWithInProgressAt[]>()
    for (const task of tasks) {
      const key = task.assignedAgentId ?? '__unassigned__'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(task)
    }
    return map
  }, [inProgress.data])

  const inProgressCount = inProgress.data?.length ?? 0
  const queueCount = queue.data?.length ?? 0

  const isLoading = inProgress.isLoading || queue.isLoading

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between pb-4 border-b border-[#21262d]">
        <h1 className="font-mono text-[13px] font-semibold text-[#e6edf3] tracking-wide uppercase flex items-center gap-2">
          <span className="text-[#58a6ff]">~/</span>workload
        </h1>
        {!isLoading && (
          <span className="font-mono text-xs text-[#8b949e]">
            {inProgressCount} in progress · {queueCount} queued
          </span>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-[#58a6ff]" />
        </div>
      )}

      {!isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="flex flex-col gap-4">
            <span className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">
              in progress by agent
            </span>

            {grouped.size === 0 ? (
              <div className="border border-[#30363d] bg-[#161b22] p-4 flex items-center justify-center py-12">
                <span className="font-mono text-xs text-[#6e7681]">No in-progress tasks</span>
              </div>
            ) : (
              Array.from(grouped.entries()).map(([agentId, tasks]) => (
                <div key={agentId} className="border border-[#30363d] bg-[#161b22] p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-[#e6edf3] truncate">
                      {agentId === '__unassigned__' ? 'Unassigned' : agentName(agentId)}
                    </span>
                    <span className={`font-mono text-[10px] px-1.5 py-0.5 flex-shrink-0 border ${
                      tasks.length > 6
                        ? 'text-[#f85149] bg-[#f85149]/10 border-[#f85149]/30'
                        : tasks.length >= 3
                        ? 'text-[#d29922] bg-[#d29922]/10 border-[#d29922]/30'
                        : 'text-[#3fb950] bg-[#3fb950]/10 border-[#3fb950]/30'
                    }`}>
                      {tasks.length}
                    </span>
                  </div>
                  <ul className="flex flex-col gap-2 border-t border-[#21262d] pt-3">
                    {tasks.map((task) => (
                      <li key={task.id} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <PriorityBadge priority={task.priority} />
                          <span className="font-mono text-xs text-[#c9d1d9] truncate" title={task.title}>{task.title}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`font-mono text-[10px] ${
                            (() => {
                              const h = task.inProgressAt ? Math.floor((Date.now() - new Date(task.inProgressAt).getTime()) / 3600000) : 0
                              return h > 4 ? 'text-[#d29922]' : 'text-[#6e7681]'
                            })()
                          }`}>
                            {relativeTime(task.inProgressAt)}
                          </span>
                          <button
                            onClick={() => cancelTask.mutate({ id: task.id })}
                            disabled={cancelTask.isPending}
                            className="font-mono text-[9px] text-[#6e7681] border border-[#30363d] px-1.5 py-0.5 hover:text-[#f85149] hover:border-[#da3633]/50 transition-colors disabled:opacity-50"
                          >
                            cancel
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>

          <div className="flex flex-col gap-4">
            <span className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">
              inbox queue
            </span>

            {(queue.data ?? []).length === 0 ? (
              <div className="border border-[#30363d] bg-[#161b22] p-4 flex items-center justify-center py-12">
                <span className="font-mono text-xs text-[#6e7681]">Queue is empty</span>
              </div>
            ) : (
              <div className="border border-[#30363d] bg-[#161b22] p-4 flex flex-col gap-0">
                {(queue.data ?? []).map((task, i) => (
                  <div
                    key={task.id}
                    className={`flex items-center justify-between gap-2 py-2 ${
                      i < (queue.data ?? []).length - 1 ? 'border-b border-[#21262d]' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <PriorityBadge priority={task.priority} />
                      <span className="font-mono text-xs text-[#c9d1d9] truncate" title={task.title}>{task.title}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {task.boardId && (
                        <span className="font-mono text-[10px] text-[#6e7681] truncate max-w-[100px]">
                          {boardsById.get(task.boardId) ?? task.boardId.slice(0, 8)}
                        </span>
                      )}
                      <span className="font-mono text-[10px] text-[#6e7681]">
                        {relativeTime(task.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
