import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef, useEffect } from 'react'
import { Loader2, Server, Play, Square, Radio, ChevronRight, DollarSign, Clock } from 'lucide-react'
import {
  useOrchestrationStatus,
  useOrchestrationSessions,
  useSpawnSession,
  useAbortSession,
  useSessionStream,
  type ActiveSession,
  type SessionInfo,
  type SpawnParams,
  type StreamEvent,
} from '@/hooks/api/orchestration'
import { useScripts } from '@/hooks/api/scripts'

export const Route = createFileRoute('/orchestration')({
  component: OrchestrationPage,
})

function OrchestrationPage() {
  const { data: status, isLoading: statusLoading, dataUpdatedAt } = useOrchestrationStatus()
  const { data: sessions, isLoading: sessionsLoading } = useOrchestrationSessions()
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-6">
      {/* header */}
      <div className="flex items-center justify-between pb-4 border-b border-[#21262d]">
        <h1 className="font-mono text-[13px] font-semibold text-[#e6edf3] tracking-wide uppercase flex items-center gap-2">
          <span className="text-[#58a6ff]">~/</span>orchestration
        </h1>
        {dataUpdatedAt > 0 && (
          <span className="font-mono text-[10px] text-[#6e7681]">
            checked {new Date(dataUpdatedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Agent SDK Status card */}
        <div className="border border-[#30363d] bg-[#161b22] p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Server className="h-3.5 w-3.5 text-[#6e7681]" />
            <span className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">Agent SDK</span>
          </div>

          {statusLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-[#58a6ff]" />
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 border-t border-[#21262d] pt-3">
              <StatusRow label="available" value={status?.available ? 'yes' : 'no'} ok={status?.available} />
              <StatusRow label="cli installed" value={status?.cliInstalled ? 'yes' : 'no'} ok={status?.cliInstalled} />
              <StatusRow label="api key" value={status?.apiKeyConfigured ? 'configured' : 'not set'} ok={status?.apiKeyConfigured} />
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">model</span>
                <span className="font-mono text-xs text-[#8b949e]">{status?.model ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">active sessions</span>
                <span className="font-mono text-xs text-[#58a6ff]">{status?.activeSessions ?? 0}</span>
              </div>
            </div>
          )}
        </div>

        {/* Spawn Form */}
        <SpawnForm disabled={!status?.available} />
      </div>

      {/* Active Sessions */}
      <ActiveSessionsTable
        sessions={sessions?.active ?? []}
        loading={sessionsLoading}
        onView={setViewingSessionId}
      />

      {/* Session Stream Viewer */}
      {viewingSessionId && (
        <SessionStreamViewer sessionId={viewingSessionId} onClose={() => setViewingSessionId(null)} />
      )}

      {/* Historical Sessions */}
      <HistoricalSessionsTable
        sessions={sessions?.historical ?? []}
        loading={sessionsLoading}
      />
    </div>
  )
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${ok ? 'bg-[#3fb950]' : 'bg-[#f85149]'}`} />
        <span className={`font-mono text-xs ${ok ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>{value}</span>
      </div>
    </div>
  )
}

function SpawnForm({ disabled }: { disabled: boolean }) {
  const spawn = useSpawnSession()
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('')
  const [permissionMode, setPermissionMode] = useState<string>('plan')
  const [maxTurns, setMaxTurns] = useState('')
  const [maxBudgetUsd, setMaxBudgetUsd] = useState('')
  const [effort, setEffort] = useState<string>('high')
  const [agent, setAgent] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [agentProgressSummaries, setAgentProgressSummaries] = useState(false)
  const [persistSession, setPersistSession] = useState(false)
  const [selectedScripts, setSelectedScripts] = useState<string[]>([])
  const { data: availableScripts } = useScripts()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim()) return
    const params: SpawnParams = {
      prompt: prompt.trim(),
      model: model || undefined,
      permissionMode: (permissionMode || undefined) as SpawnParams['permissionMode'],
      maxTurns: maxTurns ? parseInt(maxTurns, 10) : undefined,
      maxBudgetUsd: maxBudgetUsd ? parseFloat(maxBudgetUsd) : undefined,
      effort: (effort || undefined) as SpawnParams['effort'],
      agent: agent || undefined,
      agentProgressSummaries: agentProgressSummaries || undefined,
      persistSession: persistSession || undefined,
      scripts: selectedScripts.length > 0 ? selectedScripts : undefined,
      includePartialMessages: true,
    }
    spawn.mutate(params)
    setPrompt('')
  }

  return (
    <form onSubmit={handleSubmit} className="border border-[#30363d] bg-[#161b22] p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Play className="h-3.5 w-3.5 text-[#6e7681]" />
        <span className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">Spawn Session</span>
      </div>

      <div className="border-t border-[#21262d] pt-3 flex flex-col gap-2.5">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter prompt..."
          rows={3}
          className="w-full bg-[#0d1117] border border-[#30363d] text-[#c9d1d9] font-mono text-xs p-2 resize-none focus:border-[#58a6ff] focus:outline-none"
          disabled={disabled}
        />

        <div className="grid grid-cols-2 gap-2">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="bg-[#0d1117] border border-[#30363d] text-[#8b949e] font-mono text-[11px] px-2 py-1.5 focus:border-[#58a6ff] focus:outline-none"
            disabled={disabled}
          >
            <option value="">default model</option>
            <option value="claude-sonnet-4-6">sonnet 4.6</option>
            <option value="claude-opus-4-6">opus 4.6</option>
            <option value="claude-haiku-4-5">haiku 4.5</option>
          </select>

          <select
            value={permissionMode}
            onChange={(e) => setPermissionMode(e.target.value)}
            className="bg-[#0d1117] border border-[#30363d] text-[#8b949e] font-mono text-[11px] px-2 py-1.5 focus:border-[#58a6ff] focus:outline-none"
            disabled={disabled}
          >
            <option value="plan">plan</option>
            <option value="default">default</option>
            <option value="acceptEdits">acceptEdits</option>
            <option value="dontAsk">dontAsk</option>
          </select>

          <select
            value={effort}
            onChange={(e) => setEffort(e.target.value)}
            className="bg-[#0d1117] border border-[#30363d] text-[#8b949e] font-mono text-[11px] px-2 py-1.5 focus:border-[#58a6ff] focus:outline-none"
            disabled={disabled}
          >
            <option value="low">effort: low</option>
            <option value="medium">effort: medium</option>
            <option value="high">effort: high</option>
            <option value="max">effort: max</option>
          </select>

          <input
            type="text"
            value={agent}
            onChange={(e) => setAgent(e.target.value)}
            placeholder="agent name (optional)"
            className="bg-[#0d1117] border border-[#30363d] text-[#8b949e] font-mono text-[11px] px-2 py-1.5 focus:border-[#58a6ff] focus:outline-none"
            disabled={disabled}
          />

          <input
            type="number"
            value={maxTurns}
            onChange={(e) => setMaxTurns(e.target.value)}
            placeholder="max turns"
            min={1}
            className="bg-[#0d1117] border border-[#30363d] text-[#8b949e] font-mono text-[11px] px-2 py-1.5 focus:border-[#58a6ff] focus:outline-none"
            disabled={disabled}
          />

          <input
            type="number"
            value={maxBudgetUsd}
            onChange={(e) => setMaxBudgetUsd(e.target.value)}
            placeholder="max budget ($)"
            min={0}
            step={0.01}
            className="bg-[#0d1117] border border-[#30363d] text-[#8b949e] font-mono text-[11px] px-2 py-1.5 focus:border-[#58a6ff] focus:outline-none"
            disabled={disabled}
          />
        </div>

        {/* Advanced options toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="font-mono text-[10px] text-[#58a6ff] hover:text-[#79c0ff] text-left transition-colors"
        >
          {showAdvanced ? '- hide advanced' : '+ show advanced'}
        </button>

        {showAdvanced && (
          <div className="flex flex-col gap-2 border-t border-[#21262d] pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={agentProgressSummaries}
                onChange={(e) => setAgentProgressSummaries(e.target.checked)}
                disabled={disabled}
                className="accent-[#58a6ff]"
              />
              <span className="font-mono text-[10px] text-[#8b949e]">Agent progress summaries</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={persistSession}
                onChange={(e) => setPersistSession(e.target.checked)}
                disabled={disabled}
                className="accent-[#58a6ff]"
              />
              <span className="font-mono text-[10px] text-[#8b949e]">Persist session to disk</span>
            </label>

            {/* CLI Scripts selector */}
            {availableScripts && availableScripts.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">CLI Scripts</span>
                <div className="flex flex-wrap gap-1.5">
                  {availableScripts.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedScripts((prev) =>
                        prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id]
                      )}
                      className={`font-mono text-[10px] px-2 py-0.5 border transition-colors ${
                        selectedScripts.includes(s.id)
                          ? 'text-[#58a6ff] border-[#1f6feb] bg-[#1f6feb]/10'
                          : 'text-[#8b949e] border-[#30363d] hover:border-[#6e7681]'
                      }`}
                      disabled={disabled}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={disabled || !prompt.trim() || spawn.isPending}
          className="flex items-center justify-center gap-1.5 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-40 disabled:cursor-not-allowed text-white font-mono text-[11px] py-1.5 px-3 transition-colors"
        >
          {spawn.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          spawn
        </button>

        {spawn.isError && (
          <span className="font-mono text-[10px] text-[#f85149]">{String(spawn.error)}</span>
        )}
        {spawn.isSuccess && spawn.data && (
          <span className="font-mono text-[10px] text-[#3fb950]">
            spawned: {spawn.data.sessionId.slice(0, 12)}...
          </span>
        )}
      </div>
    </form>
  )
}

function ActiveSessionsTable({
  sessions,
  loading,
  onView,
}: {
  sessions: ActiveSession[]
  loading: boolean
  onView: (id: string) => void
}) {
  const abort = useAbortSession()

  return (
    <div className="border border-[#30363d] bg-[#161b22] p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className="h-3.5 w-3.5 text-[#6e7681]" />
          <span className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">Active Sessions</span>
        </div>
        <span className="font-mono text-[10px] text-[#58a6ff] border border-[#1f6feb]/30 bg-[#1f6feb]/10 px-1.5 py-0.5">
          {sessions.length}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-[#58a6ff]" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="border-t border-[#21262d] pt-3">
          <span className="font-mono text-xs text-[#6e7681]">no active sessions</span>
        </div>
      ) : (
        <div className="border-t border-[#21262d] pt-3 flex flex-col gap-0">
          <div className="grid grid-cols-[1fr_80px_80px_60px_80px_60px] gap-3 pb-1.5 mb-1 border-b border-[#21262d]">
            {['session', 'status', 'context', 'msgs', 'started', ''].map((h) => (
              <span key={h} className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">{h}</span>
            ))}
          </div>
          {sessions.map((s, i) => (
            <div
              key={s.sessionId}
              className={`grid grid-cols-[1fr_80px_80px_60px_80px_60px] gap-3 py-2 items-center ${i < sessions.length - 1 ? 'border-b border-[#21262d]' : ''}`}
            >
              <span className="font-mono text-xs text-[#c9d1d9] truncate" title={s.sessionId}>
                {s.sessionId.slice(0, 12)}...
              </span>
              <SessionStatusBadge status={s.status} />
              <span className="font-mono text-[10px] text-[#8b949e] truncate">
                {s.meta.callerContext ?? '—'}
              </span>
              <span className="font-mono text-xs text-[#8b949e]">{s.messageCount}</span>
              <span className="font-mono text-[10px] text-[#6e7681]">
                {new Date(s.createdAt).toLocaleTimeString()}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => onView(s.sessionId)}
                  className="text-[#58a6ff] hover:text-[#79c0ff] transition-colors"
                  title="View stream"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
                {s.status === 'running' && (
                  <button
                    onClick={() => abort.mutate(s.sessionId)}
                    className="text-[#f85149] hover:text-[#ff7b72] transition-colors"
                    title="Abort"
                    disabled={abort.isPending}
                  >
                    <Square className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function HistoricalSessionsTable({
  sessions,
  loading,
}: {
  sessions: SessionInfo[]
  loading: boolean
}) {
  return (
    <div className="border border-[#30363d] bg-[#161b22] p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-[#6e7681]" />
          <span className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">Historical Sessions</span>
        </div>
        <span className="font-mono text-[10px] text-[#58a6ff] border border-[#1f6feb]/30 bg-[#1f6feb]/10 px-1.5 py-0.5">
          {sessions.length}
        </span>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-[#58a6ff]" />
        </div>
      ) : (
        <div className="border-t border-[#21262d] pt-3">
          {sessions.length === 0 ? (
            <span className="font-mono text-xs text-[#6e7681]">no recent sessions</span>
          ) : (
            <div className="flex flex-col gap-0">
              <div className="grid grid-cols-[1fr_1fr_100px_100px] gap-3 pb-1.5 mb-1 border-b border-[#21262d]">
                {['session', 'summary', 'branch', 'modified'].map((h) => (
                  <span key={h} className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">{h}</span>
                ))}
              </div>
              {sessions.map((s, i) => {
                const modified = s.lastModified
                  ? new Date(s.lastModified).toLocaleString()
                  : s.modifiedAt
                    ? new Date(s.modifiedAt).toLocaleString()
                    : '—'

                return (
                  <div
                    key={s.sessionId}
                    className={`grid grid-cols-[1fr_1fr_100px_100px] gap-3 py-2 ${i < sessions.length - 1 ? 'border-b border-[#21262d]' : ''}`}
                  >
                    <span className="font-mono text-xs text-[#c9d1d9] truncate" title={s.sessionId}>
                      {s.sessionId.slice(0, 12)}...
                    </span>
                    <span className="font-mono text-xs text-[#8b949e] truncate" title={s.summary ?? s.firstPrompt ?? s.projectName}>
                      {s.customTitle ?? s.summary ?? s.firstPrompt ?? s.projectName?.split('/').pop() ?? '—'}
                    </span>
                    <span className="font-mono text-[10px] text-[#6e7681] truncate">
                      {s.gitBranch ?? '—'}
                    </span>
                    <span className="font-mono text-[10px] text-[#6e7681]">
                      {modified}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SessionStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: 'text-[#d29922] border-[#d29922]/30 bg-[#d29922]/10',
    completed: 'text-[#3fb950] border-[#3fb950]/30 bg-[#3fb950]/10',
    error: 'text-[#f85149] border-[#f85149]/30 bg-[#f85149]/10',
    aborted: 'text-[#8b949e] border-[#8b949e]/30 bg-[#8b949e]/10',
  }
  return (
    <span className={`font-mono text-[10px] border px-1.5 py-0.5 ${colors[status] ?? colors.error}`}>
      {status}
    </span>
  )
}

function SessionStreamViewer({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const { events, connected, done } = useSessionStream(sessionId)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events.length])

  // Find the result event for cost/turn display
  const resultEvent = events.find((e) => e.type === 'result' || e.type === 'done')

  return (
    <div className="border border-[#30363d] bg-[#161b22] p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">
            Stream: {sessionId.slice(0, 12)}...
          </span>
          {connected && (
            <span className="w-2 h-2 rounded-full bg-[#3fb950] animate-pulse" title="connected" />
          )}
          {done && (
            <span className="font-mono text-[10px] text-[#3fb950]">done</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {resultEvent?.total_cost_usd != null && (
            <span className="font-mono text-[10px] text-[#8b949e] flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              {resultEvent.total_cost_usd.toFixed(4)}
            </span>
          )}
          {resultEvent?.num_turns != null && (
            <span className="font-mono text-[10px] text-[#8b949e]">
              {resultEvent.num_turns} turns
            </span>
          )}
          <button
            onClick={onClose}
            className="font-mono text-[10px] text-[#8b949e] hover:text-[#c9d1d9] border border-[#30363d] px-2 py-0.5 transition-colors"
          >
            close
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="border-t border-[#21262d] pt-3 max-h-96 overflow-y-auto">
        {events.length === 0 ? (
          <div className="flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin text-[#58a6ff]" />
            <span className="font-mono text-xs text-[#6e7681]">waiting for events...</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {events.map((ev, i) => (
              <StreamEventRow key={i} event={ev} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StreamEventRow({ event, index }: { event: StreamEvent; index: number }) {
  const typeColors: Record<string, string> = {
    assistant: 'text-[#d2a8ff]',
    user: 'text-[#79c0ff]',
    result: 'text-[#3fb950]',
    done: 'text-[#3fb950]',
    system: 'text-[#6e7681]',
    stream_event: 'text-[#8b949e]',
  }

  return (
    <div className="font-mono text-[11px] flex gap-2">
      <span className="text-[#6e7681] w-6 text-right shrink-0 select-none">{index + 1}</span>
      <span className={typeColors[event.type] ?? 'text-[#c9d1d9]'}>
        {event.type}
        {event.subtype && <span className="text-[#6e7681]">:{event.subtype}</span>}
      </span>
      {event.content && (
        <span className="text-[#8b949e] truncate flex-1" title={event.content}>
          {event.content.length > 120 ? event.content.slice(0, 120) + '...' : event.content}
        </span>
      )}
      {event.is_error && <span className="text-[#f85149]">error</span>}
      {event.status && <span className="text-[#d29922]">{event.status}</span>}
    </div>
  )
}
