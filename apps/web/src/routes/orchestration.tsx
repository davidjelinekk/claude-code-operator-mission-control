import { createFileRoute } from '@tanstack/react-router'
import { Loader2, Server } from 'lucide-react'
import { useOrchestrationStatus, useOrchestrationSessions } from '@/hooks/api/orchestration'

export const Route = createFileRoute('/orchestration')({
  component: OrchestrationPage,
})

function OrchestrationPage() {
  const { data: status, isLoading: statusLoading, dataUpdatedAt } = useOrchestrationStatus()
  const { data: sessions, isLoading: sessionsLoading } = useOrchestrationSessions()

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
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">available</span>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${status?.available ? 'bg-[#3fb950]' : 'bg-[#f85149]'}`} />
                  <span className={`font-mono text-xs ${status?.available ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                    {status?.available ? 'yes' : 'no'}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">api key</span>
                <span className={`font-mono text-xs ${status?.apiKeyConfigured ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                  {status?.apiKeyConfigured ? 'configured' : 'not set'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">model</span>
                <span className="font-mono text-xs text-[#8b949e]">
                  {status?.model ?? '—'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Sessions card */}
        <div className="border border-[#30363d] bg-[#161b22] p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">Recent Sessions</span>
            <span className="font-mono text-[10px] text-[#58a6ff] border border-[#1f6feb]/30 bg-[#1f6feb]/10 px-1.5 py-0.5">
              {(sessions ?? []).length}
            </span>
          </div>
          {sessionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-[#58a6ff]" />
            </div>
          ) : (
            <div className="border-t border-[#21262d] pt-3">
              {(sessions ?? []).length === 0 ? (
                <span className="font-mono text-xs text-[#6e7681]">no recent sessions</span>
              ) : (
                <div className="flex flex-col gap-0">
                  <div className="grid grid-cols-3 gap-3 pb-1.5 mb-1 border-b border-[#21262d]">
                    {['project', 'session', 'modified'].map((h) => (
                      <span key={h} className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">{h}</span>
                    ))}
                  </div>
                  {(sessions ?? []).map((s: { sessionId: string; projectName: string; modifiedAt: string; sizeBytes: number }, i: number) => (
                    <div
                      key={s.sessionId}
                      className={`grid grid-cols-3 gap-3 py-2 ${i < (sessions ?? []).length - 1 ? 'border-b border-[#21262d]' : ''}`}
                    >
                      <span className="font-mono text-xs text-[#c9d1d9] truncate" title={s.projectName}>
                        {s.projectName.split('/').pop() ?? s.projectName}
                      </span>
                      <span className="font-mono text-xs text-[#8b949e] truncate" title={s.sessionId}>
                        {s.sessionId.slice(0, 8)}...
                      </span>
                      <span className="font-mono text-xs text-[#6e7681]">
                        {new Date(s.modifiedAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
