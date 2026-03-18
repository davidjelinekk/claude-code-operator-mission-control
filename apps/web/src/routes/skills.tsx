import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { RefreshCw, X, AlertTriangle, Plus, Download } from 'lucide-react'
import { useSkills, useRefreshSkills, type SkillSnapshot } from '@/hooks/api/skills'
import { AgentChip } from '@/components/atoms/AgentChip'
import { useSkillPacks, useCreateSkillPack, useInstallSkillPack, type SkillPack } from '@/hooks/api/skill-packs'

export const Route = createFileRoute('/skills')({
  component: SkillsPageWrapper,
})

type FilterType = 'all' | 'skill' | 'mcp_server'

function TypeBadge({ type }: { type: 'skill' | 'mcp_server' }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 text-xs font-mono border ${
        type === 'skill' ? 'text-[#58a6ff] border-[#1f6feb]' : 'text-[#a5a0ff] border-[#6e40c9]'
      }`}
    >
      {type === 'skill' ? 'Skill' : 'MCP Server'}
    </span>
  )
}

function InstalledBadge({ installed }: { installed: boolean }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 text-xs font-mono border ${
        installed ? 'text-[#3fb950] border-[#238636]' : 'text-[#8b949e] border-[#30363d]'
      }`}
    >
      {installed ? 'Installed' : 'Not installed'}
    </span>
  )
}

function SkillCard({ skill, onClick }: { skill: SkillSnapshot; onClick: () => void }) {
  const agents = skill.agents ?? []
  const visibleAgents = agents.slice(0, 3)
  const extraCount = agents.length - 3

  return (
    <div
      className="break-inside-avoid mb-4 border border-[#30363d] bg-[#161b22] p-5 cursor-pointer hover:border-[#58a6ff] transition-colors"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="font-semibold text-[#e6edf3] leading-tight">{skill.displayName}</p>
        <TypeBadge type={skill.skillType} />
      </div>

      {skill.description && (
        <p className="text-sm text-[#8b949e] mb-3 line-clamp-3">{skill.description}</p>
      )}

      {skill.requiredEnv && skill.requiredEnv.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-medium uppercase tracking-wider text-[#6e7681] mb-1">Required env</p>
          <div className="flex flex-wrap gap-1">
            {skill.requiredEnv.map((v) => (
              <span key={v} className="inline-flex items-center gap-1 border border-[#9e6a03] px-1.5 py-0.5 text-[#d29922] text-xs font-mono">
                <AlertTriangle className="w-3 h-3" />
                {v}
              </span>
            ))}
          </div>
        </div>
      )}

      {agents.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {visibleAgents.map((id) => (
            <AgentChip key={id} emoji="🤖" name={id} />
          ))}
          {extraCount > 0 && (
            <span className="inline-flex items-center border border-[#30363d] bg-[#0d1117] px-2 py-0.5 text-xs font-mono text-[#8b949e]">
              +{extraCount} more
            </span>
          )}
        </div>
      )}

      <InstalledBadge installed={skill.isInstalled} />
    </div>
  )
}

