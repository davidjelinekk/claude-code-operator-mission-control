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
  type Provider,
} from '@/hooks/api/orchestration'
import { useScripts } from '@/hooks/api/scripts'
import { ContextUsageBar } from '@/components/organisms/ContextUsageBar'
import { SubagentViewer } from '@/components/organisms/SubagentViewer'

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
      <div className="flex items-center justify-between pb-4 border-b border-border-subtle">
        <h1 className="font-mono text-[13px] font-semibold text-text-primary tracking-wide uppercase flex items-center gap-2">
          <span className="text-accent">~/</span>orchestration
        </h1>
        {dataUpdatedAt > 0 && (
          <span className="font-mono text-[10px] text-text-tertiary">
            checked {new Date(dataUpdatedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Agent SDK Status card */}
        <div className="border border-border bg-surface p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Server className="h-3.5 w-3.5 text-text-tertiary" />
            <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest">Agent SDK</span>
          </div>

          {statusLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-accent" />
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 border-t border-border-subtle pt-3">
              <StatusRow label="available" value={status?.available ? 'yes' : 'no'} ok={status?.available} />
              <StatusRow label="cli installed" value={status?.cliInstalled ? 'yes' : 'no'} ok={status?.cliInstalled} />
              <StatusRow label="api key" value={status?.apiKeyConfigured ? 'configured' : 'not set'} ok={status?.apiKeyConfigured} />
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest">model</span>
                <span className="font-mono text-xs text-text-secondary">{status?.model ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest">active sessions</span>
                <span className="font-mono text-xs text-accent">{status?.activeSessions ?? 0}</span>
              </div>
              {status?.providers && status.providers.length > 0 && (
                <div className="border-t border-border-subtle pt-2 mt-1">
                  <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest">providers</span>
                  <div className="flex flex-col gap-1 mt-1.5">
                    {status.providers.map((p) => (
                      <div key={p.provider} className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-text-secondary">{p.provider}</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${p.available ? 'bg-success' : 'bg-text-tertiary'}`} />
                          <span className={`font-mono text-[10px] ${p.available ? 'text-success' : 'text-text-tertiary'}`}>
                            {p.available ? p.defaultModel ?? 'ready' : 'unavailable'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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

      {/* Subagent breakdown for the viewed session */}
      {viewingSessionId && <SubagentViewer sessionId={viewingSessionId} />}

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
      <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${ok ? 'bg-success' : 'bg-error'}`} />
        <span className={`font-mono text-xs ${ok ? 'text-success' : 'text-error'}`}>{value}</span>
      </div>
    </div>
  )
}

function SpawnForm({ disabled }: { disabled: boolean }) {
  const spawn = useSpawnSession()
  const [provider, setProvider] = useState<Provider>('claude')
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
      provider,
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
    <form onSubmit={handleSubmit} className="border border-border bg-surface p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Play className="h-3.5 w-3.5 text-text-tertiary" />
        <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest">Spawn Session</span>
      </div>

      <div className="border-t border-border-subtle pt-3 flex flex-col gap-2.5">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter prompt..."
          rows={3}
          className="w-full bg-canvas border border-border text-text-primary font-mono text-xs p-2 resize-none focus:border-accent focus:outline-none"
          disabled={disabled}
        />

        <div className="grid grid-cols-2 gap-2">
          <select
            value={provider}
            onChange={(e) => { setProvider(e.target.value as Provider); setModel('') }}
            className="bg-canvas border border-border text-text-secondary font-mono text-[11px] px-2 py-1.5 focus:border-accent focus:outline-none"
            disabled={disabled}
          >
            <option value="claude">Claude Code</option>
            <option value="codex">OpenAI Codex</option>
            <option value="gemini">Google Gemini</option>
          </select>

          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="bg-canvas border border-border text-text-secondary font-mono text-[11px] px-2 py-1.5 focus:border-accent focus:outline-none"
            disabled={disabled}
          >
            {provider === 'claude' && (
              <>
                <option value="">default model</option>
                <option value="claude-sonnet-4-6">sonnet 4.6</option>
                <option value="claude-opus-4-6">opus 4.6</option>
                <option value="claude-haiku-4-5">haiku 4.5</option>
              </>
            )}
            {provider === 'codex' && (
              <>
                <option value="">default model</option>
                <option value="o4-mini">o4-mini</option>
                <option value="gpt-4.1">gpt-4.1</option>
                <option value="o3">o3</option>
              </>
            )}
            {provider === 'gemini' && (
              <>
                <option value="">default model</option>
                <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                <option value="gemini-2.5-flash">gemini-2.5-flash</option>
              </>
            )}
          </select>

          <select
            value={permissionMode}
            onChange={(e) => setPermissionMode(e.target.value)}
            className="bg-canvas border border-border text-text-secondary font-mono text-[11px] px-2 py-1.5 focus:border-accent focus:outline-none"
            disabled={disabled}
          >
            <option value="plan">plan</option>
            <option value="default">default</option>
            <option value="acceptEdits">acceptEdits</option>
            <option value="auto">auto</option>
            <option value="bypassPermissions">bypassPermissions</option>
            <option value="dontAsk">dontAsk</option>
          </select>

          <select
            value={effort}
            onChange={(e) => setEffort(e.target.value)}
            className="bg-canvas border border-border text-text-secondary font-mono text-[11px] px-2 py-1.5 focus:border-accent focus:outline-none"
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
            className="bg-canvas border border-border text-text-secondary font-mono text-[11px] px-2 py-1.5 focus:border-accent focus:outline-none"
            disabled={disabled}
          />

          <input
            type="number"
            value={maxTurns}
            onChange={(e) => setMaxTurns(e.target.value)}
            placeholder="max turns"
            min={1}
            className="bg-canvas border border-border text-text-secondary font-mono text-[11px] px-2 py-1.5 focus:border-accent focus:outline-none"
            disabled={disabled}
          />

          <input
            type="number"
            value={maxBudgetUsd}
            onChange={(e) => setMaxBudgetUsd(e.target.value)}
            placeholder="max budget ($)"
            min={0}
            step={0.01}
            className="bg-canvas border border-border text-text-secondary font-mono text-[11px] px-2 py-1.5 focus:border-accent focus:outline-none"
            disabled={disabled}
          />
        </div>

        {/* Advanced options toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="font-mono text-[10px] text-accent hover:text-accent-hover text-left transition-colors"
        >
          {showAdvanced ? '- hide advanced' : '+ show advanced'}
        </button>

        {showAdvanced && (
          <div className="flex flex-col gap-2 border-t border-border-subtle pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={agentProgressSummaries}
                onChange={(e) => setAgentProgressSummaries(e.target.checked)}
                disabled={disabled}
                className="accent-accent"
              />
              <span className="font-mono text-[10px] text-text-secondary">Agent progress summaries</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={persistSession}
                onChange={(e) => setPersistSession(e.target.checked)}
                disabled={disabled}
                className="accent-accent"
              />
              <span className="font-mono text-[10px] text-text-secondary">Persist session to disk</span>
            </label>

            {/* CLI Scripts selector */}
            {availableScripts && availableScripts.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest">CLI Scripts</span>
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
                          ? 'text-accent border-accent bg-accent/10'
                          : 'text-text-secondary border-border hover:border-text-tertiary'
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
          className="flex items-center justify-center gap-1.5 bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-mono text-[11px] py-1.5 px-3 transition-colors"
        >
          {spawn.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          spawn
        </button>

        {spawn.isError && (
          <span className="font-mono text-[10px] text-error">{String(spawn.error)}</span>
        )}
        {spawn.isSuccess && spawn.data && (
          <span className="font-mono text-[10px] text-success">
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
    <div className="border border-border bg-surface p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className="h-3.5 w-3.5 text-text-tertiary" />
          <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest">Active Sessions</span>
        </div>
        <span className="font-mono text-[10px] text-accent border border-accent/30 bg-accent/10 px-1.5 py-0.5">
          {sessions.length}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="border-t border-border-subtle pt-3">
          <span className="font-mono text-xs text-text-tertiary">no active sessions</span>
        </div>
      ) : (
        <div className="border-t border-border-subtle pt-3 flex flex-col gap-0">
          <div className="grid grid-cols-[1fr_60px_80px_80px_60px_80px_60px] gap-3 pb-1.5 mb-1 border-b border-border-subtle">
            {['session', 'provider', 'status', 'context', 'msgs', 'started', ''].map((h) => (
              <span key={h} className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest">{h}</span>
            ))}
          </div>
          {sessions.map((s, i) => (
            <div
              key={s.sessionId}
              className={`grid grid-cols-[1fr_60px_80px_80px_60px_80px_60px] gap-3 py-2 items-center ${i < sessions.length - 1 ? 'border-b border-border-subtle' : ''}`}
            >
              <span className="font-mono text-xs text-text-primary truncate" title={s.sessionId}>
                {s.sessionId.slice(0, 12)}...
              </span>
              <span className="font-mono text-[10px] text-text-secondary">{s.provider ?? 'claude'}</span>
              <SessionStatusBadge status={s.status} />
              <span className="font-mono text-[10px] text-text-secondary truncate">
                {s.meta.callerContext ?? '—'}
              </span>
              <span className="font-mono text-xs text-text-secondary">{s.messageCount}</span>
              <span className="font-mono text-[10px] text-text-tertiary">
                {new Date(s.createdAt).toLocaleTimeString()}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => onView(s.sessionId)}
                  className="text-accent hover:text-accent-hover transition-colors"
                  title="View stream"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
                {s.status === 'running' && (
                  <button
                    onClick={() => abort.mutate(s.sessionId)}
                    className="text-error hover:text-error transition-colors"
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
    <div className="border border-border bg-surface p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-text-tertiary" />
          <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest">Historical Sessions</span>
        </div>
        <span className="font-mono text-[10px] text-accent border border-accent/30 bg-accent/10 px-1.5 py-0.5">
          {sessions.length}
        </span>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
        </div>
      ) : (
        <div className="border-t border-border-subtle pt-3">
          {sessions.length === 0 ? (
            <span className="font-mono text-xs text-text-tertiary">no recent sessions</span>
          ) : (
            <div className="flex flex-col gap-0">
              <div className="grid grid-cols-[1fr_1fr_100px_100px] gap-3 pb-1.5 mb-1 border-b border-border-subtle">
                {['session', 'summary', 'branch', 'modified'].map((h) => (
                  <span key={h} className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest">{h}</span>
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
                    className={`grid grid-cols-[1fr_1fr_100px_100px] gap-3 py-2 ${i < sessions.length - 1 ? 'border-b border-border-subtle' : ''}`}
                  >
                    <span className="font-mono text-xs text-text-primary truncate" title={s.sessionId}>
                      {s.sessionId.slice(0, 12)}...
                    </span>
                    <span className="font-mono text-xs text-text-secondary truncate" title={s.summary ?? s.firstPrompt ?? s.projectName}>
                      {s.customTitle ?? s.summary ?? s.firstPrompt ?? s.projectName?.split('/').pop() ?? '—'}
                    </span>
                    <span className="font-mono text-[10px] text-text-tertiary truncate">
                      {s.gitBranch ?? '—'}
                    </span>
                    <span className="font-mono text-[10px] text-text-tertiary">
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
    running: 'text-warning border-warning/30 bg-warning/10',
    completed: 'text-success border-success/30 bg-success/10',
    error: 'text-error border-error/30 bg-error/10',
    aborted: 'text-text-secondary border-text-secondary/30 bg-text-secondary/10',
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
    <div className="border border-border bg-surface p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest">
            Stream: {sessionId.slice(0, 12)}...
          </span>
          {connected && (
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" title="connected" />
          )}
          {done && (
            <span className="font-mono text-[10px] text-success">done</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {resultEvent?.total_cost_usd != null && (
            <span className="font-mono text-[10px] text-text-secondary flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              {resultEvent.total_cost_usd.toFixed(4)}
            </span>
          )}
          {resultEvent?.num_turns != null && (
            <span className="font-mono text-[10px] text-text-secondary">
              {resultEvent.num_turns} turns
            </span>
          )}
          {resultEvent?.terminal_reason && (
            <span className="font-mono text-[10px] text-text-tertiary">
              {resultEvent.terminal_reason}
            </span>
          )}
          <button
            onClick={onClose}
            className="font-mono text-[10px] text-text-secondary hover:text-text-primary border border-border px-2 py-0.5 transition-colors"
          >
            close
          </button>
        </div>
      </div>

      {/* Live context usage (only while running, Claude-only) */}
      {!done && <ContextUsageBar sessionId={sessionId} enabled={!done} />}

      <div ref={scrollRef} className="border-t border-border-subtle pt-3 max-h-96 overflow-y-auto">
        {events.length === 0 ? (
          <div className="flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin text-accent" />
            <span className="font-mono text-xs text-text-tertiary">waiting for events...</span>
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
    user: 'text-accent-hover',
    result: 'text-success',
    done: 'text-success',
    system: 'text-text-tertiary',
    stream_event: 'text-text-secondary',
  }

  return (
    <div className="font-mono text-[11px] flex gap-2">
      <span className="text-text-tertiary w-6 text-right shrink-0 select-none">{index + 1}</span>
      <span className={typeColors[event.type] ?? 'text-text-primary'}>
        {event.type}
        {event.subtype && <span className="text-text-tertiary">:{event.subtype}</span>}
      </span>
      {event.content && (
        <span className="text-text-secondary truncate flex-1" title={event.content}>
          {event.content.length > 120 ? event.content.slice(0, 120) + '...' : event.content}
        </span>
      )}
      {event.is_error && <span className="text-error">error</span>}
      {event.status && <span className="text-warning">{event.status}</span>}
    </div>
  )
}
