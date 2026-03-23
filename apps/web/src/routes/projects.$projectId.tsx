import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  useNodesState,
  useEdgesState,
} from 'reactflow'
import type { Node, Edge } from 'reactflow'
import 'reactflow/dist/style.css'
import dagre from '@dagrejs/dagre'
import { ArrowLeft, Play, Loader2, Plus, X, Search, Folder, Copy, Check } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { AgentChip } from '@/components/atoms/AgentChip'
import {
  useProject,
  useUpdateProject,
  useUpdateProjectTask,
  useKickoffProject,
  useAddProjectTask,
  useRemoveProjectTask,
  useInitProjectWorkspace,
  type Project,
  type ProjectTask,
  type Task,
} from '@/hooks/api/projects'
import { useAgents } from '@/hooks/api/agents'
import { api } from '@/lib/api'

export const Route = createFileRoute('/projects/$projectId')({
  component: ProjectDetailPage,
})

// --- helpers ---

const TASK_STATUS_COLORS: Record<Task['status'], string> = {
  inbox: '#21262d',
  in_progress: '#0d2341',
  review: '#1a1040',
  done: '#0d2818',
}

const TASK_STATUS_LABELS: Record<Task['status'], string> = {
  inbox: 'Inbox',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
}

const STATUS_BADGE: Record<Task['status'], string> = {
  inbox: 'text-text-secondary border-border',
  in_progress: 'text-accent border-accent',
  review: 'text-purple-400 border-purple-600',
  done: 'text-success border-success',
}

const PROJECT_STATUS_STYLES: Record<Project['status'], string> = {
  planning: 'text-text-secondary border-border',
  active: 'text-accent border-accent',
  paused: 'text-warning border-warning',
  complete: 'text-success border-success',
}

interface AllTasksPickerTask { id: string; title: string; boardId: string; status: string }

// --- dagre layout ---

function layoutNodes(
  rawNodes: Array<{ id: string; data: Record<string, unknown> }>,
  rawEdges: Array<{ id: string; source: string; target: string }>,
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', ranksep: 80, nodesep: 40 })

  rawNodes.forEach((n) => g.setNode(n.id, { width: 220, height: 80 }))
  rawEdges.forEach((e) => g.setEdge(e.source, e.target))
  dagre.layout(g)

  const nodes: Node[] = rawNodes.map((n) => {
    const pos = g.node(n.id)
    return {
      id: n.id,
      type: 'projectTask',
      position: { x: pos.x - 110, y: pos.y - 40 },
      data: n.data,
    }
  })

  const edges: Edge[] = rawEdges.map((e) => ({
    ...e,
    markerEnd: { type: MarkerType.ArrowClosed, color: '#58a6ff' },
  }))

  return { nodes, edges }
}

// --- custom node ---

interface TaskNodeData {
  task: Task | null
  agentName?: string
}

function ProjectTaskNode({ data }: { data: TaskNodeData }) {
  const { task } = data
  if (!task) {
    return (
      <div
        style={{
          width: 220,
          height: 80,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#21262d',
          borderColor: '#30363d',
          borderWidth: 1,
          borderStyle: 'solid',
          borderRadius: 0,
        }}
        className="px-3 py-2 text-xs text-text-tertiary"
      >
        Unknown task
      </div>
    )
  }

  return (
    <div
      style={{
        width: 220,
        height: 80,
        background: TASK_STATUS_COLORS[task.status],
        borderColor: '#30363d',
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: 0,
      }}
      className="px-3 py-2 flex flex-col justify-between"
    >
      <div className="flex items-center gap-1.5 overflow-hidden">
        <span
          className="inline-block h-2 w-2 rounded-full flex-shrink-0"
          style={{
            background:
              task.status === 'done'
                ? '#3fb950'
                : task.status === 'in_progress'
                  ? '#58a6ff'
                  : task.status === 'review'
                    ? '#a5a0ff'
                    : '#6e7681',
          }}
        />
        <span className="text-sm font-medium text-text-primary truncate">{task.title}</span>
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-text-secondary">{TASK_STATUS_LABELS[task.status]}</span>
        {data.agentName && (
          <AgentChip
            name={data.agentName}
            emoji={'🤖'}
            className="text-xs py-0.5 px-2"
          />
        )}
      </div>
    </div>
  )
}

