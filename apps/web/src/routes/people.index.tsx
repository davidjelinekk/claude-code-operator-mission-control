import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { usePeople, useCreatePerson, initials, SOURCE_STYLES, type Person } from '@/hooks/api/people'
import { cn, relativeTime } from '@/lib/utils'

export const Route = createFileRoute('/people/')({
  component: PeoplePage,
})

// --- helpers ---

function SourceBadge({ source }: { source: Person['source'] }) {
  return (
    <span className={cn('inline-flex items-center px-1.5 py-0.5 text-xs font-mono border', SOURCE_STYLES[source])}>
      {source}
    </span>
  )
}

function Avatar({ name }: { name: string }) {
  return (
    <div className="w-8 h-8 bg-surface-hover border border-border flex items-center justify-center font-mono text-[10px] text-accent font-bold flex-shrink-0">
      {initials(name)}
    </div>
  )
}

// --- skeleton ---

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-b border-border-subtle">
          {[240, 80, 120, 60, 80, 80].map((w, j) => (
            <td key={j} className="px-3 py-2.5">
              <div className="h-3 bg-surface-hover animate-pulse" style={{ width: `${w * 0.6 + Math.random() * w * 0.4}px`, maxWidth: '100%' }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

// --- create dialog ---

interface CreateDialogProps {
  onClose: () => void
}

function CreatePersonDialog({ onClose }: CreateDialogProps) {
  const createPerson = useCreatePerson()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [source, setSource] = useState<Person['source']>('manual')
  const [notes, setNotes] = useState('')
  const [tagsRaw, setTagsRaw] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)
    createPerson.mutate(
      {
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        source,
        notes: notes.trim() || undefined,
        tags,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-md bg-surface border border-border p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-text-primary">New Person</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-secondary">Name *</label>
            <input
              className="w-full border border-border bg-canvas px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-secondary">Email</label>
            <input
              type="email"
              className="w-full border border-border bg-canvas px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-secondary">Phone</label>
            <input
              className="w-full border border-border bg-canvas px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 000 0000"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-secondary">Source</label>
            <select
              className="w-full border border-border bg-canvas px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              value={source}
              onChange={(e) => setSource(e.target.value as Person['source'])}
            >
              {(['manual', 'telegram', 'teams', 'email', 'form'] as const).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-secondary">Notes</label>
            <textarea
              className="w-full border border-border bg-canvas px-3 py-2 text-sm text-text-primary outline-none focus:border-accent resize-none"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-secondary">Tags (comma-separated)</label>
            <input
              className="w-full border border-border bg-canvas px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="vip, active, lead"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="border border-border bg-surface-hover px-3 py-1.5 text-sm text-text-primary hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createPerson.isPending}
              className="bg-accent border border-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {createPerson.isPending ? 'Creating…' : 'Create Person'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// --- main page ---

function PeoplePage() {
  const { data: people, isLoading } = usePeople()
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = (people ?? []).filter((p) => {
    if (!search) return true
    const q = search.toLowerCase()
    return p.name.toLowerCase().includes(q) || (p.email ?? '').toLowerCase().includes(q)
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between pb-4 mb-5 border-b border-border-subtle">
        <h1 className="font-mono text-[13px] font-semibold text-text-primary tracking-wide uppercase flex items-center gap-2">
          <span className="text-accent">~/</span>people
        </h1>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 bg-accent border border-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
        >
          <Plus className="h-4 w-4" />
          + new person
        </button>
      </div>

      <div>
        <input
          className="border border-border bg-canvas text-text-primary font-mono text-[12px] px-3 py-1.5 w-full max-w-sm focus:border-accent focus:outline-none transition-colors placeholder:text-text-tertiary"
          placeholder="search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <table className="border border-border w-full" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr className="bg-canvas border-b border-border">
            <th className="font-mono text-[10px] text-text-tertiary tracking-widest uppercase px-3 py-2 text-left font-normal">Person</th>
            <th className="font-mono text-[10px] text-text-tertiary tracking-widest uppercase px-3 py-2 text-left font-normal">Source</th>
            <th className="font-mono text-[10px] text-text-tertiary tracking-widest uppercase px-3 py-2 text-left font-normal">Tags</th>
            <th className="font-mono text-[10px] text-text-tertiary tracking-widest uppercase px-3 py-2 text-left font-normal">Threads</th>
            <th className="font-mono text-[10px] text-text-tertiary tracking-widest uppercase px-3 py-2 text-left font-normal">Last Active</th>
            <th className="font-mono text-[10px] text-text-tertiary tracking-widest uppercase px-3 py-2 text-left font-normal">Updated</th>
          </tr>
        </thead>
        <tbody>
          {isLoading && <SkeletonRows />}

          {!isLoading && filtered.length === 0 && (
            <tr>
              <td colSpan={6} className="py-16 text-center">
                <div className="flex flex-col items-center gap-3 text-text-tertiary">
                  <span className="font-mono text-[32px] opacity-20">[]</span>
                  <span className="font-mono text-[12px]">no entries found</span>
                  <span className="font-mono text-[11px] text-border">— use the button above to create one —</span>
                </div>
              </td>
            </tr>
          )}

          {!isLoading && filtered.map((person) => (
            <tr
              key={person.id}
              className="border-b border-border-subtle hover:bg-surface cursor-pointer transition-colors"
              onClick={() => navigate({ to: '/people/$personId', params: { personId: person.id } })}
            >
              <td className="px-3 py-2.5 font-mono text-[12px]">
                <div className="flex items-center gap-3">
                  <Avatar name={person.name} />
                  <div>
                    <p className="font-medium text-text-primary">{person.name}</p>
                    {person.email && (
                      <p className="text-xs text-text-tertiary font-mono">{person.email}</p>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-3 py-2.5 font-mono text-[12px]">
                <SourceBadge source={person.source} />
              </td>
              <td className="px-3 py-2.5 font-mono text-[12px]">
                <div className="flex flex-wrap gap-1">
                  {person.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="px-1.5 py-0.5 text-xs font-mono border border-border text-text-secondary">
                      {tag}
                    </span>
                  ))}
                  {person.tags.length > 3 && (
                    <span className="px-1.5 py-0.5 text-xs font-mono text-text-tertiary">+{person.tags.length - 3}</span>
                  )}
                </div>
              </td>
              <td className="px-3 py-2.5 font-mono text-[12px] text-center">
                <span className={person.threadCount ? 'text-text-primary' : 'text-text-tertiary'}>
                  {person.threadCount ?? 0}
                </span>
              </td>
              <td className="px-3 py-2.5 font-mono text-[12px] text-text-tertiary">
                {person.lastActiveAt ? relativeTime(person.lastActiveAt) : '—'}
              </td>
              <td className="px-3 py-2.5 font-mono text-[12px] text-text-secondary">
                {relativeTime(person.updatedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showCreate && <CreatePersonDialog onClose={() => setShowCreate(false)} />}
    </div>
  )
}
