import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { Play, ChevronDown, ChevronRight, Loader2, Trash2, Plus, X } from 'lucide-react'
import {
  useCronJobs,
  useTriggerCron,
  useCreateCron,
  useDeleteCron,
  type CronJob,
  type CronRun,
} from '@/hooks/api/cron'
import { useAgents, useAgentNameMap } from '@/hooks/api/agents'
import { AgentChip } from '@/components/atoms/AgentChip'
import { relativeTime } from '@/lib/utils'

export const Route = createFileRoute('/cron')({
  component: CronPage,
})

function formatDuration(ms?: number): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function countdown(iso?: string): string {
  if (!iso) return '—'
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'now'
  const secs = Math.floor(diff / 1000)
  const mins = Math.floor(secs / 60)
  const remSecs = secs % 60
  if (mins > 0) return `in ${mins}m ${remSecs}s`
  return `in ${secs}s`
}

function describeSchedule(expr: string): string {
  switch (expr.trim()) {
    case '* * * * *': return 'every minute'
    case '0 * * * *': return 'every hour'
    case '0 0 * * *': return 'daily at midnight'
    case '0 12 * * *': return 'daily at noon'
    case '0 0 * * 0': return 'weekly on Sunday'
    case '0 0 1 * *': return 'monthly on the 1st'
    default: return expr
  }
}

const STATUS_STYLES: Record<CronJob['status'], string> = {
  ok: 'text-success border-accent',
  error: 'text-error border-error',
  timeout: 'text-warning border-warning',
  running: 'text-accent border-accent animate-pulse',
  disabled: 'text-text-tertiary border-border',
}

const RUN_STATUS_STYLES: Record<CronRun['status'], string> = {
  ok: 'text-success border-accent',
  error: 'text-error border-error',
  timeout: 'text-warning border-warning',
}

function StatusBadge({ status }: { status: CronJob['status'] }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-xs font-mono border ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  )
}

