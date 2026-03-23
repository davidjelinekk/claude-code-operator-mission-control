import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Trash2, Plus, Brain, Loader2 } from 'lucide-react'
import { useBoardMemory, useCreateBoardMemory, useDeleteBoardMemory } from '@/hooks/api/board-memory'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/boards/$boardId/memory')({
  component: BoardMemoryPage,
})

function BoardMemoryPage() {
  const { boardId } = Route.useParams()
  const { data: entries = [], isLoading } = useBoardMemory(boardId)
  const createEntry = useCreateBoardMemory(boardId)
  const deleteEntry = useDeleteBoardMemory(boardId)

  const [showForm, setShowForm] = useState(false)
  const [content, setContent] = useState('')
  const [source, setSource] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return
    await createEntry.mutateAsync({ content: content.trim(), source: source.trim() || undefined })
    setContent('')
    setSource('')
    setShowForm(false)
  }

  function handleCancel() {
    setContent('')
    setSource('')
    setShowForm(false)
  }

  return (
    <div className="flex flex-col h-full bg-canvas text-text-primary">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle flex-shrink-0">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-accent" />
          <span className="font-mono text-sm text-text-primary">board memory</span>
          <span className="font-mono text-xs text-text-tertiary ml-1">({entries.length})</span>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white font-mono text-xs transition-colors"
        >
          <Plus className="h-3 w-3" />
          add memory
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="px-6 py-4 border-b border-border-subtle bg-surface flex-shrink-0">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Memory content…"
              rows={4}
              autoFocus
              className="w-full bg-canvas border border-border focus:border-accent px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none resize-none font-mono"
            />
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Source (optional)"
              className="w-full bg-canvas border border-border focus:border-accent px-3 py-1.5 text-sm text-text-primary placeholder-text-tertiary focus:outline-none font-mono"
            />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={createEntry.isPending || !content.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-mono text-xs transition-colors"
              >
                {createEntry.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                save
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="px-3 py-1.5 border border-border hover:border-text-secondary text-text-secondary hover:text-text-primary font-mono text-xs transition-colors"
              >
                cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-text-tertiary font-mono text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            loading…
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-text-tertiary">
            <Brain className="h-8 w-8 opacity-30" />
            <span className="font-mono text-sm">no memory entries yet</span>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="group border border-border-subtle bg-surface p-4 hover:border-border transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <pre className="flex-1 font-mono text-sm text-text-primary whitespace-pre-wrap break-words leading-relaxed">
                    {entry.content}
                  </pre>
                  <button
                    onClick={() => deleteEntry.mutate(entry.id)}
                    disabled={deleteEntry.isPending}
                    className={cn(
                      'flex-shrink-0 p-1 text-text-tertiary hover:text-error transition-colors opacity-0 group-hover:opacity-100',
                      deleteEntry.isPending && 'opacity-50 cursor-not-allowed',
                    )}
                    title="Delete memory entry"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  {entry.source && (
                    <span className="font-mono text-[11px] text-text-tertiary">
                      source: {entry.source}
                    </span>
                  )}
                  {entry.isChat && (
                    <span className="font-mono text-[11px] text-purple-400 border border-purple-600 px-1.5 py-0.5">
                      chat
                    </span>
                  )}
                  {entry.tags && entry.tags.length > 0 && (
                    <div className="flex gap-1.5">
                      {entry.tags.map((tag) => (
                        <span
                          key={tag}
                          className="font-mono text-[11px] text-success border border-success px-1.5 py-0.5"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <span className="font-mono text-[11px] text-text-tertiary ml-auto">
                    {new Date(entry.createdAt).toLocaleString()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
