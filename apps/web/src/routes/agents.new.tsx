import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useCreateAgent } from '@/hooks/api/agents'

export const Route = createFileRoute('/agents/new')({
  component: AgentsNewPage,
})

function AgentsNewPage() {
  const navigate = useNavigate()
  const createAgent = useCreateAgent()

  const [name, setName] = useState('')
  const [model, setModel] = useState('')
  const [description, setDescription] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    createAgent.mutate(
      {
        name: name.trim(),
        model: model.trim() || undefined,
        description: description.trim() || undefined,
      },
      { onSuccess: () => navigate({ to: '/agents' }) },
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* header */}
      <div className="flex items-center gap-3 pb-4 border-b border-[#21262d]">
        <Link to="/agents" className="flex items-center gap-1.5 font-mono text-xs text-[#6e7681] hover:text-[#58a6ff] transition-colors">
          <ArrowLeft className="w-3 h-3" />
        </Link>
        <h1 className="font-mono text-[13px] font-semibold text-[#e6edf3] tracking-wide uppercase">
          <span className="text-[#58a6ff]">~/</span>agents / new
        </h1>
      </div>

      <div className="max-w-md">
        <div className="border border-[#30363d] bg-[#161b22] p-5">
          <span className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">Create Agent</span>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-4 border-t border-[#21262d] pt-4">
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">
                name <span className="text-[#f85149]">*</span>
              </label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-agent"
                className="bg-[#0d1117] border border-[#30363d] focus:border-[#58a6ff] px-3 py-2 text-sm font-mono text-[#e6edf3] focus:outline-none w-full"
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this agent do?"
                className="bg-[#0d1117] border border-[#30363d] focus:border-[#58a6ff] px-3 py-2 text-sm font-mono text-[#e6edf3] focus:outline-none w-full"
              />
            </div>

            {/* Model */}
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[10px] text-[#6e7681] uppercase tracking-widest">model</label>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="claude-opus-4-5"
                className="bg-[#0d1117] border border-[#30363d] focus:border-[#58a6ff] px-3 py-2 text-sm font-mono text-[#e6edf3] focus:outline-none w-full"
              />
            </div>

            {createAgent.isError && (
              <p className="font-mono text-xs text-[#f85149]">{createAgent.error?.message ?? 'Failed to create agent'}</p>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={createAgent.isPending || !name.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-[#1f6feb] hover:bg-[#388bfd] text-white font-mono text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createAgent.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                Create Agent
              </button>
              <Link to="/agents" className="font-mono text-xs text-[#6e7681] hover:text-[#8b949e] transition-colors">
                cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
