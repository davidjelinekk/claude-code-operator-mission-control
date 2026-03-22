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
  ok: 'text-[#3fb950] border-[#238636]',
  error: 'text-[#f85149] border-[#6e0000]',
  timeout: 'text-[#d29922] border-[#9e6a03]',
  running: 'text-[#58a6ff] border-[#1f6feb] animate-pulse',
  disabled: 'text-[#6e7681] border-[#30363d]',
}

const RUN_STATUS_STYLES: Record<CronRun['status'], string> = {
  ok: 'text-[#3fb950] border-[#238636]',
  error: 'text-[#f85149] border-[#6e0000]',
  timeout: 'text-[#d29922] border-[#9e6a03]',
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

  return <span className="font-mono text-[#8b949e]">{countdown(nextRunAt)}</span>
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
        className="border-b border-[#21262d] hover:bg-[#161b22] cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            <span className="text-[#6e7681] w-4">
              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </span>
            <span className="text-[#e6edf3] font-medium">{job.name}</span>
          </div>
        </td>
        <td className="py-3 px-4">
          <span className="font-mono text-xs text-[#8b949e]">{job.schedule}</span>
          {showHint && (
            <span className="ml-2 text-xs text-[#6e7681]">({scheduleLabel})</span>
          )}
        </td>
        <td className="py-3 px-4">
          {job.agentId ? (
            <AgentChip emoji="🤖" name={agentName(job.agentId)} />
          ) : (
            <span className="text-[#6e7681]">—</span>
          )}
        </td>
        <td className="py-3 px-4 font-mono text-xs text-[#8b949e]">
          {job.lastRunAt ? relativeTime(job.lastRunAt) : '—'}
        </td>
        <td className="py-3 px-4 font-mono text-sm text-[#8b949e]">
          {formatDuration(job.lastDurationMs)}
        </td>
        <td className="py-3 px-4">
          <StatusBadge status={job.status} />
        </td>
        <td className="py-3 px-4">
          {job.consecutiveErrors > 0 ? (
            <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-mono border border-[#6e0000] text-[#f85149]">
              {job.consecutiveErrors} err{job.consecutiveErrors !== 1 ? 's' : ''}
            </span>
          ) : (
            <span className="text-[#6e7681]">—</span>
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
              className="flex items-center gap-1.5 px-2 py-1 text-xs border border-[#30363d] bg-[#21262d] text-[#e6edf3] hover:bg-[#30363d] transition-colors disabled:opacity-50"
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
              className="flex items-center justify-center w-7 h-7 border border-[#30363d] bg-[#21262d] text-[#6e7681] hover:text-[#f85149] hover:border-[#6e0000] transition-colors disabled:opacity-50"
              title="Delete cron job"
            >
              {deleting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Trash2 className="w-3 h-3" />
              )}
            </button>
            {deleteCron.isError && (
              <span className="text-xs text-[#f85149] font-mono">
                {String(deleteCron.error)}
              </span>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-[#21262d] bg-[#0d1117]">
          <td colSpan={9} className="px-12 py-3">
            {runs.length === 0 ? (
              <p className="text-sm text-[#6e7681] py-2">No recent runs recorded.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-medium uppercase tracking-wider text-[#6e7681]">
                    <th className="text-left pb-1">Run At</th>
                    <th className="text-left pb-1">Duration</th>
                    <th className="text-left pb-1">Status</th>
                    <th className="text-left pb-1">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r, i) => (
                    <tr key={i} className="border-t border-[#21262d]">
                      <td className="py-1.5 font-mono text-xs text-[#8b949e] pr-6">{new Date(r.runAt).toLocaleString()}</td>
                      <td className="py-1.5 font-mono text-xs text-[#8b949e] pr-6">{formatDuration(r.durationMs)}</td>
                      <td className="py-1.5 pr-6">
                        <RunStatusBadge status={r.status} />
                      </td>
                      <td className="py-1.5 text-[#f85149] text-xs font-mono">{r.errorMessage ?? ''}</td>
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
    <div className="border border-[#30363d] bg-[#161b22] p-5 mb-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-mono text-xs font-semibold text-[#e6edf3] uppercase tracking-wide">New Cron Job</h2>
        <button
          onClick={onClose}
          className="text-[#6e7681] hover:text-[#e6edf3] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-mono text-[#8b949e] uppercase tracking-wide">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="sync-reports"
            required
            className="bg-[#0d1117] border border-[#30363d] text-[#e6edf3] text-sm px-3 py-2 font-mono focus:outline-none focus:border-[#58a6ff] placeholder-[#484f58]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-mono text-[#8b949e] uppercase tracking-wide">
            Schedule
            {showHint && (
              <span className="ml-2 normal-case text-[#3fb950]">— {scheduleHint}</span>
            )}
          </label>
          <input
            type="text"
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            placeholder="0 * * * *"
            required
            className="bg-[#0d1117] border border-[#30363d] text-[#e6edf3] text-sm px-3 py-2 font-mono focus:outline-none focus:border-[#58a6ff] placeholder-[#484f58]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-mono text-[#8b949e] uppercase tracking-wide">Agent</label>
          {agents && agents.length > 0 ? (
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              required
              className="bg-[#0d1117] border border-[#30363d] text-[#e6edf3] text-sm px-3 py-2 font-mono focus:outline-none focus:border-[#58a6ff]"
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
              className="bg-[#0d1117] border border-[#30363d] text-[#e6edf3] text-sm px-3 py-2 font-mono focus:outline-none focus:border-[#58a6ff] placeholder-[#484f58]"
            />
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-mono text-[#8b949e] uppercase tracking-wide">Command / Payload</label>
          <textarea
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="run-sync --all"
            required
            rows={1}
            className="bg-[#0d1117] border border-[#30363d] text-[#e6edf3] text-sm px-3 py-2 font-mono focus:outline-none focus:border-[#58a6ff] placeholder-[#484f58] resize-none"
          />
        </div>

        <div className="col-span-2 flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={createCron.isPending}
            className="flex items-center gap-2 px-4 py-1.5 text-xs font-mono border border-[#238636] bg-[#238636]/20 text-[#3fb950] hover:bg-[#238636]/40 transition-colors disabled:opacity-50"
          >
            {createCron.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            Create
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-mono border border-[#30363d] bg-transparent text-[#8b949e] hover:text-[#e6edf3] transition-colors"
          >
            Cancel
          </button>
          {createCron.isError && (
            <span className="text-xs text-[#f85149] font-mono">
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
      <div className="flex items-center justify-between pb-4 mb-5 border-b border-[#21262d]">
        <h1 className="font-mono text-[13px] font-semibold text-[#e6edf3] tracking-wide uppercase flex items-center gap-2">
          <span className="text-[#58a6ff]">~/</span>cron
        </h1>
        <div className="flex items-center gap-4">
          <p className="text-xs font-mono text-[#6e7681]">Last refreshed {lastRefresh}</p>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-[#30363d] bg-[#21262d] text-[#e6edf3] hover:bg-[#30363d] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Job
          </button>
        </div>
      </div>

      {showCreate && <CreateCronForm onClose={() => setShowCreate(false)} />}

      {isLoading && (
        <div className="text-center py-16 text-[#6e7681]">Loading cron jobs…</div>
      )}

      {!isLoading && (
        <div className="border border-[#30363d] bg-[#161b22] overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-medium uppercase tracking-wider text-[#8b949e] border-b border-[#30363d] bg-[#161b22]">
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
                  <td colSpan={9} className="py-12 text-center text-[#6e7681]">No cron jobs configured</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
