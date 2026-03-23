import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertTriangle, BrainCircuit, CheckCircle2, Clock, Plus, Settings, X, ChevronRight, MessageSquare, ShieldCheck } from 'lucide-react'
import { useBoard } from '@/hooks/useBoard'
import { useCreateTask, useUpdateTask, useDeleteTask, useAddDep, useRemoveDep, useTaskNotes, useCreateTaskNote, useStartTaskPlanning, useTaskPlanning, useSubmitPlanningAnswer, useCancelTask } from '@/hooks/api/tasks'
import { useAgents } from '@/hooks/api/agents'
import { useQuery } from '@tanstack/react-query'
import { api, queryClient } from '@/lib/api'
import { KanbanCard } from '@/components/organisms/KanbanCard'
import { cn, relativeTime } from '@/lib/utils'
import { useUpdateBoard } from '@/hooks/api/boards'
import type { Task, BoardSnapshot } from '@/hooks/api/boards'
import type { TaskDep, TaskDeps } from '@/hooks/api/tasks'
import { useActivity, useCreateActivity } from '@/hooks/api/activity'
import { useTags, useTaskTags, useAddTagToTask, useRemoveTagFromTask } from '@/hooks/api/tags'
import { useApprovals, useUpdateApproval, type Approval as ApprovalFull } from '@/hooks/api/approvals'

export const Route = createFileRoute('/boards/$boardId/')({
  component: BoardDetailPage,
})

type Status = Task['status']

const COLUMN_ACCENT: Record<Status, { text: string; border: string; glow: string; countBg: string }> = {
  inbox:       { text: '#58a6ff', border: '#1f6feb', glow: '#58a6ff15', countBg: '#1f6feb20' },
  in_progress: { text: '#d29922', border: '#9e6a03', glow: '#d2992215', countBg: '#9e6a0320' },
  review:      { text: '#a371f7', border: '#6e40c9', glow: '#a371f715', countBg: '#6e40c920' },
  done:        { text: '#3fb950', border: '#238636', glow: '#3fb95015', countBg: '#23863620' },
}

const COLUMNS: { id: Status; label: string }[] = [
  { id: 'inbox', label: 'INBOX' },
  { id: 'in_progress', label: 'IN PROGRESS' },
  { id: 'review', label: 'REVIEW' },
  { id: 'done', label: 'DONE' },
]

// ─── Sortable card wrapper ────────────────────────────────────────────────────

function SortableCard({
  task,
  agents,
  onOpen,
}: {
  task: Task
  agents: ReturnType<typeof useAgents>['data']
  onOpen: (task: Task) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <KanbanCard task={task} agents={agents} isDragging={isDragging} onClick={() => onOpen(task)} />
    </div>
  )
}

// ─── Add task form ────────────────────────────────────────────────────────────

function AddTaskForm({ boardId, status, onDone }: { boardId: string; status: Status; onDone: () => void }) {
  const createTask = useCreateTask(boardId)
  const [title, setTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && title.trim()) {
      await createTask.mutateAsync({ title: title.trim(), status, priority: 'medium' })
      setTitle('')
      onDone()
    }
    if (e.key === 'Escape') onDone()
  }

  return (
    <div className="mt-2">
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={onDone}
        placeholder="Task title… (Enter to save)"
        className="w-full bg-canvas border border-accent px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none"
      />
    </div>
  )
}

// ─── Column ───────────────────────────────────────────────────────────────────

type ReviewFilter = 'all' | 'approval' | 'blocked'

