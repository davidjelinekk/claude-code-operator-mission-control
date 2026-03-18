import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { CheckSquare, XSquare, Clock } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAllPendingApprovals, useUpdateApproval, type Approval } from '@/hooks/api/approvals'

export const Route = createFileRoute('/approvals')({
  component: ApprovalsPage,
})

function relativeHours(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (h > 0) return `${h}h ${m}m ago`
  return `${m}m ago`
}

type Tab = 'pending' | 'resolved'

function ApprovalsPage() {
  const [tab, setTab] = useState<Tab>('pending')
  const { data: pendingApprovals = [], isLoading: loadingPending } = useAllPendingApprovals()
  const { data: approvedApprovals = [], isLoading: loadingResolved } = useQuery<Approval[]>({
    queryKey: ['approvals', 'all-resolved'],
    queryFn: async () => {
      const [approved, rejected] = await Promise.all([
        api.get('api/approvals?status=approved&limit=50').json<Approval[]>(),
        api.get('api/approvals?status=rejected&limit=50').json<Approval[]>(),
      ])
      return [...approved, ...rejected].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },
    refetchInterval: 30_000,
  })
  const resolvedApprovals = approvedApprovals

  const isLoading = loadingPending || loadingResolved
  const pending = pendingApprovals
  const displayed = tab === 'pending' ? pending : resolvedApprovals

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between pb-4 border-b border-[#21262d]">
        <h1 className="font-mono text-[13px] font-semibold text-[#e6edf3] tracking-wide uppercase flex items-center gap-2">
          <span className="text-[#58a6ff]">~/</span>approvals
          {pending.length > 0 && (
            <span className="font-mono text-[10px] bg-[#f85149]/20 text-[#f85149] border border-[#f85149]/40 px-1.5 py-0.5 animate-pulse">
              {pending.length} pending
            </span>
          )}
        </h1>
        <div className="flex gap-1">
          {(['pending', 'resolved'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-2.5 py-1 font-mono text-[11px] uppercase transition-colors border ${
                tab === t
                  ? 'text-[#58a6ff] border-[#58a6ff] bg-[#1f6feb22]'
                  : 'text-[#6e7681] border-[#30363d] hover:text-[#8b949e]'
              }`}
            >
              {t} {t === 'pending' ? `(${pending.length})` : ''}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 bg-[#21262d] animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && displayed.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-20 text-[#6e7681]">
          <CheckSquare className="h-10 w-10 opacity-20" />
          <span className="font-mono text-sm">no {tab} approvals</span>
        </div>
      )}

      {!isLoading && displayed.length > 0 && (
        <div className="flex flex-col gap-2">
          {displayed.map((approval) => (
            <ApprovalRow key={approval.id} approval={approval} />
          ))}
        </div>
      )}
    </div>
  )
}

function ApprovalRow({ approval }: { approval: Approval }) {
  const update = useUpdateApproval(approval.boardId)
  const hoursDiff = (Date.now() - new Date(approval.createdAt).getTime()) / 3600000

  return (
    <div className="border border-[#30363d] bg-[#161b22] p-4 flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="font-mono text-[10px] text-[#d29922] border border-[#d29922]/30 px-1.5 py-0.5">
            {approval.actionType}
          </span>
          <span className="font-mono text-[10px] text-[#6e7681]">{approval.agentId}</span>
          {approval.status === 'pending' && (
            <span className={`inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 border ${
              hoursDiff > 2
                ? 'text-[#f85149] border-[#f85149]/30 bg-[#f85149]/10'
                : 'text-[#6e7681] border-[#30363d]'
            }`}>
              <Clock className="h-3 w-3" />
              {relativeHours(approval.createdAt)}
            </span>
          )}
          {approval.status !== 'pending' && (
            <span className={`font-mono text-[10px] px-1.5 py-0.5 border ${
              approval.status === 'approved'
                ? 'text-[#3fb950] border-[#238636]/30'
                : 'text-[#f85149] border-[#da3633]/30'
            }`}>
              {approval.status}
            </span>
          )}
        </div>
        <p className="text-sm text-[#c9d1d9] truncate">
          {approval.taskId ? `task:${approval.taskId.slice(0, 8)}` : 'No task linked'}
        </p>
        <div className="flex gap-3 mt-1">
          <Link
            to="/boards/$boardId"
            params={{ boardId: approval.boardId }}
            className="font-mono text-[11px] text-[#58a6ff] hover:underline"
          >
            board →
          </Link>
        </div>
      </div>

      {approval.status === 'pending' && (
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => update.mutate({ id: approval.id, status: 'approved' })}
            disabled={update.isPending}
            className="flex items-center gap-1 px-3 py-1.5 font-mono text-[11px] text-[#3fb950] border border-[#238636]/50 hover:bg-[#238636]/10 transition-colors disabled:opacity-50"
          >
            <CheckSquare className="h-3.5 w-3.5" />
            approve
          </button>
          <button
            onClick={() => update.mutate({ id: approval.id, status: 'rejected' })}
            disabled={update.isPending}
            className="flex items-center gap-1 px-3 py-1.5 font-mono text-[11px] text-[#f85149] border border-[#da3633]/50 hover:bg-[#da3633]/10 transition-colors disabled:opacity-50"
          >
            <XSquare className="h-3.5 w-3.5" />
            reject
          </button>
        </div>
      )}
    </div>
  )
}