const nodeTypes = { projectTask: ProjectTaskNode }

// --- progress ring ---

function ProgressRing({ pct, size = 64 }: { pct: number; size?: number }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#30363d" strokeWidth={4} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#58a6ff"
        strokeWidth={4}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  )
}

// --- workspace card ---

function WorkspaceCard({ projectId, workspacePath }: { projectId: string; workspacePath?: string | null }) {
  const initWorkspace = useInitProjectWorkspace(projectId)
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (!workspacePath) return
    navigator.clipboard.writeText(workspacePath).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const displayPath = workspacePath
    ? workspacePath.replace(/^\/Users\/[^/]+/, '~')
    : null

  return (
    <div className="border border-border bg-surface p-4 flex flex-col gap-3">
      <p className="text-xs font-medium uppercase tracking-wider text-text-secondary">Workspace</p>
      {workspacePath ? (
        <>
          <div className="flex items-start gap-2">
            <code className="flex-1 text-xs font-mono text-text-primary break-all leading-relaxed">
              {displayPath}
            </code>
            <button
              onClick={handleCopy}
              className="flex-shrink-0 p-1 text-text-tertiary hover:text-text-primary transition-colors"
              title="Copy path"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          <p className="text-xs text-text-tertiary">BRIEF.md · MEMORY.md · CONTEXT.md · TOOLS.md</p>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-text-tertiary">No workspace initialized.</p>
          <button
            onClick={() => initWorkspace.mutate()}
            disabled={initWorkspace.isPending}
            className="inline-flex items-center justify-center gap-1.5 border border-border bg-surface-hover px-3 py-1.5 text-xs text-text-primary hover:bg-surface-hover disabled:opacity-40 transition-colors"
          >
            {initWorkspace.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Folder className="h-3.5 w-3.5" />
            )}
            {initWorkspace.isPending ? 'Initializing…' : 'Initialize'}
          </button>
        </div>
      )}
    </div>
  )
}

// --- DAG panel ---

interface DagPanelProps {
  tasks: Array<{ pt: ProjectTask; task: Task | null }>
  agentMap: Map<string, { name: string }>
}

function DagPanel({ tasks, agentMap }: DagPanelProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  const buildGraph = useCallback(() => {
    if (tasks.length === 0) return

    const sorted = [...tasks].sort((a, b) => a.pt.position - b.pt.position)

    const rawNodes = sorted.map(({ pt, task }) => {
      const agent = task?.assignedAgentId ? agentMap.get(task.assignedAgentId) : undefined
      return {
        id: pt.taskId,
        data: {
          task,
          agentName: agent?.name,
        } as Record<string, unknown>,
      }
    })

    // Build edges: sequential tasks chain; parallel tasks at same position share no edge between them
    const rawEdges: Array<{ id: string; source: string; target: string; animated: boolean }> = []

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]
      const curr = sorted[i]

      // Only draw edge when positions differ (sequential transition)
      if (prev.pt.position !== curr.pt.position) {
        const upstream = sorted.filter((t) => t.pt.position === prev.pt.position)
        const downstream = sorted.filter((t) => t.pt.position === curr.pt.position)

        for (const up of upstream) {
          for (const down of downstream) {
            const animated = up.task?.status !== 'done'
            rawEdges.push({
              id: `${up.pt.taskId}-${down.pt.taskId}`,
              source: up.pt.taskId,
              target: down.pt.taskId,
              animated,
            })
          }
        }
      }
    }

    // Deduplicate edges
    const seen = new Set<string>()
    const uniqueEdges = rawEdges.filter((e) => {
      if (seen.has(e.id)) return false
      seen.add(e.id)
      return true
    })

    const { nodes: layoutedNodes, edges: layoutedEdges } = layoutNodes(rawNodes, uniqueEdges)

    const styledEdges = layoutedEdges.map((e, idx) => ({
      ...e,
      animated: uniqueEdges[idx]?.animated ?? false,
      style: { stroke: '#58a6ff', strokeWidth: 1.5 },
    }))

    setNodes(layoutedNodes)
    setEdges(styledEdges)
  }, [tasks, agentMap, setNodes, setEdges])

  useEffect(() => {
    buildGraph()
  }, [buildGraph])

  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
        No tasks in this project yet.
      </div>
    )
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#21262d" gap={24} />
      <Controls style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 0 }} />
    </ReactFlow>
  )
}

