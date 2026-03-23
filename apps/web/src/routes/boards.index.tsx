import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Plus, Clock } from 'lucide-react'
import { useBoards, useCreateBoard } from '@/hooks/api/boards'
import { useAgents } from '@/hooks/api/agents'
import { cn, relativeTime } from '@/lib/utils'

export const Route = createFileRoute('/boards/')({
  component: BoardsPage,
})

function CreateBoardDialog({ onClose }: { onClose: () => void }) {
  const { data: agents } = useAgents()
  const createBoard = useCreateBoard()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [gatewayAgentId, setGatewayAgentId] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const board = await createBoard.mutateAsync({
      name: name.trim(),
      description: description.trim() || undefined,
      gatewayAgentId: gatewayAgentId || undefined,
    })
    onClose()
    navigate({ to: '/boards/$boardId', params: { boardId: board.id } })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-surface border border-border shadow-2xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">New Board</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-1">Name *</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My board"
              className="w-full bg-canvas border border-border px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={2}
              className="w-full bg-canvas border border-border px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent resize-none"
            />
          </div>
          {agents && agents.length > 0 && (
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-text-secondary mb-1">Gateway Agent</label>
              <select
                value={gatewayAgentId}
                onChange={(e) => setGatewayAgentId(e.target.value)}
                className="w-full bg-canvas border border-border px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
              >
                <option value="">None</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || createBoard.isPending}
              className="px-3 py-1.5 text-sm font-medium bg-accent border border-accent text-white hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {createBoard.isPending ? 'Creating…' : 'Create Board'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function BoardsPage() {
  const { data: boards, isLoading, isError } = useBoards()
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')

  const filteredBoards = boards
    ? boards.filter((b) => {
        const q = search.toLowerCase()
        return b.name.toLowerCase().includes(q) || (b.description ?? '').toLowerCase().includes(q)
      })
    : boards

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-4 mb-5 border-b border-border-subtle">
        <h1 className="font-mono text-[13px] font-semibold text-text-primary tracking-wide uppercase flex items-center gap-2">
          <span className="text-accent">~/</span>boards
        </h1>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search boards…"
            className="bg-canvas border border-border px-3 py-1.5 font-mono text-[12px] text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent transition-colors w-48"
          />
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-accent hover:bg-accent-hover border border-accent-hover text-white font-mono text-[12px] transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Board
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-surface border border-border p-5 animate-pulse h-40" />
          ))}
        </div>
      )}

      {isError && (
        <div className="text-center py-16 text-text-secondary">
          Failed to load boards.
        </div>
      )}

      {filteredBoards && filteredBoards.length === 0 && (
        <div className="py-20 flex flex-col items-center gap-2 text-text-tertiary">
          <span className="font-mono text-[32px] opacity-20">[]</span>
          <span className="font-mono text-[12px]">{search ? 'no boards match' : 'no entries found'}</span>
          {!search && <span className="font-mono text-[11px] text-border">— use the button above to create one —</span>}
        </div>
      )}

      {filteredBoards && filteredBoards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredBoards.map((board) => (
            <div
              key={board.id}
              onClick={() => navigate({ to: '/boards/$boardId', params: { boardId: board.id } })}
              className="bg-surface border border-border p-5 cursor-pointer hover:border-accent transition-colors group"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-mono text-[13px] text-text-primary group-hover:text-accent transition-colors leading-snug flex items-center gap-2 flex-wrap">
                  {board.name}
                  {board.requireApprovalForDone && (
                    <span className="font-mono text-[10px] text-warning bg-warning-subtle border border-warning/60 px-1.5 py-0.5 flex-shrink-0">
                      ⚡ governed
                    </span>
                  )}
                </h3>
                <span className="flex-shrink-0 font-mono text-[10px] text-text-tertiary bg-canvas border border-border-subtle px-1.5 py-0.5">
                  {board.slug ?? board.id.slice(0, 8)}
                </span>
              </div>

              {board.description && (
                <p className="font-sans text-[12px] text-text-secondary line-clamp-2 mb-3">{board.description}</p>
              )}

              <div className="flex items-center gap-3 mt-auto">
                {board.taskCount != null && (
                  <span className="font-mono text-[10px] text-text-tertiary bg-canvas border border-border-subtle px-1.5 py-0.5">
                    {board.taskCount} task{board.taskCount !== 1 ? 's' : ''}
                  </span>
                )}
                {board.lastActivity && (
                  <span className={cn('text-xs text-text-tertiary flex items-center gap-1 ml-auto font-mono')}>
                    <Clock className="h-3 w-3" />
                    {relativeTime(board.lastActivity)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateBoardDialog onClose={() => setShowCreate(false)} />}
    </div>
  )
}