function RunStatusBadge({ status }: { status: CronRun['status'] }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-xs font-mono border ${RUN_STATUS_STYLES[status]}`}>
      {status}
    </span>
  )
}

function CountdownCell({ nextRunAt }: { nextRunAt?: string }) {
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  return <span className="font-mono text-text-secondary">{countdown(nextRunAt)}</span>
}

function CronRow({ job }: { job: CronJob }) {
  const [expanded, setExpanded] = useState(false)
  const [triggering, setTriggering] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const agentName = useAgentNameMap()
  const trigger = useTriggerCron()
  const deleteCron = useDeleteCron()

  const runs = job.recentRuns?.slice(0, 5) ?? []
  const scheduleLabel = describeSchedule(job.schedule)
  const showHint = scheduleLabel !== job.schedule

  return (
    <>
      <tr
        className="border-b border-border-subtle hover:bg-surface cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            <span className="text-text-tertiary w-4">
              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </span>
            <span className="text-text-primary font-medium">{job.name}</span>
          </div>
        </td>
        <td className="py-3 px-4">
          <span className="font-mono text-xs text-text-secondary">{job.schedule}</span>
          {showHint && (
            <span className="ml-2 text-xs text-text-tertiary">({scheduleLabel})</span>
          )}
        </td>
        <td className="py-3 px-4">
          {job.agentId ? (
            <AgentChip emoji="🤖" name={agentName(job.agentId)} />
          ) : (
            <span className="text-text-tertiary">—</span>
          )}
        </td>
        <td className="py-3 px-4 font-mono text-xs text-text-secondary">
          {job.lastRunAt ? relativeTime(job.lastRunAt) : '—'}
        </td>
        <td className="py-3 px-4 font-mono text-sm text-text-secondary">
          {formatDuration(job.lastDurationMs)}
        </td>
        <td className="py-3 px-4">
          <StatusBadge status={job.status} />
        </td>
        <td className="py-3 px-4">
          {job.consecutiveErrors > 0 ? (
            <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-mono border border-error text-error">
              {job.consecutiveErrors} err{job.consecutiveErrors !== 1 ? 's' : ''}
            </span>
          ) : (
            <span className="text-text-tertiary">—</span>
          )}
        </td>
        <td className="py-3 px-4 text-sm">
          <CountdownCell nextRunAt={job.nextRunAt} />
        </td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => {
                if (triggering) return
                setTriggering(true)
                trigger.mutate(job.id, { onSettled: () => setTriggering(false) })
              }}
              disabled={triggering}
              className="flex items-center gap-1.5 px-2 py-1 text-xs border border-border bg-surface-hover text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-50"
            >
              {triggering ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Play className="w-3 h-3" />
              )}
              Run
            </button>
            <button
              onClick={() => {
                if (deleting) return
                setDeleting(true)
                deleteCron.mutate(job.id, { onSettled: () => setDeleting(false) })
              }}
              disabled={deleting}
              className="flex items-center justify-center w-7 h-7 border border-border bg-surface-hover text-text-tertiary hover:text-error hover:border-error transition-colors disabled:opacity-50"
              title="Delete cron job"
            >
              {deleting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Trash2 className="w-3 h-3" />
              )}
            </button>
            {deleteCron.isError && (
              <span className="text-xs text-error font-mono">
                {String(deleteCron.error)}
              </span>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border-subtle bg-canvas">
          <td colSpan={9} className="px-12 py-3">
            {runs.length === 0 ? (
              <p className="text-sm text-text-tertiary py-2">No recent runs recorded.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                    <th className="text-left pb-1">Run At</th>
                    <th className="text-left pb-1">Duration</th>
                    <th className="text-left pb-1">Status</th>
                    <th className="text-left pb-1">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r, i) => (
                    <tr key={i} className="border-t border-border-subtle">
                      <td className="py-1.5 font-mono text-xs text-text-secondary pr-6">{new Date(r.runAt).toLocaleString()}</td>
                      <td className="py-1.5 font-mono text-xs text-text-secondary pr-6">{formatDuration(r.durationMs)}</td>
                      <td className="py-1.5 pr-6">
                        <RunStatusBadge status={r.status} />
                      </td>
                      <td className="py-1.5 text-error text-xs font-mono">{r.errorMessage ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

interface CreateCronFormProps {
  onClose: () => void
}

function CreateCronForm({ onClose }: CreateCronFormProps) {
  const [name, setName] = useState('')
  const [schedule, setSchedule] = useState('')
  const [agentId, setAgentId] = useState('')
  const [command, setCommand] = useState('')
  const { data: agents } = useAgents()
  const createCron = useCreateCron()

  const scheduleHint = schedule ? describeSchedule(schedule) : ''
  const showHint = scheduleHint && scheduleHint !== schedule

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name || !schedule || !agentId || !command) return
    createCron.mutate(
      { name, schedule, agentId, command },
      {
        onSuccess: () => {
          onClose()
        },
      },
    )
  }

  return (
    <div className="border border-border bg-surface p-5 mb-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-mono text-xs font-semibold text-text-primary uppercase tracking-wide">New Cron Job</h2>
        <button
          onClick={onClose}
          className="text-text-tertiary hover:text-text-primary transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-mono text-text-secondary uppercase tracking-wide">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="sync-reports"
            required
            className="bg-canvas border border-border text-text-primary text-sm px-3 py-2 font-mono focus:outline-none focus:border-accent placeholder-text-tertiary"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-mono text-text-secondary uppercase tracking-wide">
            Schedule
            {showHint && (
              <span className="ml-2 normal-case text-success">— {scheduleHint}</span>
            )}
          </label>
          <input
            type="text"
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            placeholder="0 * * * *"
            required
            className="bg-canvas border border-border text-text-primary text-sm px-3 py-2 font-mono focus:outline-none focus:border-accent placeholder-text-tertiary"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-mono text-text-secondary uppercase tracking-wide">Agent</label>
          {agents && agents.length > 0 ? (
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              required
              className="bg-canvas border border-border text-text-primary text-sm px-3 py-2 font-mono focus:outline-none focus:border-accent"
            >
              <option value="">Select agent…</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              placeholder="agent-id"
              required
              className="bg-canvas border border-border text-text-primary text-sm px-3 py-2 font-mono focus:outline-none focus:border-accent placeholder-text-tertiary"
            />
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-mono text-text-secondary uppercase tracking-wide">Command / Payload</label>
          <textarea
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="run-sync --all"
            required
            rows={1}
            className="bg-canvas border border-border text-text-primary text-sm px-3 py-2 font-mono focus:outline-none focus:border-accent placeholder-text-tertiary resize-none"
          />
        </div>

        <div className="col-span-2 flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={createCron.isPending}
            className="flex items-center gap-2 px-4 py-1.5 text-xs font-mono border border-accent bg-accent/20 text-success hover:bg-accent/40 transition-colors disabled:opacity-50"
          >
            {createCron.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            Create
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-mono border border-border bg-transparent text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          {createCron.isError && (
            <span className="text-xs text-error font-mono">
              {String(createCron.error)}
            </span>
          )}
        </div>
      </form>
    </div>
  )
}

function CronPage() {
  const { data: jobs, isLoading, dataUpdatedAt } = useCronJobs()
  const [showCreate, setShowCreate] = useState(false)
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const lastRefresh = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '—'

  return (
    <div className="p-6">
      <div className="flex items-center justify-between pb-4 mb-5 border-b border-border-subtle">
        <h1 className="font-mono text-[13px] font-semibold text-text-primary tracking-wide uppercase flex items-center gap-2">
          <span className="text-accent">~/</span>cron
        </h1>
        <div className="flex items-center gap-4">
          <p className="text-xs font-mono text-text-tertiary">Last refreshed {lastRefresh}</p>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-border bg-surface-hover text-text-primary hover:bg-surface-hover transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Job
          </button>
        </div>
      </div>

      {showCreate && <CreateCronForm onClose={() => setShowCreate(false)} />}

      {isLoading && (
        <div className="text-center py-16 text-text-tertiary">Loading cron jobs…</div>
      )}

      {!isLoading && (
        <div className="border border-border bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-medium uppercase tracking-wider text-text-secondary border-b border-border bg-surface">
                <th className="text-left px-4 py-3">Job Name</th>
                <th className="text-left px-4 py-3">Schedule</th>
                <th className="text-left px-4 py-3">Agent</th>
                <th className="text-left px-4 py-3">Last Run</th>
                <th className="text-left px-4 py-3">Duration</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Errors</th>
                <th className="text-left px-4 py-3">Next Run</th>
                <th className="text-left px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(jobs ?? []).map((job) => (
                <CronRow key={job.id} job={job} />
              ))}
              {(jobs ?? []).length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-text-tertiary">No cron jobs configured</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
