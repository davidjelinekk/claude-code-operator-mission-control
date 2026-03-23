import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Plus, FolderKanban, Folder, FolderOpen } from 'lucide-react'
import { AgentChip } from '@/components/atoms/AgentChip'
import { useProjects, useCreateProject, type Project } from '@/hooks/api/projects'
import { useAgents } from '@/hooks/api/agents'

export const Route = createFileRoute('/projects/')({
  component: ProjectsPage,
})

// --- helpers ---

function formatDate(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const STATUS_STYLES: Record<Project['status'], string> = {
  planning: 'text-text-secondary border-border',
  active: 'text-accent border-accent',
  paused: 'text-warning border-warning',
  complete: 'text-success border-accent',
}

function StatusBadge({ status }: { status: Project['status'] }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-xs font-mono font-medium border capitalize ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  )
}

function ProgressRing({ pct }: { pct: number }) {
  const radius = 12
  const circ = 2 * Math.PI * radius
  const offset = circ - (pct / 100) * circ
  return (
    <svg width={32} height={32} viewBox="0 0 32 32" className="rotate-[-90deg]">
      <circle cx={16} cy={16} r={radius} fill="none" stroke="#30363d" strokeWidth={3} />
      <circle
        cx={16}
        cy={16}
        r={radius}
        fill="none"
        stroke="#58a6ff"
        strokeWidth={3}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  )
}

// --- skeleton ---

function SkeletonRow() {
  return (
    <tr className="border-b border-border-subtle">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-surface-hover animate-pulse" style={{ width: `${60 + i * 10}%` }} />
        </td>
      ))}
    </tr>
  )
}

// --- create dialog ---

interface CreateDialogProps {
  onClose: () => void
}

function CreateProjectDialog({ onClose }: CreateDialogProps) {
  const { data: agents = [] } = useAgents()
  const createProject = useCreateProject()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [orchestratorAgentId, setOrchestratorAgentId] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    createProject.mutate(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        targetDate: targetDate || undefined,
        orchestratorAgentId: orchestratorAgentId || undefined,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-md bg-surface border border-border p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-text-primary">New Project</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-secondary">Name *</label>
            <input
              className="w-full border border-border bg-canvas px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-secondary">Description</label>
            <textarea
              className="w-full border border-border bg-canvas px-3 py-2 text-sm text-text-primary outline-none focus:border-accent resize-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional description"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-secondary">Target Date</label>
            <input
              type="date"
              className="w-full border border-border bg-canvas px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-secondary">Orchestrator Agent</label>
            <select
              className="w-full border border-border bg-canvas px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              value={orchestratorAgentId}
              onChange={(e) => setOrchestratorAgentId(e.target.value)}
            >
              <option value="">None</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="border border-border bg-surface-hover px-3 py-1.5 text-sm text-text-primary hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createProject.isPending}
              className="bg-accent border border-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {createProject.isPending ? 'Creating…' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// --- main page ---

function ProjectsPage() {
  const { data: projects, isLoading } = useProjects()
  const { data: agents = [] } = useAgents()
  const [showCreate, setShowCreate] = useState(false)

  const agentMap = new Map(agents.map((a) => [a.id, a]))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between pb-4 mb-5 border-b border-border-subtle">
        <h1 className="font-mono text-[13px] font-semibold text-text-primary tracking-wide uppercase flex items-center gap-2">
          <span className="text-accent">~/</span>projects
        </h1>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 bg-accent border border-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Project
        </button>
      </div>

      <div className="border border-border bg-surface overflow-hidden">
        <table className="w-full text-sm text-text-primary">
          <thead>
            <tr className="border-b border-border text-left bg-surface">
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-secondary">Name</th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-secondary">Status</th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-secondary">Progress</th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-secondary">Target Date</th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-secondary">Orchestrator</th>
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-text-secondary w-10" title="Workspace"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && [1, 2, 3, 4].map((i) => <SkeletonRow key={i} />)}

            {!isLoading && projects?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-3 text-text-tertiary">
                    <FolderKanban className="h-10 w-10 opacity-40" />
                    <p className="text-sm">No projects yet. Create one to get started.</p>
                  </div>
                </td>
              </tr>
            )}

            {!isLoading &&
              projects?.map((project) => {
                const agent = project.orchestratorAgentId ? agentMap.get(project.orchestratorAgentId) : undefined
                return (
                  <tr key={project.id} className="border-b border-border-subtle hover:bg-canvas/50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        to="/projects/$projectId"
                        params={{ projectId: project.id }}
                        className="font-medium text-text-primary hover:text-accent transition-colors"
                      >
                        {project.name}
                      </Link>
                      {project.description && (
                        <p className="mt-0.5 text-xs text-text-tertiary truncate max-w-xs">{project.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={project.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <ProgressRing pct={project.progressPct} />
                        <span className="text-xs font-mono text-text-secondary">{project.progressPct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary font-mono text-xs">{formatDate(project.targetDate)}</td>
                    <td className="px-4 py-3">
                      {agent ? (
                        <AgentChip emoji={'🤖'} name={agent.name} online={agent.status === 'available'} />
                      ) : (
                        <span className="text-text-tertiary">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3" title={project.workspacePath ?? 'No workspace'}>
                      {project.workspacePath ? (
                        <FolderOpen className="h-4 w-4 text-accent" />
                      ) : (
                        <Folder className="h-4 w-4 text-border" />
                      )}
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      {showCreate && <CreateProjectDialog onClose={() => setShowCreate(false)} />}
    </div>
  )
}
