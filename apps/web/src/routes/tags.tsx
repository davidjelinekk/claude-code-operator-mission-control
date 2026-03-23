import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { X, Plus, Pencil, Check } from 'lucide-react'
import { useTags, useCreateTag, useDeleteTag, useUpdateTag, type Tag } from '@/hooks/api/tags'

export const Route = createFileRoute('/tags')({
  component: TagsPage,
})

function TagColorSwatch({ color }: { color: string }) {
  const hex = color.startsWith('#') ? color : `#${color}`
  return (
    <span
      className="inline-block w-4 h-4 border border-border flex-shrink-0"
      style={{ backgroundColor: hex }}
    />
  )
}

function CreateTagRow({ onDone }: { onDone: () => void }) {
  const createTag = useCreateTag()
  const [name, setName] = useState('')
  const [color, setColor] = useState('#58a6ff')
  const [description, setDescription] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const hex = color.startsWith('#') ? color.slice(1) : color
    await createTag.mutateAsync({ name: name.trim(), color: hex, description: description.trim() || undefined })
    onDone()
  }

  return (
    <tr className="border-b border-border-subtle bg-canvas">
      <td className="px-4 py-2">
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="w-8 h-8 bg-transparent border border-border cursor-pointer p-0"
          style={{ appearance: 'none' }}
        />
      </td>
      <td className="px-4 py-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="tag name"
          autoFocus
          className="w-full bg-canvas border border-border px-2 py-1 text-sm font-mono text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent"
        />
      </td>
      <td className="px-4 py-2 font-mono text-xs text-text-tertiary">auto</td>
      <td className="px-4 py-2">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="description (optional)"
          className="w-full bg-canvas border border-border px-2 py-1 text-sm font-mono text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent"
        />
      </td>
      <td className="px-4 py-2">
        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || createTag.isPending}
            className="p-1 text-success hover:text-success disabled:opacity-40 transition-colors"
          >
            <Check className="w-4 h-4" />
          </button>
          <button onClick={onDone} className="p-1 text-text-tertiary hover:text-text-primary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  )
}

function EditTagRow({ tag, onDone }: { tag: Tag; onDone: () => void }) {
  const updateTag = useUpdateTag()
  const [name, setName] = useState(tag.name)
  const [color, setColor] = useState(tag.color.startsWith('#') ? tag.color : `#${tag.color}`)
  const [description, setDescription] = useState(tag.description ?? '')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const hex = color.startsWith('#') ? color.slice(1) : color
    await updateTag.mutateAsync({ id: tag.id, name: name.trim(), color: hex })
    onDone()
  }

  return (
    <tr className="border-b border-border-subtle bg-canvas">
      <td className="px-4 py-2">
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="w-8 h-8 bg-transparent border border-border cursor-pointer p-0"
        />
      </td>
      <td className="px-4 py-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className="w-full bg-canvas border border-border px-2 py-1 text-sm font-mono text-text-primary focus:outline-none focus:border-accent"
        />
      </td>
      <td className="px-4 py-2 font-mono text-xs text-text-tertiary">{tag.slug}</td>
      <td className="px-4 py-2">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full bg-canvas border border-border px-2 py-1 text-sm font-mono text-text-primary focus:outline-none focus:border-accent"
        />
      </td>
      <td className="px-4 py-2">
        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || updateTag.isPending}
            className="p-1 text-success hover:text-success disabled:opacity-40 transition-colors"
          >
            <Check className="w-4 h-4" />
          </button>
          <button onClick={onDone} className="p-1 text-text-tertiary hover:text-text-primary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  )
}

function TagRow({ tag }: { tag: Tag }) {
  const deleteTag = useDeleteTag()
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const hex = tag.color.startsWith('#') ? tag.color : `#${tag.color}`

  if (editing) return <EditTagRow tag={tag} onDone={() => setEditing(false)} />

  return (
    <tr className="border-b border-border-subtle hover:bg-surface">
      <td className="px-4 py-3">
        <TagColorSwatch color={hex} />
      </td>
      <td className="px-4 py-3">
        <span className="font-mono text-sm text-text-primary">{tag.name}</span>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-text-tertiary">{tag.slug}</td>
      <td className="px-4 py-3 text-sm text-text-secondary">{tag.description ?? <span className="text-text-tertiary">—</span>}</td>
      <td className="px-4 py-3">
        <div className="flex gap-2 items-center">
          <button
            onClick={() => setEditing(true)}
            className="p-1 text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {confirming ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => deleteTag.mutate(tag.id)}
                disabled={deleteTag.isPending}
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
      </td>
    </tr>
  )
}

function TagsPage() {
  const { data: tags, isLoading } = useTags()
  const [creating, setCreating] = useState(false)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between border-b border-border-subtle pb-4 mb-5">
        <h1 className="font-mono text-[13px] font-semibold text-text-primary tracking-wide uppercase">
          <span className="text-accent">~/</span>tags
        </h1>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] text-accent border border-border hover:border-accent transition-colors"
        >
          <Plus className="w-3 h-3" />
          New Tag
        </button>
      </div>

      {isLoading && (
        <div className="text-center py-16 font-mono text-text-tertiary">loading…</div>
      )}

      {!isLoading && (
        <div className="border border-border bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-mono uppercase tracking-wider text-text-secondary border-b border-border">
                <th className="text-left px-4 py-3 w-12">Color</th>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Slug</th>
                <th className="text-left px-4 py-3">Description</th>
                <th className="text-left px-4 py-3 w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {creating && <CreateTagRow onDone={() => setCreating(false)} />}
              {(tags ?? []).map((tag) => (
                <TagRow key={tag.id} tag={tag} />
              ))}
              {(tags ?? []).length === 0 && !creating && (
                <tr>
                  <td colSpan={5} className="py-12 text-center font-mono text-text-tertiary">No tags yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