// --- main page ---

function ProjectDetailPage() {
  const { projectId } = Route.useParams()
  const { data, isLoading, isError } = useProject(projectId)
  const { data: agents = [] } = useAgents()
  const updateProject = useUpdateProject(projectId)
  const updateTask = useUpdateProjectTask(projectId)
  const kickoff = useKickoffProject(projectId)
  const addTask = useAddProjectTask(projectId)
  const removeTask = useRemoveProjectTask(projectId)

  const [showPicker, setShowPicker] = useState(false)
  const [taskSearch, setTaskSearch] = useState('')

  const { data: allTasks = [] } = useQuery<AllTasksPickerTask[]>({
    queryKey: ['tasks', 'all-for-picker'],
    queryFn: () => api.get('api/tasks', { searchParams: { limit: '200' } }).json<AllTasksPickerTask[]>(),
    enabled: showPicker,
    staleTime: 30_000,
  })

  const agentMap = useMemo(
    () => new Map(agents.map((a) => [a.id, { name: a.name }])),
    [agents],
  )

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex h-64 items-center justify-center text-text-tertiary">
        Failed to load project.
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center text-text-tertiary">
        Project not found.
      </div>
    )
  }

  const { project, tasks } = data
  const orchestrator = project.orchestratorAgentId ? agentMap.get(project.orchestratorAgentId) : undefined

  const existingTaskIds = new Set(tasks.map(({ pt }) => pt.taskId))
  const pickerItems = allTasks.filter(
    (t) => !existingTaskIds.has(t.id) &&
      t.title.toLowerCase().includes(taskSearch.toLowerCase())
  )

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* back link + title */}
      <div className="flex items-center gap-3">
        <Link to="/projects" className="text-text-secondary hover:text-text-primary transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-semibold text-text-primary">{project.name}</h1>
        <span className={`inline-flex items-center px-1.5 py-0.5 text-xs font-mono border capitalize ${PROJECT_STATUS_STYLES[project.status]}`}>
          {project.status}
        </span>
      </div>

      {/* two-column layout */}
      <div className="flex flex-row gap-4 flex-1 min-h-0">
        {/* DAG panel */}
        <div
          className="flex-1 border border-border bg-surface overflow-hidden"
          style={{ minHeight: 600 }}
        >
          <DagPanel tasks={tasks} agentMap={agentMap} />
        </div>

        {/* Right sidebar */}
        <div className="w-72 flex flex-col gap-4 overflow-y-auto">
          {/* Progress + status card */}
          <div className="border border-border bg-surface p-4 flex flex-col gap-4">
            {/* Progress ring */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <ProgressRing pct={project.progressPct} size={64} />
                <span className="absolute inset-0 flex items-center justify-center text-sm font-mono font-medium text-text-primary">
                  {project.progressPct}%
                </span>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-text-secondary">Progress</p>
                <p className="text-sm font-mono text-text-primary">{project.progressPct}% complete</p>
              </div>
            </div>

            {/* Status */}
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-secondary">Status</label>
              <select
                value={project.status}
                onChange={(e) =>
                  updateProject.mutate({ status: e.target.value as Project['status'] })
                }
                className="w-full border border-border bg-canvas px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              >
                {(['planning', 'active', 'paused', 'complete'] as const).map((s) => (
                  <option key={s} value={s} className="capitalize">
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* Target date */}
            {project.targetDate && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-text-secondary">Target Date</p>
                <p className="text-sm font-mono text-text-primary">
                  {new Date(project.targetDate).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              </div>
            )}

            {/* Orchestrator */}
            {orchestrator && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-text-secondary">Orchestrator</p>
                <AgentChip emoji={'🤖'} name={orchestrator.name} />
              </div>
            )}

            {/* Kickoff button */}
            <button
              onClick={() => kickoff.mutate()}
              disabled={kickoff.isPending || !project.orchestratorAgentId}
              className="mt-1 w-full inline-flex items-center justify-center gap-2 border border-success bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {kickoff.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {kickoff.isPending ? 'Starting…' : 'Kickoff'}
            </button>
          </div>

          {/* Workspace */}
          <WorkspaceCard projectId={projectId} workspacePath={project.workspacePath} />

          {/* Task list */}
          <div className="border border-border bg-surface overflow-hidden">
            <div className="border-b border-border px-4 py-3 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-text-secondary">Tasks ({tasks.length})</p>
              <button
                onClick={() => setShowPicker((v) => !v)}
                className="flex items-center justify-center h-5 w-5 border border-border text-text-secondary hover:text-text-primary hover:border-accent transition-colors"
                title="Add task"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {tasks.length === 0 && !showPicker && (
              <div className="px-4 py-6 flex flex-col items-center gap-2 text-text-tertiary text-sm">
                <span>No tasks yet.</span>
                <button
                  onClick={() => setShowPicker(true)}
                  className="text-xs text-accent hover:underline"
                >
                  + add tasks
                </button>
              </div>
            )}

            {tasks.length > 0 && (
              <div className="flex flex-col divide-y divide-border-subtle">
                {[...tasks]
                  .sort((a, b) => a.pt.position - b.pt.position)
                  .map(({ pt, task }) => (
                    <div key={pt.taskId} className="px-4 py-3 flex flex-col gap-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm text-text-primary leading-snug">{task?.title ?? pt.taskId}</span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {task && (
                            <span className={`inline-flex items-center px-1.5 py-0.5 text-xs font-mono border ${STATUS_BADGE[task.status]}`}>
                              {TASK_STATUS_LABELS[task.status]}
                            </span>
                          )}
                          <button
                            onClick={() => removeTask.mutate(pt.taskId)}
                            className="text-text-tertiary hover:text-error transition-colors"
                            title="Remove from project"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">Mode:</span>
                        <button
                          onClick={() =>
                            updateTask.mutate({
                              taskId: pt.taskId,
                              executionMode: pt.executionMode === 'sequential' ? 'parallel' : 'sequential',
                            })
                          }
                          className={`px-1.5 py-0.5 text-xs font-mono border transition-colors ${
                            pt.executionMode === 'sequential'
                              ? 'text-accent border-accent hover:bg-accent-subtle'
                              : 'text-warning border-warning hover:bg-warning-subtle'
                          }`}
                        >
                          {pt.executionMode}
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* Task picker */}
            {showPicker && (
              <div className="border-t border-border">
                <div className="px-3 py-2 flex items-center gap-2 border-b border-border-subtle">
                  <Search className="h-3.5 w-3.5 text-text-tertiary flex-shrink-0" />
                  <input
                    autoFocus
                    value={taskSearch}
                    onChange={(e) => setTaskSearch(e.target.value)}
                    placeholder="Search tasks…"
                    className="flex-1 bg-transparent text-xs text-text-primary placeholder-text-tertiary outline-none"
                  />
                  <button
                    onClick={() => { setShowPicker(false); setTaskSearch('') }}
                    className="text-text-tertiary hover:text-text-primary transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex flex-col overflow-y-auto" style={{ maxHeight: 200 }}>
                  {pickerItems.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-text-tertiary">
                      {taskSearch ? 'No matching tasks.' : 'All tasks already added.'}
                    </p>
                  ) : (
                    pickerItems.map((t) => (
                      <div key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-surface-hover">
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs text-text-primary truncate">{t.title}</span>
                          <span className={`text-xs font-mono ${STATUS_BADGE[t.status as Task['status']] ?? 'text-text-secondary'}`}>
                            {t.status}
                          </span>
                        </div>
                        <button
                          onClick={() => addTask.mutate({ taskId: t.id, executionMode: 'sequential' })}
                          disabled={addTask.isPending}
                          className="flex-shrink-0 px-2 py-0.5 text-xs border border-success text-success hover:bg-success-subtle disabled:opacity-40 transition-colors"
                        >
                          Add
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
