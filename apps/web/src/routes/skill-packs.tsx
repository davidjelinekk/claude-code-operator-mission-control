import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Plus, X, Download, Trash2, Loader2 } from 'lucide-react'
import {
  useSkillPacks,
  useCreateSkillPack,
  useInstallSkillPack,
  useDeleteSkillPack,
  type SkillPack,
} from '@/hooks/api/skill-packs'

export const Route = createFileRoute('/skill-packs')({
  component: SkillPacksPage,
})

const STATUS_STYLE: Record<string, string> = {
  installed: 'text-success border-success/30 bg-success/10',
  installing: 'text-warning border-warning/30 bg-warning/10',
  not_installed: 'text-text-tertiary border-border',
  error: 'text-error border-error/30 bg-error/10',
}

function SkillPackCard({ pack }: { pack: SkillPack }) {
  const install = useInstallSkillPack()
  const deletePack = useDeleteSkillPack()
  const [confirming, setConfirming] = useState(false)

  const status = pack.installStatus ?? 'not_installed'

  return (
    <div className="border border-border bg-surface p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold text-text-primary truncate">{pack.name}</span>
            {pack.version && (
              <span className="font-mono text-[10px] text-text-tertiary border border-border px-1.5 py-0.5 flex-shrink-0">
                v{pack.version}
              </span>
            )}
          </div>
          {pack.description && (
            <p className="text-xs text-text-secondary mt-1 line-clamp-2">{pack.description}</p>
          )}
        </div>
        <span className={`font-mono text-[10px] px-1.5 py-0.5 border flex-shrink-0 ${STATUS_STYLE[status] ?? STATUS_STYLE['not_installed']}`}>
          {status}
        </span>
      </div>

      {pack.skills.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t border-border-subtle pt-2">
          {pack.skills.slice(0, 6).map((s) => (
            <span key={s} className="font-mono text-[10px] text-text-secondary border border-border-subtle px-1.5 py-0.5">
              {s}
            </span>
          ))}
          {pack.skills.length > 6 && (
            <span className="font-mono text-[10px] text-text-tertiary px-1.5 py-0.5">
              +{pack.skills.length - 6} more
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-2">
        <button
          onClick={() => install.mutate(pack.id)}
          disabled={install.isPending || status === 'installing'}
          className="flex items-center gap-1.5 px-2.5 py-1 font-mono text-[11px] text-accent border border-border hover:border-accent disabled:opacity-50 transition-colors"
        >
          {install.isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Download className="w-3 h-3" />
          )}
          {status === 'installed' ? 'Reinstall' : 'Install'}
        </button>

        <div>
          {confirming ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => deletePack.mutate(pack.id)}
                disabled={deletePack.isPending}
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
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function CreatePackDialog({ onDone }: { onDone: () => void }) {
  const createPack = useCreateSkillPack()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [version, setVersion] = useState('')
  const [skillsInput, setSkillsInput] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const skills = skillsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    await createPack.mutateAsync({
      name: name.trim(),
      description: description.trim() || undefined,
      skills,
    })
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onDone} />
      <div className="relative bg-surface border border-border w-full max-w-md p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-mono text-[13px] font-semibold text-text-primary uppercase tracking-wide">New Skill Pack</h2>
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
              placeholder="pack name"
              className="w-full bg-canvas border border-border px-3 py-2 text-sm font-mono text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-text-secondary mb-1">Version</label>
            <input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="1.0.0"
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
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-text-secondary mb-1">Skills (comma-separated)</label>
            <input
              value={skillsInput}
              onChange={(e) => setSkillsInput(e.target.value)}
              placeholder="skill-a, skill-b"
              className="w-full bg-canvas border border-border px-3 py-2 text-sm font-mono text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent"
            />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onDone}
              className="px-3 py-1.5 font-mono text-xs text-text-secondary border border-border hover:border-text-tertiary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || createPack.isPending}
              className="px-3 py-1.5 font-mono text-xs text-white bg-accent border border-accent hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {createPack.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function SkillPacksPage() {
  const { data: packs, isLoading } = useSkillPacks()
  const [showCreate, setShowCreate] = useState(false)

  const installed = (packs ?? []).filter((p) => p.installStatus === 'installed').length
  const total = (packs ?? []).length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between pb-4 border-b border-border-subtle">
        <h1 className="font-mono text-[13px] font-semibold text-text-primary tracking-wide uppercase flex items-center gap-2">
          <span className="text-accent">~/</span>skill-packs
        </h1>
        <div className="flex items-center gap-3">
          {!isLoading && total > 0 && (
            <span className="font-mono text-xs text-text-secondary">
              {installed}/{total} installed
            </span>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] text-accent border border-border hover:border-accent transition-colors"
          >
            <Plus className="w-3 h-3" />
            New Pack
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      )}

      {!isLoading && (packs ?? []).length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-text-tertiary">
          <span className="font-mono text-4xl opacity-20">[]</span>
          <span className="font-mono text-sm">no skill packs</span>
        </div>
      )}

      {!isLoading && (packs ?? []).length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(packs ?? []).map((pack) => (
            <SkillPackCard key={pack.id} pack={pack} />
          ))}
        </div>
      )}

      {showCreate && <CreatePackDialog onDone={() => setShowCreate(false)} />}
    </div>
  )
}
