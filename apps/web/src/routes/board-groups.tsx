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
      <div className="relative bg-surface border border-border w-full max-w-md p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-mono text-[13px] font-semibold text-text-primary uppercase tracking-wide">New Group</h2>
          <button onClick={onDone} className="text-text-tertiary hover:text-text-primary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-text-secondary mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="group name"
              className="w-full bg-canvas border border-border px-3 py-2 text-sm font-mono text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-text-secondary mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="optional description"
              className="w-full bg-canvas border border-border px-3 py-2 text-sm font-mono text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent resize-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onDone} className="px-3 py-1.5 font-mono text-xs text-text-secondary border border-border hover:border-text-tertiary transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || createGroup.isPending}
              className="px-3 py-1.5 font-mono text-xs text-white bg-accent border border-accent hover:bg-accent-hover disabled:opacity-50 transition-colors"
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
    <div className="border border-border bg-surface">
      <div
        className="flex items-start justify-between p-4 cursor-pointer hover:bg-surface transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start gap-2 min-w-0">
          <span className="text-text-tertiary mt-0.5 flex-shrink-0">
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-semibold text-text-primary">{group.name}</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 border border-border text-text-tertiary">
                {boardCount} board{boardCount !== 1 ? 's' : ''}
              </span>
            </div>
            <span className="font-mono text-[11px] text-text-tertiary">{group.slug}</span>
            {group.description && (
              <p className="text-xs text-text-secondary mt-1">{group.description}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
          {confirming ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => deleteGroup.mutate(group.id)}
                disabled={deleteGroup.isPending}
                className="text-[10px] font-mono text-error border border-error px-1.5 py-0.5 hover:bg-error/20 disabled:opacity-50"
              >
                confirm
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="text-[10px] font-mono text-text-tertiary hover:text-text-secondary"
              >
                cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="p-1 text-text-tertiary hover:text-error transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border-subtle px-4 py-3 bg-canvas">
          {boards.length === 0 ? (
            <p className="text-xs font-mono text-text-tertiary">No boards in this group</p>
          ) : (
            <div className="space-y-1.5">
              {boards.map((b) => (
                <a
                  key={b.id}
                  href={`/boards/${b.id}`}
                  className="flex items-center gap-2 text-xs font-mono text-accent hover:text-accent-hover transition-colors"
                >
                  <ChevronRight className="w-3 h-3 text-text-tertiary" />
                  {b.name}
                  <span className="text-text-tertiary">{b.slug}</span>
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
      <div className="flex items-center justify-between border-b border-border-subtle pb-4 mb-5">
        <h1 className="font-mono text-[13px] font-semibold text-text-primary tracking-wide uppercase">
          <span className="text-accent">~/</span>board-groups
        </h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] text-accent border border-border hover:border-accent transition-colors"
        >
          <Plus className="w-3 h-3" />
          New Group
        </button>
      </div>

      {isLoading && (
        <div className="text-center py-16 font-mono text-text-tertiary">loading…</div>
      )}

      {!isLoading && (groups ?? []).length === 0 && (
        <div className="text-center py-16 font-mono text-text-tertiary">No board groups yet</div>
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