function KanbanColumn({
  col,
  tasks,
  boardId,
  agents,
  isOver,
  onOpenTask,
}: {
  col: { id: Status; label: string }
  tasks: Task[]
  boardId: string
  agents: ReturnType<typeof useAgents>['data']
  isOver: boolean
  onOpenTask: (task: Task) => void
}) {
  const [adding, setAdding] = useState(false)
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all')

  const visibleTasks = col.id === 'review'
    ? tasks.filter((t) => {
        if (reviewFilter === 'approval') return t.pendingApproval === true
        if (reviewFilter === 'blocked') return (t.depCount ?? 0) > 0
        return true
      })
    : tasks

  return (
    <div
      className="flex flex-col bg-canvas border transition-colors min-w-0"
      style={{ borderColor: isOver ? COLUMN_ACCENT[col.id].border : '#30363d' }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-border"
        style={{ background: `linear-gradient(to right, ${COLUMN_ACCENT[col.id].glow}, transparent)` }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: COLUMN_ACCENT[col.id].text, boxShadow: `0 0 6px ${COLUMN_ACCENT[col.id].text}` }}
          />
          <span
            className="text-xs font-mono font-semibold uppercase tracking-wider"
            style={{ color: COLUMN_ACCENT[col.id].text }}
          >
            {col.label}
          </span>
        </div>
        <span
          className="text-xs font-mono px-1.5 py-0.5 border"
          style={{
            color: COLUMN_ACCENT[col.id].text,
            borderColor: COLUMN_ACCENT[col.id].border,
            background: COLUMN_ACCENT[col.id].countBg,
          }}
        >
          {tasks.length}
        </span>
      </div>

      {col.id === 'review' && (
        <div className="flex border-b border-border-subtle px-2 pt-1.5 bg-surface">
          {(['all', 'approval', 'blocked'] as ReviewFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setReviewFilter(f)}
              className={cn(
                'px-2 pb-1.5 text-[10px] font-mono uppercase tracking-wider transition-colors',
                reviewFilter === f
                  ? 'text-accent border-b border-accent'
                  : 'text-text-tertiary hover:text-text-secondary',
              )}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[120px]">
        <SortableContext items={visibleTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {visibleTasks.map((task) => (
            <SortableCard key={task.id} task={task} agents={agents} onOpen={onOpenTask} />
          ))}
        </SortableContext>
        {adding && (
          <AddTaskForm boardId={boardId} status={col.id} onDone={() => setAdding(false)} />
        )}
      </div>

      <div className="px-2 pb-2">
        <button
          onClick={() => setAdding(true)}
          className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-text-tertiary hover:text-text-secondary hover:bg-surface transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add task
        </button>
      </div>
    </div>
  )
}

// ─── Task detail sheet tabs ───────────────────────────────────────────────────

// ─── Planning Q&A panel ───────────────────────────────────────────────────────

function PlanningPanel({ task }: { task: Task }) {
  const { data: session, isLoading } = useTaskPlanning(task.id)
  const submitAnswer = useSubmitPlanningAnswer(task.id)
  const [answer, setAnswer] = useState('')

  if (isLoading) return <p className="text-xs font-mono text-text-tertiary">loading planning…</p>
  if (!session) return null

  const messages = session.messages ?? []
  const lastAgentMsg = [...messages].reverse().find((m) => m.role === 'agent')

  async function handleAnswer(e: React.FormEvent) {
    e.preventDefault()
    if (!answer.trim() || submitAnswer.isPending) return
    await submitAnswer.mutateAsync(answer.trim())
    setAnswer('')
  }

  if (session.status === 'completed') {
    const spec = session.planningSpec as { title?: string; summary?: string; deliverables?: string[] } | null
    return (
      <div className="space-y-3 border border-success/30 bg-success/5 px-3 py-3 mt-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
          <span className="text-[11px] font-mono text-success font-semibold uppercase tracking-wider">Planning complete</span>
        </div>
        {spec && (
          <div className="space-y-1.5">
            {spec.title && (
              <p className="text-xs font-mono text-text-primary font-semibold">{spec.title}</p>
            )}
            {spec.summary && (
              <p className="text-xs text-text-secondary">{spec.summary}</p>
            )}
            {(spec.deliverables ?? []).length > 0 && (
              <ul className="space-y-0.5 pt-1">
                {(spec.deliverables ?? []).map((d, i) => (
                  <li key={i} className="text-[11px] font-mono text-text-secondary flex gap-1.5">
                    <span className="text-success">›</span>{d}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {(session.suggestedAgents ?? []).length > 0 && (
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary mb-1">Suggested agents</p>
            <div className="flex flex-wrap gap-1.5">
              {(session.suggestedAgents ?? []).map((a) => (
                <span key={a.name} className="text-[11px] font-mono text-text-secondary border border-border px-2 py-0.5">
                  {a.avatar_emoji ? `${a.avatar_emoji} ` : ''}{a.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3 border border-accent/50 bg-accent/5 px-3 py-3 mt-3">
      <div className="flex items-center gap-2">
        <BrainCircuit className="h-3.5 w-3.5 text-accent" />
        <span className="text-[11px] font-mono text-accent font-semibold uppercase tracking-wider">Planning in progress</span>
      </div>
      {lastAgentMsg && (
        <p className="text-sm text-text-primary leading-relaxed">{lastAgentMsg.content}</p>
      )}
      {messages.length > 1 && (
        <div className="space-y-1 max-h-32 overflow-y-auto border-t border-accent/30 pt-2">
          {messages.slice(0, -1).map((m, i) => (
            <div key={i} className={cn('text-[11px] font-mono px-1', m.role === 'agent' ? 'text-accent' : 'text-text-secondary')}>
              <span className="text-text-tertiary">{m.role === 'agent' ? 'agent' : 'you'}:{' '}</span>{m.content}
            </div>
          ))}
        </div>
      )}
      <form onSubmit={handleAnswer} className="flex gap-2">
        <input
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Your answer…"
          className="flex-1 bg-canvas border border-border px-3 py-2 text-sm font-mono text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={!answer.trim() || submitAnswer.isPending}
          className="px-3 py-2 text-xs font-mono text-white bg-accent border border-accent hover:bg-accent disabled:opacity-50 transition-colors"
        >
          {submitAnswer.isPending ? '…' : 'Answer'}
        </button>
      </form>
    </div>
  )
}

function DetailTab({ task, agents, onClose }: { task: Task; agents: ReturnType<typeof useAgents>['data']; onClose: () => void }) {
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const cancelTask = useCancelTask()
  const startPlanning = useStartTaskPlanning(task.id)
  const { data: planningSession } = useTaskPlanning(task.id)
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [priority, setPriority] = useState(task.priority)
  const [assignedAgentId, setAssignedAgentId] = useState(task.assignedAgentId ?? '')
  const [dueDate, setDueDate] = useState(task.dueDate ? task.dueDate.slice(0, 10) : '')
  const [outcome, setOutcome] = useState<Task['outcome']>(task.outcome ?? null)
  const [planningMsg, setPlanningMsg] = useState<string | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  const hasActiveOrCompletedSession = planningSession?.status === 'active' || planningSession?.status === 'completed'

  async function handleStartPlanning() {
    setPlanningMsg(null)
    try {
      await startPlanning.mutateAsync()
    } catch (err) {
      setPlanningMsg(err instanceof Error ? err.message : 'Failed to start planning')
    }
  }

  async function handleSave() {
    await updateTask.mutateAsync({
      id: task.id,
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      assignedAgentId: assignedAgentId || undefined,
      dueDate: dueDate || undefined,
      outcome: outcome ?? undefined,
    })
  }

  async function handleDelete() {
    if (!confirm('Delete this task?')) return
    await deleteTask.mutateAsync({ id: task.id, boardId: task.boardId })
    onClose()
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-1">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-canvas border border-border px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
        />
      </div>
      <div>
        <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-1">Description</label>
        <textarea
          ref={useCallback((el: HTMLTextAreaElement | null) => {
            if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }
          }, [description])}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value)
            const el = e.target; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'
          }}
          rows={2}
          className="w-full bg-canvas border border-border px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent resize-none overflow-hidden"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-1">Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Task['priority'])}
            className="w-full bg-canvas border border-border px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-1">Due Date</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full bg-canvas border border-border px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
          />
        </div>
      </div>
      {agents && (
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-1">Assignee</label>
          <select
            value={assignedAgentId}
            onChange={(e) => setAssignedAgentId(e.target.value)}
            className="w-full bg-canvas border border-border px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
          >
            <option value="">Unassigned</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-1">Outcome</label>
          <select
            value={outcome ?? ''}
            onChange={(e) => setOutcome((e.target.value as Task['outcome']) || null)}
            className={cn(
              'w-full bg-canvas border border-border px-3 py-2 text-sm focus:outline-none focus:border-accent',
              outcome === 'success' && 'text-success',
              outcome === 'failed' && 'text-error',
              outcome === 'partial' && 'text-warning',
              outcome === 'abandoned' && 'text-text-tertiary',
              !outcome && 'text-text-primary',
            )}
          >
            <option value="">None</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="partial">Partial</option>
            <option value="abandoned">Abandoned</option>
          </select>
        </div>
        {task.completedAt && (
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-1">Completed</label>
            <p className="px-3 py-2 text-sm font-mono text-text-secondary bg-canvas border border-border">
              {new Date(task.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        )}
      </div>
      {(task.status === 'inbox' || task.status === 'in_progress') && (
        <div className="pt-1">
          {!hasActiveOrCompletedSession && (
            <button
              onClick={handleStartPlanning}
              disabled={startPlanning.isPending}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-mono text-accent border border-accent hover:bg-accent/30 disabled:opacity-50 transition-colors"
            >
              <BrainCircuit className="h-3.5 w-3.5" />
              {startPlanning.isPending ? 'Starting…' : 'Start Planning'}
            </button>
          )}
          {planningMsg && (
            <p className="mt-1.5 text-[11px] font-mono text-center text-error">
              {planningMsg}
            </p>
          )}
          <PlanningPanel task={task} />
        </div>
      )}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={handleDelete}
          className="text-xs text-error hover:text-error transition-colors"
        >
          Delete task
        </button>
        <button
          onClick={handleSave}
          disabled={updateTask.isPending}
          className="px-3 py-1.5 text-sm font-medium bg-accent border border-accent text-white hover:bg-accent disabled:opacity-50 transition-colors"
        >
          {updateTask.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
      {task.status !== 'done' && (
        <div className="pt-3 border-t border-border-subtle">
          {showCancelConfirm ? (
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-error">cancel this task?</span>
              <button
                onClick={() => {
                  cancelTask.mutate({ id: task.id })
                  setShowCancelConfirm(false)
                }}
                className="px-2.5 py-1 font-mono text-[11px] text-error border border-error/50 hover:bg-error/10 transition-colors"
              >
                confirm
              </button>
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="px-2.5 py-1 font-mono text-[11px] text-text-tertiary border border-border hover:text-text-secondary transition-colors"
              >
                no
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="px-2.5 py-1 font-mono text-[11px] text-error border border-error/50 hover:bg-error/10 transition-colors"
            >
              Cancel task
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function DepsTab({ task, snapshot }: { task: Task; snapshot: BoardSnapshot }) {
  const addDep = useAddDep()
  const removeDep = useRemoveDep()
  const [search, setSearch] = useState('')

  const { data: deps, refetch: refetchDeps } = useQuery<TaskDeps>({
    queryKey: ['task', task.id, 'deps'],
    queryFn: () => api.get(`api/tasks/${task.id}/deps`).json<TaskDeps>(),
  })

  const matchingTasks = snapshot.tasks.filter(
    (t) =>
      t.id !== task.id &&
      !deps?.blockedBy.some((d) => d.dependsOnTaskId === t.id) &&
      t.title.toLowerCase().includes(search.toLowerCase()),
  )

  async function handleAddDep(dependsOnTaskId: string) {
    await addDep.mutateAsync({ taskId: task.id, dependsOnTaskId })
    refetchDeps()
    setSearch('')
    queryClient.invalidateQueries({ queryKey: ['board', task.boardId, 'snapshot'] })
  }

  async function handleRemoveDep(depId: string) {
    await removeDep.mutateAsync({ taskId: task.id, depId })
    refetchDeps()
    queryClient.invalidateQueries({ queryKey: ['board', task.boardId, 'snapshot'] })
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Blocked by</p>
        {!deps || deps.blockedBy.length === 0 ? (
          <p className="text-xs text-text-tertiary italic">No dependencies</p>
        ) : (
          <div className="space-y-1.5">
            {deps.blockedBy.map((dep) => {
              const depTask = snapshot.tasks.find((t) => t.id === dep.dependsOnTaskId)
              return (
                <div key={dep.id} className="flex items-center justify-between bg-canvas border border-border px-3 py-2">
                  <span className="text-sm text-text-primary truncate">{depTask?.title ?? dep.dependsOnTaskId}</span>
                  <button
                    onClick={() => handleRemoveDep(dep.id)}
                    className="text-text-tertiary hover:text-error ml-2 flex-shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-text-secondary mb-2">Add dependency</p>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks…"
          className="w-full bg-canvas border border-border px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent mb-2"
        />
        {search && matchingTasks.length > 0 && (
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {matchingTasks.slice(0, 8).map((t) => (
              <button
                key={t.id}
                onClick={() => handleAddDep(t.id)}
                className="w-full text-left flex items-center gap-2 bg-canvas border border-border hover:border-accent px-3 py-2 text-sm text-text-primary transition-colors"
              >
                <ChevronRight className="h-3.5 w-3.5 text-text-tertiary flex-shrink-0" />
                <span className="truncate">{t.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Activity/comments tab ────────────────────────────────────────────────────

function ActivityTab({ task }: { task: Task }) {
  const { data: events, isLoading } = useActivity({ taskId: task.id })
  const createActivity = useCreateActivity()
  const [comment, setComment] = useState('')

  async function submitComment(e: React.FormEvent) {
    e.preventDefault()
    if (!comment.trim()) return
    await createActivity.mutateAsync({
      taskId: task.id,
      boardId: task.boardId,
      eventType: 'task.comment',
      message: comment.trim(),
    })
    setComment('')
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {isLoading && <p className="text-xs text-text-tertiary">loading…</p>}
      {!isLoading && (events ?? []).length === 0 && (
        <p className="text-xs font-mono text-text-tertiary">No comments yet</p>
      )}
      <div className="space-y-3 flex-1">
        {(events ?? []).map((ev) => (
          <div key={ev.id} className="flex gap-2">
            <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-accent mt-1.5" />
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                {ev.agentId && <span className="text-[10px] font-mono text-text-tertiary">{ev.agentId}</span>}
                <span className="text-[10px] font-mono text-text-tertiary">{relativeTime(ev.createdAt)}</span>
              </div>
              <p className="text-sm text-text-primary">{ev.message}</p>
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={submitComment} className="flex gap-2 pt-2 border-t border-border">
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add comment…"
          className="flex-1 bg-canvas border border-border px-3 py-2 text-sm font-mono text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={!comment.trim() || createActivity.isPending}
          className="px-3 py-2 text-xs font-mono text-white bg-accent border border-accent hover:bg-accent disabled:opacity-50 transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  )
}

// ─── Notes tab ───────────────────────────────────────────────────────────────

function NotesTab({ task }: { task: Task }) {
  const { data: notes, isLoading } = useTaskNotes(task.id)
  const createNote = useCreateTaskNote(task.id)
  const [message, setMessage] = useState('')

  async function submitNote(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    await createNote.mutateAsync({ message: message.trim() })
    setMessage('')
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {isLoading && <p className="text-xs text-text-tertiary">loading…</p>}
      {!isLoading && (notes ?? []).length === 0 && (
        <p className="text-xs font-mono text-text-tertiary">No notes yet</p>
      )}
      <div className="space-y-3 flex-1">
        {(notes ?? []).map((note) => (
          <div key={note.id} className="flex gap-2">
            <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-warning mt-1.5" />
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                {note.agentId && <span className="text-[10px] font-mono text-text-tertiary">{note.agentId}</span>}
                <span className="text-[10px] font-mono text-text-tertiary">{relativeTime(note.createdAt)}</span>
              </div>
              <p className="text-sm text-text-primary">{note.message}</p>
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={submitNote} className="flex gap-2 pt-2 border-t border-border">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Add note…"
          rows={2}
          className="flex-1 bg-canvas border border-border px-3 py-2 text-sm font-mono text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent resize-none"
        />
        <button
          type="submit"
          disabled={!message.trim() || createNote.isPending}
          className="px-3 py-2 text-xs font-mono text-white bg-accent border border-accent hover:bg-accent disabled:opacity-50 transition-colors self-end"
        >
          Save
        </button>
      </form>
    </div>
  )
}

// ─── Tags tab ────────────────────────────────────────────────────────────────

function TagsTab({ task }: { task: Task }) {
  const { data: taskTags, isLoading: loadingTaskTags } = useTaskTags(task.id)
  const { data: allTags } = useTags()
  const addTag = useAddTagToTask()
  const removeTag = useRemoveTagFromTask()

  const taskTagIds = new Set((taskTags ?? []).map((t) => t.id))
  const availableTags = (allTags ?? []).filter((t) => !taskTagIds.has(t.id))

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-mono uppercase tracking-wider text-text-secondary mb-2">Applied tags</p>
        {loadingTaskTags && <p className="text-xs text-text-tertiary">loading…</p>}
        {!loadingTaskTags && (taskTags ?? []).length === 0 && (
          <p className="text-xs font-mono text-text-tertiary">No tags applied</p>
        )}
        <div className="flex flex-wrap gap-2">
          {(taskTags ?? []).map((tag) => {
            const hex = tag.color.startsWith('#') ? tag.color : `#${tag.color}`
            return (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1.5 text-xs font-mono px-2 py-1 border"
                style={{ color: hex, borderColor: `${hex}55` }}
              >
                {tag.name}
                <button
                  onClick={() => removeTag.mutate({ taskId: task.id, tagId: tag.id })}
                  className="opacity-60 hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )
          })}
        </div>
      </div>

      {availableTags.length > 0 && (
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-text-secondary mb-2">Add tag</p>
          <div className="flex flex-wrap gap-1.5">
            {availableTags.map((tag) => {
              const hex = tag.color.startsWith('#') ? tag.color : `#${tag.color}`
              return (
                <button
                  key={tag.id}
                  onClick={() => addTag.mutate({ taskId: task.id, tagId: tag.id })}
                  className="text-xs font-mono px-2 py-1 border transition-colors hover:opacity-80"
                  style={{ color: hex, borderColor: `${hex}55` }}
                >
                  + {tag.name}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Task detail sheet ────────────────────────────────────────────────────────

function TaskDetailSheet({
  task,
  agents,
  snapshot,
  onClose,
}: {
  task: Task
  agents: ReturnType<typeof useAgents>['data']
  snapshot: BoardSnapshot
  onClose: () => void
}) {
  const [tab, setTab] = useState<'detail' | 'deps' | 'activity' | 'tags' | 'notes'>('detail')

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-surface border-l border-border w-[420px] h-full flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-text-primary truncate pr-4">{task.title}</h3>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary transition-colors flex-shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex border-b border-border">
          {(['detail', 'deps', 'activity', 'tags', 'notes'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 px-2 py-2.5 text-[10px] font-mono font-medium uppercase tracking-wider transition-colors',
                tab === t
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-text-tertiary hover:text-text-secondary',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'detail' && <DetailTab task={task} agents={agents} onClose={onClose} />}
          {tab === 'deps' && <DepsTab task={task} snapshot={snapshot} />}
          {tab === 'activity' && <ActivityTab task={task} />}
          {tab === 'tags' && <TagsTab task={task} />}
          {tab === 'notes' && <NotesTab task={task} />}
        </div>
      </div>
    </div>
  )
}

// ─── Board chat panel ─────────────────────────────────────────────────────────

function BoardChatPanel({
  boardId,
  boardName,
  gatewayAgentId,
  onClose,
}: {
  boardId: string
  boardName: string
  gatewayAgentId: string | null
  onClose: () => void
}) {
  const { data: events, isLoading } = useActivity({ boardId, eventType: 'board.chat' })
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim() || sending) return
    setSending(true)
    try {
      await api.post(`api/boards/${boardId}/chat`, { json: { message: message.trim() } }).json<unknown>()
      setMessage('')
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-surface border-l border-border w-[380px] h-full flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="font-mono text-[12px] font-semibold text-text-primary uppercase tracking-wide">
              <span className="text-accent">~/boards/</span>{boardName}
            </h3>
            <p className="font-mono text-[10px] text-text-tertiary mt-0.5">board chat</p>
          </div>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary transition-colors flex-shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!gatewayAgentId ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <p className="font-mono text-xs text-text-tertiary text-center">
              No gateway agent configured for this board
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {isLoading && <p className="text-xs font-mono text-text-tertiary">loading…</p>}
              {!isLoading && (events ?? []).length === 0 && (
                <p className="text-xs font-mono text-text-tertiary">No messages yet</p>
              )}
              {(events ?? []).map((ev) => (
                <div key={ev.id} className="flex gap-2">
                  <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-success mt-1.5" />
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      {ev.agentId && <span className="text-[10px] font-mono text-text-tertiary">{ev.agentId}</span>}
                      <span className="text-[10px] font-mono text-text-tertiary">{relativeTime(ev.createdAt)}</span>
                    </div>
                    <p className="text-sm text-text-primary">{ev.message}</p>
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={handleSend} className="flex gap-2 p-4 border-t border-border">
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Message board…"
                className="flex-1 bg-canvas border border-border px-3 py-2 text-sm font-mono text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent"
              />
              <button
                type="submit"
                disabled={!message.trim() || sending}
                className="px-3 py-2 text-xs font-mono text-white bg-accent border border-accent hover:bg-accent disabled:opacity-50 transition-colors"
              >
                Send
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Rubric score editor ──────────────────────────────────────────────────────

function RubricScoreEditor({
  approval,
  onSave,
}: {
  approval: ApprovalFull
  onSave: (scores: Record<string, unknown>) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [scores, setScores] = useState<Record<string, string>>(() => {
    const s = approval.rubricScores ?? {}
    return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, String(v)]))
  })
  const [newKey, setNewKey] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const parsed: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(scores)) {
        const num = parseFloat(v)
        parsed[k] = isNaN(num) ? v : num
      }
      await onSave(parsed)
    } finally {
      setSaving(false)
    }
  }

  function addKey() {
    const k = newKey.trim()
    if (!k || k in scores) return
    setScores((prev) => ({ ...prev, [k]: '' }))
    setNewKey('')
  }

  return (
    <div className="border border-border bg-canvas">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-mono text-text-tertiary hover:text-text-secondary transition-colors"
      >
        <span className="uppercase tracking-wider">rubric scores</span>
        <ChevronRight className={cn('h-3 w-3 transition-transform', expanded && 'rotate-90')} />
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-border-subtle pt-2">
          {Object.keys(scores).length === 0 && (
            <p className="text-[10px] font-mono text-text-tertiary">no scores defined</p>
          )}
          {Object.entries(scores).map(([key, val]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-text-secondary w-24 truncate flex-shrink-0">{key}</span>
              <input
                value={val}
                onChange={(e) => setScores((prev) => ({ ...prev, [key]: e.target.value }))}
                className="flex-1 bg-surface border border-border px-2 py-1 font-mono text-[11px] text-text-primary focus:outline-none focus:border-accent transition-colors"
                placeholder="value"
              />
              <button
                onClick={() =>
                  setScores((prev) => {
                    const n = { ...prev }
                    delete n[key]
                    return n
                  })
                }
                className="text-text-tertiary hover:text-error transition-colors flex-shrink-0"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <div className="flex gap-1.5 pt-1">
            <input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addKey()
              }}
              placeholder="new key…"
              className="flex-1 bg-surface border border-border px-2 py-1 font-mono text-[11px] text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent transition-colors"
            />
            <button
              onClick={addKey}
              className="px-2 py-1 font-mono text-[11px] text-accent border border-border hover:border-accent transition-colors"
            >
              +
            </button>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-1.5 font-mono text-[11px] text-canvas bg-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {saving ? 'saving…' : 'save scores'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Approvals panel ──────────────────────────────────────────────────────────

function ApprovalsPanel({ boardId, tasks, onClose }: { boardId: string; tasks: Task[]; onClose: () => void }) {
  const { data: approvals = [], isLoading } = useApprovals(boardId)
  const updateApproval = useUpdateApproval(boardId)
  const [tab, setTab] = useState<'pending' | 'resolved'>('pending')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const pending = approvals.filter((a) => a.status === 'pending')
  const resolved = approvals.filter((a) => a.status !== 'pending')
  const shown = tab === 'pending' ? pending : resolved

  async function decide(id: string, status: 'approved' | 'rejected') {
    setUpdatingId(id)
    try {
      await updateApproval.mutateAsync({ id, status })
    } finally {
      setUpdatingId(null)
    }
  }

  async function saveScores(approval: ApprovalFull, rubricScores: Record<string, unknown>) {
    await updateApproval.mutateAsync({ id: approval.id, rubricScores })
  }

  const confidenceClass = (conf?: string | null) => {
    const n = parseFloat(conf ?? '0')
    if (n >= 0.8) return 'text-success border-success/30 bg-success/10'
    if (n >= 0.5) return 'text-warning border-warning/30 bg-warning/10'
    return 'text-error border-error/30 bg-error/10'
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-surface border-l border-border w-[420px] h-full flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="font-mono text-[12px] font-semibold text-text-primary uppercase tracking-wide flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-warning" />
              Approvals
            </h3>
            <p className="font-mono text-[10px] text-text-tertiary mt-0.5">
              {pending.length} pending · {resolved.length} resolved
            </p>
          </div>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {(['pending', 'resolved'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 px-2 py-2.5 text-[10px] font-mono font-medium uppercase tracking-wider transition-colors',
                tab === t ? 'text-accent border-b-2 border-accent' : 'text-text-tertiary hover:text-text-secondary',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="p-5 text-xs font-mono text-text-tertiary">loading…</p>
          ) : shown.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
              <CheckCircle2 className="h-8 w-8 text-success opacity-60" />
              <p className="text-xs font-mono text-text-tertiary">
                {tab === 'pending' ? 'No pending approvals' : 'No resolved approvals'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border-subtle">
              {shown.map((a: ApprovalFull) => (
                <div key={a.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-accent bg-accent/10 border border-accent/20 px-2 py-0.5">
                      {a.actionType}
                    </span>
                    <span className={cn('font-mono text-[10px] font-semibold border px-2 py-0.5', confidenceClass(a.confidence))}>
                      {a.confidence ? `${Math.round(parseFloat(a.confidence) * 100)}%` : '—'}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-mono text-text-tertiary">agent · {a.agentId}</p>
                    {a.taskId && (
                      <p className="text-[11px] font-mono text-text-primary mt-1 flex items-center gap-1">
                        <ChevronRight className="h-3 w-3 text-text-tertiary" />
                        {tasks.find((t) => t.id === a.taskId)?.title ?? (a.taskId.slice(0, 8) + '…')}
                      </p>
                    )}
                  </div>
                  <RubricScoreEditor approval={a} onSave={(scores) => saveScores(a, scores)} />
                  {a.status === 'pending' ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => decide(a.id, 'approved')}
                        disabled={updatingId === a.id}
                        className="flex-1 py-1.5 text-xs font-mono font-semibold text-white bg-accent border border-accent hover:bg-accent-hover disabled:opacity-50 transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => decide(a.id, 'rejected')}
                        disabled={updatingId === a.id}
                        className="flex-1 py-1.5 text-xs font-mono font-semibold text-error border border-error/40 hover:bg-error/10 disabled:opacity-50 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-[10px] font-mono text-text-tertiary">
                      <Clock className="h-3 w-3" />
                      <span>{a.updatedAt ? relativeTime(a.updatedAt) : '—'}</span>
                      <span
                        className={cn(
                          'ml-auto px-2 py-0.5 border font-semibold uppercase tracking-wider',
                          a.status === 'approved'
                            ? 'text-success border-success/30 bg-success/10'
                            : 'text-error border-error/30 bg-error/10',
                        )}
                      >
                        {a.status}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Board settings panel ─────────────────────────────────────────────────────

function BoardSettingsPanel({
  boardId,
  board,
  agents,
  onClose,
}: {
  boardId: string
  board: import('@/hooks/api/boards').Board
  agents: import('@/hooks/api/agents').Agent[] | undefined
  onClose: () => void
}) {
  const [name, setName] = useState(board.name)
  const [description, setDescription] = useState(board.description ?? '')
  const [objective, setObjective] = useState(board.objective ?? '')
  const [targetDate, setTargetDate] = useState(
    board.targetDate ? board.targetDate.slice(0, 10) : '',
  )
  const [gatewayAgentId, setGatewayAgentId] = useState(board.gatewayAgentId ?? '')
  const [requireApprovalForDone, setRequireApprovalForDone] = useState(board.requireApprovalForDone ?? false)
  const [requireReviewBeforeDone, setRequireReviewBeforeDone] = useState(board.requireReviewBeforeDone ?? false)
  const [blockStatusChangesWithPendingApproval, setBlockStatusChangesWithPendingApproval] = useState(board.blockStatusChangesWithPendingApproval ?? false)
  const [commentRequiredForReview, setCommentRequiredForReview] = useState(board.commentRequiredForReview ?? false)
  const [onlyLeadCanChangeStatus, setOnlyLeadCanChangeStatus] = useState(board.onlyLeadCanChangeStatus ?? false)
  const [maxAgents, setMaxAgents] = useState(board.maxAgents ?? 10)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggles: Array<{ label: string; value: boolean; set: (v: boolean) => void }> = [
    { label: 'Require approval before Done', value: requireApprovalForDone, set: setRequireApprovalForDone },
    { label: 'Require Review stage before Done', value: requireReviewBeforeDone, set: setRequireReviewBeforeDone },
    { label: 'Block status changes with pending approvals', value: blockStatusChangesWithPendingApproval, set: setBlockStatusChangesWithPendingApproval },
    { label: 'Comment required for Review', value: commentRequiredForReview, set: setCommentRequiredForReview },
    { label: 'Only lead can change status', value: onlyLeadCanChangeStatus, set: setOnlyLeadCanChangeStatus },
  ]

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await api.patch(`api/boards/${boardId}`, {
        json: {
          name: name.trim(),
          description: description.trim() || null,
          objective: objective.trim() || null,
          targetDate: targetDate ? new Date(targetDate).toISOString() : null,
          gatewayAgentId: gatewayAgentId || null,
          requireApprovalForDone,
          requireReviewBeforeDone,
          blockStatusChangesWithPendingApproval,
          commentRequiredForReview,
          onlyLeadCanChangeStatus,
          maxAgents,
        },
      }).json<unknown>()
      queryClient.invalidateQueries({ queryKey: ['board', boardId, 'snapshot'] })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-surface border-l border-border w-[420px] h-full flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="font-mono text-[12px] font-semibold text-text-primary uppercase tracking-wide flex items-center gap-2">
              <Settings className="h-3.5 w-3.5 text-text-tertiary" />
              Board settings
            </h3>
          </div>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Identity */}
          <section className="space-y-3">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">Identity</p>
            <div className="space-y-2">
              <label className="font-mono text-[11px] text-text-secondary">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-canvas border border-border px-3 py-2 text-sm font-mono text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent"
              />
            </div>
            <div className="space-y-2">
              <label className="font-mono text-[11px] text-text-secondary">Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-canvas border border-border px-3 py-2 text-sm font-mono text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent"
              />
            </div>
            <div className="space-y-2">
              <label className="font-mono text-[11px] text-text-secondary">Objective</label>
              <textarea
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                rows={3}
                className="w-full bg-canvas border border-border px-3 py-2 text-sm font-mono text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent resize-none"
              />
            </div>
            <div className="space-y-2">
              <label className="font-mono text-[11px] text-text-secondary">Target date</label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full bg-canvas border border-border px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
            <div className="space-y-2">
              <label className="font-mono text-[11px] text-text-secondary">Gateway agent</label>
              <select
                value={gatewayAgentId}
                onChange={(e) => setGatewayAgentId(e.target.value)}
                className="w-full bg-canvas border border-border px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-accent"
              >
                <option value="">None</option>
                {(agents ?? []).map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </section>

          {/* Governance */}
          <section className="space-y-3">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">Governance</p>
            {toggles.map(({ label, value, set }) => (
              <label key={label} className="flex items-center justify-between gap-3 cursor-pointer">
                <span className="font-mono text-[11px] text-text-secondary">{label}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={value}
                  onClick={() => set(!value)}
                  className={cn(
                    'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 transition-colors focus:outline-none',
                    value ? 'bg-accent border-accent' : 'bg-surface-hover border-border',
                  )}
                >
                  <span className={cn(
                    'pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform my-auto',
                    value ? 'translate-x-4' : 'translate-x-0.5',
                  )} />
                </button>
              </label>
            ))}
          </section>

          {/* Capacity */}
          <section className="space-y-3">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">Capacity</p>
            <div className="space-y-2">
              <label className="font-mono text-[11px] text-text-secondary">Max agents (1–100)</label>
              <input
                type="number"
                min={1}
                max={100}
                value={maxAgents}
                onChange={(e) => setMaxAgents(Math.min(100, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                className="w-full bg-canvas border border-border px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
          </section>

          {error && (
            <p className="font-mono text-xs text-error border border-error/30 bg-error/10 px-3 py-2">{error}</p>
          )}
        </div>

        <div className="p-5 border-t border-border">
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="w-full py-2 text-xs font-mono font-semibold text-white bg-accent border border-accent hover:bg-accent disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Board detail page ────────────────────────────────────────────────────────

function BoardDetailPage() {
  const { boardId } = Route.useParams()
  const { data: snapshot, isLoading, isError } = useBoard(boardId)
  const { data: agents } = useAgents()
  const updateTask = useUpdateTask()
  const updateBoard = useUpdateBoard(boardId)

  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [overColumn, setOverColumn] = useState<Status | null>(null)
  const [boardChatOpen, setBoardChatOpen] = useState(false)
  const [approvalsOpen, setApprovalsOpen] = useState(false)
  const [boardSettingsOpen, setBoardSettingsOpen] = useState(false)
  const [dragError, setDragError] = useState<string | null>(null)
  const [filterText, setFilterText] = useState('')
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const [filterAgentId, setFilterAgentId] = useState<string>('all')
  const [filterTagId, setFilterTagId] = useState<string>('all')
  const [filterBlocked, setFilterBlocked] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  function handleDragStart(event: DragStartEvent) {
    const task = snapshot?.tasks.find((t) => t.id === event.active.id)
    if (task) setActiveTask(task)
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null)
    setOverColumn(null)
    const { active, over } = event
    if (!over || !snapshot) return

    const taskId = active.id as string
    const task = snapshot.tasks.find((t) => t.id === taskId)
    if (!task) return

    // over could be a column id or another task id
    const targetColId = COLUMNS.find((c) => c.id === over.id)?.id
      ?? snapshot.tasks.find((t) => t.id === over.id)?.status

    if (!targetColId || targetColId === task.status) return

    // Optimistic update
    queryClient.setQueryData<BoardSnapshot>(['board', boardId, 'snapshot'], (old) => {
      if (!old) return old
      return {
        ...old,
        tasks: old.tasks.map((t) => (t.id === taskId ? { ...t, status: targetColId } : t)),
      }
    })

    try {
      await updateTask.mutateAsync({ id: taskId, status: targetColId })
    } catch (err: unknown) {
      queryClient.invalidateQueries({ queryKey: ['board', boardId, 'snapshot'] })
      let msg = 'Status change blocked by board governance.'
      try {
        const httpErr = err as { response?: { json?: () => Promise<{ error?: string }> } }
        if (httpErr.response?.json) {
          const body = await httpErr.response.json()
          if (body.error) msg = body.error
        }
      } catch { /* response not parseable — use generic message */ }
      setDragError(msg)
    }
  }

  const boardTags = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string }>()
    snapshot?.tasks.forEach((t) => t.tags?.forEach((tag) => map.set(tag.id, tag)))
    return [...map.values()]
  }, [snapshot?.tasks])

  const filteredTasks = useMemo(() => {
    if (!snapshot?.tasks) return []
    return snapshot.tasks.filter((task) => {
      if (filterText && !task.title.toLowerCase().includes(filterText.toLowerCase())) return false
      if (filterPriority !== 'all' && task.priority !== filterPriority) return false
      if (filterAgentId !== 'all' && task.assignedAgentId !== filterAgentId) return false
      if (filterTagId !== 'all' && !task.tags?.some((t) => t.id === filterTagId)) return false
      if (filterBlocked && !(task.depCount && task.depCount > 0)) return false
      return true
    })
  }, [snapshot?.tasks, filterText, filterPriority, filterAgentId, filterTagId, filterBlocked])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-text-secondary">Loading board…</div>
    )
  }

  if (isError || !snapshot) {
    return (
      <div className="flex items-center justify-center h-64 text-error">Failed to load board.</div>
    )
  }

  const { board, tasks, approvals } = snapshot
  const pendingApprovals = approvals.filter((a) => a.status === 'pending')

  const tasksByStatus = (status: Status) => filteredTasks.filter((t) => t.status === status)

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-subtle pb-3 mb-2">
        <div className="flex-1 min-w-0 mr-4">
          <h1 className="font-mono text-[13px] font-semibold text-text-primary tracking-wide uppercase">
            <span className="text-accent">~/boards/</span>{board.name}
          </h1>
          {board.description && <p className="font-mono text-[11px] text-text-tertiary mt-0.5">{board.description}</p>}
          {/* Board health bar */}
          {(() => {
            const total = snapshot.tasks.length
            const done = snapshot.tasks.filter((t) => t.status === 'done').length
            const inProg = snapshot.tasks.filter((t) => t.status === 'in_progress').length
            const blocked = snapshot.tasks.filter((t) => t.depCount && t.depCount > 0).length
            const pct = total > 0 ? Math.round((done / total) * 100) : 0
            const barColor = pct > 70 ? '#3fb950' : pct > 30 ? '#d29922' : '#f85149'
            return (
              <div className="mt-2 flex flex-col gap-1">
                <div className="h-1 bg-surface-hover w-full">
                  <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px] text-text-tertiary">{done} done</span>
                  <span className="font-mono text-[10px] text-text-tertiary">·</span>
                  <span className="font-mono text-[10px] text-text-tertiary">{inProg} in progress</span>
                  {blocked > 0 && (
                    <>
                      <span className="font-mono text-[10px] text-text-tertiary">·</span>
                      <span className="font-mono text-[10px] text-warning">{blocked} blocked</span>
                    </>
                  )}
                  <span className="font-mono text-[10px] text-text-tertiary ml-auto">{pct}%</span>
                </div>
              </div>
            )
          })()}
        </div>
        <div className="flex items-center gap-2">
          {/* Goal Confirmed toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-wider">goal confirmed</span>
            <button
              type="button"
              role="switch"
              aria-checked={board.goalConfirmed ?? false}
              disabled={updateBoard.isPending}
              onClick={() => updateBoard.mutate({ goalConfirmed: !(board.goalConfirmed ?? false) })}
              className={cn(
                'relative inline-flex h-4 w-7 flex-shrink-0 rounded-full border-2 transition-colors focus:outline-none disabled:opacity-50',
                board.goalConfirmed ? 'bg-success border-success' : 'bg-surface-hover border-border',
              )}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-2.5 w-2.5 rounded-full bg-white shadow transform transition-transform my-auto',
                  board.goalConfirmed ? 'translate-x-3' : 'translate-x-0.5',
                )}
              />
            </button>
          </label>
          <button
            onClick={() => setBoardSettingsOpen(true)}
            className="px-3 py-1.5 font-mono text-[11px] text-text-tertiary border border-border hover:border-text-tertiary transition-colors flex items-center gap-1.5"
          >
            <Settings className="h-3 w-3" />
          </button>
          <button
            onClick={() => setBoardChatOpen(true)}
            className="px-3 py-1.5 font-mono text-[11px] text-accent border border-border hover:border-accent transition-colors flex items-center gap-1.5"
          >
            <MessageSquare className="h-3 w-3" />
            Chat
          </button>
        </div>
      </div>

      {/* Approval banner */}
      {pendingApprovals.length > 0 && (
        <div className="flex items-center gap-3 bg-warning-subtle border border-warning px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />
          <span className="text-sm text-warning flex-1">
            {pendingApprovals.length} approval{pendingApprovals.length !== 1 ? 's' : ''} pending review
          </span>
          <button
            onClick={() => setApprovalsOpen(true)}
            className="text-xs font-medium text-warning hover:text-warning border border-warning px-3 py-1 transition-colors"
          >
            Review
          </button>
        </div>
      )}

      {/* Drag error banner */}
      {dragError && (
        <div className="flex items-center gap-3 bg-error-subtle border border-error/50 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-error flex-shrink-0" />
          <span className="text-sm text-error flex-1">{dragError}</span>
          <button
            onClick={() => setDragError(null)}
            className="text-error hover:text-error transition-colors flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          type="text"
          placeholder="search tasks..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className="bg-canvas border border-border px-2.5 py-1.5 text-xs font-mono text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent w-48"
        />
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="bg-surface border border-border px-2 py-1.5 text-xs font-mono text-text-secondary focus:outline-none focus:border-accent"
        >
          <option value="all">all priority</option>
          <option value="high">high</option>
          <option value="medium">medium</option>
          <option value="low">low</option>
        </select>
        {(agents ?? []).length > 0 && (
          <select
            value={filterAgentId}
            onChange={(e) => setFilterAgentId(e.target.value)}
            className="bg-surface border border-border px-2 py-1.5 text-xs font-mono text-text-secondary focus:outline-none focus:border-accent"
          >
            <option value="all">all agents</option>
            {(agents ?? []).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
        {boardTags.length > 0 && (
          <select
            value={filterTagId}
            onChange={(e) => setFilterTagId(e.target.value)}
            className="bg-surface border border-border px-2 py-1.5 text-xs font-mono text-text-secondary focus:outline-none focus:border-accent"
          >
            <option value="all">all tags</option>
            {boardTags.map((tag) => (
              <option key={tag.id} value={tag.id}>{tag.name}</option>
            ))}
          </select>
        )}
        <button
          onClick={() => setFilterBlocked((v) => !v)}
          className={`px-2.5 py-1.5 font-mono text-[11px] uppercase border transition-colors ${
            filterBlocked
              ? 'text-warning border-warning/50 bg-warning/10'
              : 'text-text-tertiary border-border hover:text-text-secondary'
          }`}
        >
          blocked only
        </button>
        {(filterText || filterPriority !== 'all' || filterAgentId !== 'all' || filterTagId !== 'all' || filterBlocked) && (
          <button
            onClick={() => { setFilterText(''); setFilterPriority('all'); setFilterAgentId('all'); setFilterTagId('all'); setFilterBlocked(false) }}
            className="px-2.5 py-1.5 font-mono text-[11px] text-text-tertiary border border-border hover:text-text-secondary transition-colors"
          >
            clear
          </button>
        )}
      </div>

      {/* Kanban board */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => {
          const overId = e.over?.id as string | undefined
          const col = COLUMNS.find((c) => c.id === overId)
          if (col) {
            setOverColumn(col.id)
          } else {
            const task = tasks.find((t) => t.id === overId)
            setOverColumn(task?.status ?? null)
          }
        }}
      >
        <div className="grid grid-cols-4 gap-3 flex-1 min-h-0">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              col={col}
              tasks={tasksByStatus(col.id)}
              boardId={boardId}
              agents={agents}
              isOver={overColumn === col.id && activeTask !== null}
              onOpenTask={setSelectedTask}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask && (
            <div className="shadow-xl rotate-1">
              <KanbanCard task={activeTask} agents={agents} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Task detail sheet */}
      {selectedTask && (
        <TaskDetailSheet
          task={selectedTask}
          agents={agents}
          snapshot={snapshot}
          onClose={() => setSelectedTask(null)}
        />
      )}

      {/* Board chat panel */}
      {boardChatOpen && (
        <BoardChatPanel
          boardId={boardId}
          boardName={board.name}
          gatewayAgentId={board.gatewayAgentId ?? null}
          onClose={() => setBoardChatOpen(false)}
        />
      )}

      {/* Approvals panel */}
      {approvalsOpen && (
        <ApprovalsPanel
          boardId={boardId}
          tasks={tasks}
          onClose={() => setApprovalsOpen(false)}
        />
      )}

      {/* Board settings panel */}
      {boardSettingsOpen && (
        <BoardSettingsPanel
          boardId={boardId}
          board={board}
          agents={agents}
          onClose={() => setBoardSettingsOpen(false)}
        />
      )}
    </div>
  )
}