function SkillDetailSheet({ skill, onClose }: { skill: SkillSnapshot; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[#0d1117] border-l border-[#30363d] overflow-y-auto h-full p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 hover:bg-[#21262d] text-[#8b949e] hover:text-[#e6edf3] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-3 mb-6 pr-10">
          <div>
            <h2 className="text-xl font-semibold text-[#e6edf3] mb-1">{skill.displayName}</h2>
            <div className="flex gap-2">
              <TypeBadge type={skill.skillType} />
              <InstalledBadge installed={skill.isInstalled} />
            </div>
          </div>
        </div>

        {skill.description && (
          <div className="mb-6">
            <p className="text-xs font-medium uppercase tracking-wider text-[#6e7681] mb-2">Description</p>
            <p className="text-sm text-[#8b949e]">{skill.description}</p>
          </div>
        )}

        {skill.requiredEnv && skill.requiredEnv.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-medium uppercase tracking-wider text-[#6e7681] mb-2">Required Environment Variables</p>
            <table className="w-full text-sm">
              <tbody>
                {skill.requiredEnv.map((v) => (
                  <tr key={v} className="border-b border-[#21262d]">
                    <td className="py-2 font-mono text-[#d29922]">{v}</td>
                    <td className="py-2 text-right">
                      <AlertTriangle className="w-3.5 h-3.5 text-[#d29922] inline-block" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {skill.dependencies && skill.dependencies.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-medium uppercase tracking-wider text-[#6e7681] mb-2">Dependencies</p>
            <ul className="space-y-1">
              {skill.dependencies.map((d) => (
                <li key={d} className="text-sm text-[#8b949e] font-mono bg-[#161b22] border border-[#30363d] px-2 py-1">{d}</li>
              ))}
            </ul>
          </div>
        )}

        {skill.agents && skill.agents.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-medium uppercase tracking-wider text-[#6e7681] mb-2">Assigned Agents</p>
            <div className="flex flex-wrap gap-2">
              {skill.agents.map((id) => (
                <AgentChip key={id} emoji="🤖" name={id} />
              ))}
            </div>
          </div>
        )}

        {skill.configJson && (
          <div className="mb-6">
            <p className="text-xs font-medium uppercase tracking-wider text-[#6e7681] mb-2">Config</p>
            <pre className="text-xs font-mono text-[#8b949e] bg-[#161b22] p-4 overflow-x-auto border border-[#30363d]">
              {JSON.stringify(skill.configJson, null, 2)}
            </pre>
          </div>
        )}

        <p className="text-xs font-mono text-[#6e7681]">
          Scanned {new Date(skill.scannedAt).toLocaleString()}
        </p>
      </div>
    </div>
  )
}

function SkillsPage() {
  const [filter, setFilter] = useState<FilterType>('all')
  const [selected, setSelected] = useState<SkillSnapshot | null>(null)
  const { data: skills, isLoading } = useSkills()
  const refresh = useRefreshSkills()

  const filtered = (skills ?? []).filter((s) => {
    if (filter === 'all') return true
    return s.skillType === filter
  })

  return (
    <>
      <div className="flex items-center gap-3 mb-5">
        <div className="flex border border-[#30363d] overflow-hidden">
          {([['all', 'All'], ['skill', 'Skills'], ['mcp_server', 'MCP Servers']] as [FilterType, string][]).map(
            ([val, label]) => (
              <button
                key={val}
                onClick={() => setFilter(val)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  filter === val
                    ? 'bg-[#1f6feb] border-r border-[#388bfd] text-white'
                    : 'bg-[#161b22] text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d]'
                }`}
              >
                {label}
              </button>
            ),
          )}
        </div>
        <button
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          className="flex items-center gap-2 px-3 py-1.5 text-sm border border-[#30363d] bg-[#21262d] text-[#e6edf3] hover:bg-[#30363d] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refresh.isPending ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {isLoading && (
        <div className="text-center py-16 text-[#6e7681]">Loading skills…</div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16 text-[#6e7681]">No skills found</div>
      )}

      <div className="columns-1 md:columns-2 xl:columns-3 gap-4">
        {filtered.map((skill) => (
          <SkillCard key={skill.skillId} skill={skill} onClick={() => setSelected(skill)} />
        ))}
      </div>

      {selected && (
        <SkillDetailSheet skill={selected} onClose={() => setSelected(null)} />
      )}
    </>
  )
}

// ─── Skill Packs ─────────────────────────────────────────────────────────────

function PackInstallBadge({ status }: { status: SkillPack['installStatus'] }) {
  if (status === 'installed') {
    return <span className="text-[10px] font-mono px-1.5 py-0.5 border text-[#3fb950] border-[#238636]">installed</span>
  }
  if (status === 'installing') {
    return <span className="text-[10px] font-mono px-1.5 py-0.5 border text-[#58a6ff] border-[#1f6feb] animate-pulse">installing…</span>
  }
  return <span className="text-[10px] font-mono px-1.5 py-0.5 border text-[#6e7681] border-[#30363d]">not installed</span>
}

function PackCard({ pack }: { pack: SkillPack }) {
  const install = useInstallSkillPack()
  const [installing, setInstalling] = useState(false)

  async function handleInstall() {
    setInstalling(true)
    install.mutate(pack.id, { onSettled: () => setInstalling(false) })
  }

  return (
    <div className="border border-[#30363d] bg-[#161b22] p-5">
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="font-mono text-sm font-semibold text-[#e6edf3]">{pack.name}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {pack.version && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 border border-[#30363d] text-[#6e7681]">
              v{pack.version}
            </span>
          )}
          <PackInstallBadge status={pack.installStatus} />
        </div>
      </div>
      {pack.description && (
        <p className="text-xs text-[#8b949e] mb-3 line-clamp-2">{pack.description}</p>
      )}
      <div className="flex items-center justify-between mt-2">
        <span className="text-[11px] font-mono text-[#6e7681]">
          {pack.skills.length} skill{pack.skills.length !== 1 ? 's' : ''}
        </span>
        {pack.installStatus !== 'installed' && (
          <button
            onClick={handleInstall}
            disabled={installing || install.isPending}
            className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-mono text-[#58a6ff] border border-[#30363d] hover:border-[#58a6ff] disabled:opacity-50 transition-colors"
          >
            <Download className="w-3 h-3" />
            {installing ? 'Installing…' : 'Install'}
          </button>
        )}
      </div>
    </div>
  )
}

function CreatePackDialog({ onDone }: { onDone: () => void }) {
  const createPack = useCreateSkillPack()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [skillsRaw, setSkillsRaw] = useState('')
  const [mcpRaw, setMcpRaw] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const skills = skillsRaw.split(',').map((s) => s.trim()).filter(Boolean)
    let mcpServers: Record<string, unknown> = {}
    try { mcpServers = mcpRaw.trim() ? JSON.parse(mcpRaw) : {} } catch { /* ignore */ }
    await createPack.mutateAsync({ name: name.trim(), description: description.trim() || undefined, skills, mcpServers })
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onDone} />
      <div className="relative bg-[#161b22] border border-[#30363d] w-full max-w-md p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-mono text-[13px] font-semibold text-[#e6edf3] uppercase tracking-wide">New Pack</h2>
          <button onClick={onDone} className="text-[#6e7681] hover:text-[#e6edf3]"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-[#8b949e] mb-1">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="pack name"
              className="w-full bg-[#0d1117] border border-[#30363d] px-3 py-2 text-sm font-mono text-[#e6edf3] placeholder-[#6e7681] focus:outline-none focus:border-[#58a6ff]" />
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-[#8b949e] mb-1">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="optional"
              className="w-full bg-[#0d1117] border border-[#30363d] px-3 py-2 text-sm font-mono text-[#e6edf3] placeholder-[#6e7681] focus:outline-none focus:border-[#58a6ff] resize-none" />
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-[#8b949e] mb-1">Skills (comma-separated)</label>
            <input value={skillsRaw} onChange={(e) => setSkillsRaw(e.target.value)} placeholder="skill-a, skill-b"
              className="w-full bg-[#0d1117] border border-[#30363d] px-3 py-2 text-sm font-mono text-[#e6edf3] placeholder-[#6e7681] focus:outline-none focus:border-[#58a6ff]" />
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-[#8b949e] mb-1">MCP Servers (JSON)</label>
            <textarea value={mcpRaw} onChange={(e) => setMcpRaw(e.target.value)} rows={3} placeholder='{}'
              className="w-full bg-[#0d1117] border border-[#30363d] px-3 py-2 text-sm font-mono text-[#e6edf3] placeholder-[#6e7681] focus:outline-none focus:border-[#58a6ff] resize-none" />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onDone} className="px-3 py-1.5 font-mono text-xs text-[#8b949e] border border-[#30363d] hover:border-[#6e7681] transition-colors">Cancel</button>
            <button type="submit" disabled={!name.trim() || createPack.isPending}
              className="px-3 py-1.5 font-mono text-xs text-white bg-[#1f6feb] border border-[#388bfd] hover:bg-[#388bfd] disabled:opacity-50 transition-colors">
              {createPack.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function PacksPage() {
  const { data: packs, isLoading } = useSkillPacks()
  const [showCreate, setShowCreate] = useState(false)

  return (
    <>
      <div className="flex justify-end mb-5">
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] text-[#58a6ff] border border-[#30363d] hover:border-[#58a6ff] transition-colors"
        >
          <Plus className="w-3 h-3" />
          New Pack
        </button>
      </div>
      {isLoading && <div className="text-center py-16 text-[#6e7681]">Loading packs…</div>}
      {!isLoading && (packs ?? []).length === 0 && (
        <div className="text-center py-16 text-[#6e7681]">No skill packs</div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {(packs ?? []).map((pack) => (
          <PackCard key={pack.id} pack={pack} />
        ))}
      </div>
      {showCreate && <CreatePackDialog onDone={() => setShowCreate(false)} />}
    </>
  )
}

type PageTab = 'skills' | 'packs'

function SkillsPageWrapper() {
  const [pageTab, setPageTab] = useState<PageTab>('skills')

  return (
    <div className="p-6">
      <div className="flex items-center justify-between border-b border-[#21262d] pb-4 mb-5">
        <h1 className="font-mono text-[13px] font-semibold text-[#e6edf3] tracking-wide uppercase flex items-center gap-2">
          <span className="text-[#58a6ff]">~/</span>skills
        </h1>
        <div className="flex border border-[#30363d] overflow-hidden">
          {(['skills', 'packs'] as PageTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setPageTab(t)}
              className={`px-3 py-1.5 text-xs font-mono uppercase transition-colors ${
                pageTab === t
                  ? 'bg-[#1f6feb] text-white'
                  : 'bg-[#161b22] text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      {pageTab === 'skills' ? <SkillsPage /> : <PacksPage />}
    </div>
  )
}
