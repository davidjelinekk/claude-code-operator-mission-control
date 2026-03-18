import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Plus, X, ChevronDown, ChevronRight } from 'lucide-react'
import { useBoardGroups, useCreateBoardGroup, useDeleteBoardGroup, type BoardGroup } from '@/hooks/api/board-groups'

export const Route = createFileRoute('/board-groups')({
  component: BoardGroupsPage,
})

function CreateGroupDialog({ onDone }: { onDone: () => void }) {
  const createGroup = useCreateBoardGroup()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await createGroup.mutateAsync({ name: name.trim(), description: description.trim() || undefined })
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onDone} />
      <div className="relative bg-[#161b22] border border-[#30363d] w-full max-w-md p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-mono text-[13px] font-semibold text-[#e6edf3] uppercase tracking-wide">New Group</h2>
          <button onClick={onDone} className="text-[#6e7681] hover:text-[#e6edf3] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-[#8b949e] mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="group name"
              className="w-full bg-[#0d1117] border border-[#30363d] px-3 py-2 text-sm font-mono text-[#e6edf3] placeholder-[#6e7681] focus:outline-none focus:border-[#58a6ff]"
            />
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-[#8b949e] mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="optional description"
              className="w-full bg-[#0d1117] border border-[#30363d] px-3 py-2 text-sm font-mono text-[#e6edf3] placeholder-[#6e7681] focus:outline-none focus:border-[#58a6ff] resize-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onDone} className="px-3 py-1.5 font-mono text-xs text-[#8b949e] border border-[#30363d] hover:border-[#6e7681] transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || createGroup.isPending}
              className="px-3 py-1.5 font-mono text-xs text-white bg-[#1f6feb] border border-[#388bfd] hover:bg-[#388bfd] disabled:opacity-50 transition-colors"
            >
              {createGroup.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function GroupCard({ group }: { group: BoardGroup }) {
  const deleteGroup = useDeleteBoardGroup()
  const [expanded, setExpanded] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const boards = group.boards ?? []
  const boardCount = group.boardCount ?? boards.length

  return (
    <div className="border border-[#30363d] bg-[#161b22]">
      <div
        className="flex items-start justify-between p-4 cursor-pointer hover:bg-[#1c2128] transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start gap-2 min-w-0">
          <span className="text-[#6e7681] mt-0.5 flex-shrink-0">
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-semibold text-[#e6edf3]">{group.name}</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 border border-[#30363d] text-[#6e7681]">
                {boardCount} board{boardCount !== 1 ? 's' : ''}
              </span>
            </div>
            <span className="font-mono text-[11px] text-[#6e7681]">{group.slug}</span>
            {group.description && (
              <p className="text-xs text-[#8b949e] mt-1">{group.description}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
          {confirming ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => deleteGroup.mutate(group.id)}
                disabled={deleteGroup.isPending}
                className="text-[10px] font-mono text-[#f85149] border border-[#6e0000] px-1.5 py-0.5 hover:bg-[#6e0000]/20 disabled:opacity-50"
              >
                confirm
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="text-[10px] font-mono text-[#6e7681] hover:text-[#8b949e]"
              >
                cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="p-1 text-[#6e7681] hover:text-[#f85149] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[#21262d] px-4 py-3 bg-[#0d1117]">
          {boards.length === 0 ? (
            <p className="text-xs font-mono text-[#6e7681]">No boards in this group</p>
          ) : (
            <div className="space-y-1.5">
              {boards.map((b) => (
                <a
                  key={b.id}
                  href={`/boards/${b.id}`}
                  className="flex items-center gap-2 text-xs font-mono text-[#58a6ff] hover:text-[#79c0ff] transition-colors"
                >
                  <ChevronRight className="w-3 h-3 text-[#6e7681]" />
                  {b.name}
                  <span className="text-[#6e7681]">{b.slug}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function BoardGroupsPage() {
  const { data: groups, isLoading } = useBoardGroups()
  const [showCreate, setShowCreate] = useState(false)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between border-b border-[#21262d] pb-4 mb-5">
        <h1 className="font-mono text-[13px] font-semibold text-[#e6edf3] tracking-wide uppercase">
          <span className="text-[#58a6ff]">~/</span>board-groups
        </h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] text-[#58a6ff] border border-[#30363d] hover:border-[#58a6ff] transition-colors"
        >
          <Plus className="w-3 h-3" />
          New Group
        </button>
      </div>

      {isLoading && (
        <div className="text-center py-16 font-mono text-[#6e7681]">loading…</div>
      )}

      {!isLoading && (groups ?? []).length === 0 && (
        <div className="text-center py-16 font-mono text-[#6e7681]">No board groups yet</div>
      )}

      {!isLoading && (groups ?? []).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(groups ?? []).map((group) => (
            <GroupCard key={group.id} group={group} />
          ))}
        </div>
      )}

      {showCreate && <CreateGroupDialog onDone={() => setShowCreate(false)} />}
    </div>
  )
}
