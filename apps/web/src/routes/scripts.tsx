import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import {
  RefreshCw, X, AlertTriangle, Plus, Play, Terminal, Loader2, Trash2, FileCode, Clock,
} from 'lucide-react'
import {
  useScripts,
  useRefreshScripts,
  useCreateScript,
  useDeleteScript,
  useTestScript,
  type ScriptDefinition,
  type ScriptTestResult,
} from '@/hooks/api/scripts'
import { AgentChip } from '@/components/atoms/AgentChip'

export const Route = createFileRoute('/scripts')({
  component: ScriptsPage,
})

function InterpreterBadge({ interpreter, entrypoint }: { interpreter: string | null; entrypoint: string }) {
  const label = interpreter ?? inferLang(entrypoint)
  const colors: Record<string, string> = {
    python3: 'text-[#3572A5] border-[#3572A5]',
    node: 'text-[#f1e05a] border-[#f1e05a]',
    bash: 'text-[#89e051] border-[#89e051]',
    npx: 'text-[#f1e05a] border-[#f1e05a]',
    ruby: 'text-[#701516] border-[#701516]',
  }
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono border ${colors[label] ?? 'text-text-secondary border-border'}`}>
      <Terminal className="w-2.5 h-2.5" />
      {label}
    </span>
  )
}

function inferLang(entrypoint: string): string {
  if (entrypoint.endsWith('.py')) return 'python3'
  if (entrypoint.endsWith('.ts')) return 'npx'
  if (entrypoint.endsWith('.js')) return 'node'
  if (entrypoint.endsWith('.sh') || entrypoint.endsWith('.bash')) return 'bash'
  return 'script'
}

function TagChip({ tag }: { tag: string }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-accent border border-accent/30 bg-accent/10">
      {tag}
    </span>
  )
}

function ScriptCard({ script, onClick }: { script: ScriptDefinition; onClick: () => void }) {
  return (
    <div
      className="break-inside-avoid mb-4 border border-border bg-surface p-5 cursor-pointer hover:border-accent transition-colors"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <FileCode className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
          <p className="font-mono text-sm font-semibold text-text-primary leading-tight">{script.name}</p>
        </div>
        <InterpreterBadge interpreter={script.interpreter} entrypoint={script.entrypoint} />
      </div>

      {script.description && (
        <p className="text-xs text-text-secondary mb-3 line-clamp-2">{script.description}</p>
      )}

      {script.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {script.tags.map((t) => <TagChip key={t} tag={t} />)}
        </div>
      )}

      {script.requiredEnv.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {script.requiredEnv.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 border border-warning px-1.5 py-0.5 text-warning text-[10px] font-mono">
              <AlertTriangle className="w-2.5 h-2.5" />
              {v}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-text-tertiary">
          {script.entrypoint}
        </span>
        <span className="font-mono text-[10px] text-text-tertiary">
          <Clock className="w-2.5 h-2.5 inline mr-0.5" />
          {script.timeout / 1000}s
        </span>
        {script.inputMode !== 'args' && (
          <span className="font-mono text-[10px] text-text-tertiary">
            in:{script.inputMode}
          </span>
        )}
      </div>

      {script.agents.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {script.agents.slice(0, 3).map((id) => (
            <AgentChip key={id} emoji="🤖" name={id} />
          ))}
          {script.agents.length > 3 && (
            <span className="inline-flex items-center border border-border bg-canvas px-2 py-0.5 text-[10px] font-mono text-text-secondary">
              +{script.agents.length - 3} more
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function ScriptDetailSheet({ script, onClose }: { script: ScriptDefinition; onClose: () => void }) {
  const deleteScript = useDeleteScript()
  const [showTestPanel, setShowTestPanel] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-canvas border-l border-border overflow-y-auto h-full p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-3 mb-6 pr-10">
          <div>
            <h2 className="text-xl font-semibold text-text-primary mb-1">{script.name}</h2>
            <div className="flex gap-2">
              <InterpreterBadge interpreter={script.interpreter} entrypoint={script.entrypoint} />
              {script.tags.map((t) => <TagChip key={t} tag={t} />)}
            </div>
          </div>
        </div>

        {script.description && (
          <div className="mb-6">
            <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary mb-2">Description</p>
            <p className="text-sm text-text-secondary">{script.description}</p>
          </div>
        )}

        <div className="mb-6">
          <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary mb-2">Configuration</p>
          <table className="w-full text-xs">
            <tbody>
              {[
                ['Entrypoint', script.entrypoint],
                ['Interpreter', script.interpreter ?? inferLang(script.entrypoint)],
                ['Input Mode', script.inputMode],
                ['Output Mode', script.outputMode],
                ['Timeout', `${script.timeout}ms`],
              ].map(([label, value]) => (
                <tr key={label} className="border-b border-border-subtle">
                  <td className="py-2 font-mono text-text-tertiary">{label}</td>
                  <td className="py-2 text-right font-mono text-text-primary">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {script.argsSchema && (
          <div className="mb-6">
            <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary mb-2">Args Schema</p>
            <pre className="text-xs font-mono text-text-secondary bg-surface p-4 overflow-x-auto border border-border">
              {JSON.stringify(script.argsSchema, null, 2)}
            </pre>
          </div>
        )}

        {script.requiredEnv.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary mb-2">Required Environment Variables</p>
            <table className="w-full text-sm">
              <tbody>
                {script.requiredEnv.map((v) => (
                  <tr key={v} className="border-b border-border-subtle">
                    <td className="py-2 font-mono text-warning">{v}</td>
                    <td className="py-2 text-right">
                      <AlertTriangle className="w-3.5 h-3.5 text-warning inline-block" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {script.agents.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary mb-2">Assigned Agents</p>
            <div className="flex flex-wrap gap-2">
              {script.agents.map((id) => (
                <AgentChip key={id} emoji="🤖" name={id} />
              ))}
            </div>
          </div>
        )}

        {/* Test Panel */}
        <div className="mb-6">
          <button
            onClick={() => setShowTestPanel(!showTestPanel)}
            className="flex items-center gap-1.5 font-mono text-[10px] text-accent hover:text-accent-hover transition-colors"
          >
            <Play className="w-3 h-3" />
            {showTestPanel ? 'hide test panel' : 'show test panel'}
          </button>
          {showTestPanel && <TestPanel scriptId={script.id} argsSchema={script.argsSchema} />}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-border-subtle">
          <p className="text-[10px] font-mono text-text-tertiary">{script.filePath}</p>
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-error">delete "{script.id}"?</span>
              <button
                onClick={() => deleteScript.mutate(script.id, { onSuccess: onClose })}
                disabled={deleteScript.isPending}
                className="text-[10px] font-mono text-white bg-error hover:bg-error px-2 py-0.5 transition-colors disabled:opacity-50"
              >
                {deleteScript.isPending ? 'deleting...' : 'confirm'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-[10px] font-mono text-text-secondary hover:text-text-primary transition-colors"
              >
                cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1 text-[10px] font-mono text-error hover:text-error transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function TestPanel({ scriptId, argsSchema }: { scriptId: string; argsSchema: Record<string, unknown> | null }) {
  const testScript = useTestScript()
  const [argsJson, setArgsJson] = useState('{}')
  const [result, setResult] = useState<ScriptTestResult | null>(null)

  // Build simple form fields from schema properties
  const properties = (argsSchema as { properties?: Record<string, { type?: string; enum?: string[]; description?: string }> })?.properties ?? {}
  const propKeys = Object.keys(properties)
  const [formValues, setFormValues] = useState<Record<string, string>>({})

  const handleRun = () => {
    let args: Record<string, unknown>
    if (propKeys.length > 0) {
      args = { ...formValues }
    } else {
      try {
        args = JSON.parse(argsJson)
      } catch {
        args = {}
      }
    }
    testScript.mutate({ id: scriptId, args }, {
      onSuccess: (data) => setResult(data),
    })
  }

  return (
    <div className="mt-3 border border-border bg-surface p-4 flex flex-col gap-3">
      <span className="font-mono text-[10px] text-text-tertiary uppercase tracking-widest">Test Runner</span>

      {propKeys.length > 0 ? (
        <div className="flex flex-col gap-2">
          {propKeys.map((key) => {
            const prop = properties[key]
            return (
              <div key={key} className="flex flex-col gap-1">
                <label className="font-mono text-[10px] text-text-secondary">
                  {key}
                  {prop?.description && <span className="text-text-tertiary"> — {prop.description}</span>}
                </label>
                {prop?.enum ? (
                  <select
                    value={formValues[key] ?? ''}
                    onChange={(e) => setFormValues((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="bg-canvas border border-border text-text-primary font-mono text-[11px] px-2 py-1.5 focus:border-accent focus:outline-none"
                  >
                    <option value="">select...</option>
                    {prop.enum.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={formValues[key] ?? ''}
                    onChange={(e) => setFormValues((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={key}
                    className="bg-canvas border border-border text-text-primary font-mono text-[11px] px-2 py-1.5 focus:border-accent focus:outline-none"
                  />
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <textarea
          value={argsJson}
          onChange={(e) => setArgsJson(e.target.value)}
          placeholder='{"key": "value"}'
          rows={3}
          className="w-full bg-canvas border border-border text-text-primary font-mono text-[11px] p-2 resize-none focus:border-accent focus:outline-none"
        />
      )}

      <button
        onClick={handleRun}
        disabled={testScript.isPending}
        className="flex items-center justify-center gap-1.5 bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-mono text-[11px] py-1.5 px-3 transition-colors"
      >
        {testScript.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
        run
      </button>

      {result && (
        <div className="border border-border bg-canvas p-3 font-mono text-[11px] flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className={result.exitCode === 0 ? 'text-success' : 'text-error'}>
              exit: {result.exitCode}
            </span>
            <span className="text-text-tertiary">{result.durationMs}ms</span>
          </div>
          {result.stdout && (
            <div>
              <span className="text-text-tertiary text-[10px]">stdout:</span>
              <pre className="text-text-primary whitespace-pre-wrap mt-1 max-h-48 overflow-y-auto">{result.stdout}</pre>
            </div>
          )}
          {result.stderr && (
            <div>
              <span className="text-error text-[10px]">stderr:</span>
              <pre className="text-error whitespace-pre-wrap mt-1 max-h-48 overflow-y-auto">{result.stderr}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CreateScriptDialog({ onDone }: { onDone: () => void }) {
  const createScript = useCreateScript()
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [interpreter, setInterpreter] = useState('bash')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!id.trim() || !name.trim()) return
    await createScript.mutateAsync({
      id: id.trim(),
      name: name.trim(),
      description: description.trim() || undefined,
      interpreter,
    })
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onDone} />
      <div className="relative bg-surface border border-border w-full max-w-md p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-mono text-[13px] font-semibold text-text-primary uppercase tracking-wide">New Script</h2>
          <button onClick={onDone} className="text-text-tertiary hover:text-text-primary"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-text-secondary mb-1">ID (slug)</label>
            <input value={id} onChange={(e) => setId(e.target.value)} autoFocus placeholder="my-script"
              pattern="^[a-z0-9][a-z0-9._-]*$"
              className="w-full bg-canvas border border-border px-3 py-2 text-sm font-mono text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent" />
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-text-secondary mb-1">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Script"
              className="w-full bg-canvas border border-border px-3 py-2 text-sm font-mono text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent" />
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-text-secondary mb-1">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="optional"
              className="w-full bg-canvas border border-border px-3 py-2 text-sm font-mono text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent resize-none" />
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-text-secondary mb-1">Interpreter</label>
            <select value={interpreter} onChange={(e) => setInterpreter(e.target.value)}
              className="w-full bg-canvas border border-border px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-accent">
              <option value="bash">bash</option>
              <option value="python3">python3</option>
              <option value="node">node</option>
              <option value="npx">npx (TypeScript)</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onDone} className="px-3 py-1.5 font-mono text-xs text-text-secondary border border-border hover:border-text-tertiary transition-colors">Cancel</button>
            <button type="submit" disabled={!id.trim() || !name.trim() || createScript.isPending}
              className="px-3 py-1.5 font-mono text-xs text-white bg-accent border border-accent hover:bg-accent-hover disabled:opacity-50 transition-colors">
              {createScript.isPending ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ScriptsPage() {
  const { data: scripts, isLoading } = useScripts()
  const refresh = useRefreshScripts()
  const [selected, setSelected] = useState<ScriptDefinition | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between pb-4 border-b border-border-subtle">
        <h1 className="font-mono text-[13px] font-semibold text-text-primary tracking-wide uppercase flex items-center gap-2">
          <span className="text-accent">~/</span>scripts
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono border border-border bg-surface-hover text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refresh.isPending ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-xs text-accent border border-border hover:border-accent transition-colors"
          >
            <Plus className="w-3 h-3" />
            New Script
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-16 text-text-tertiary">Loading scripts...</div>
      )}

      {!isLoading && (scripts ?? []).length === 0 && (
        <div className="border border-border bg-surface p-8 text-center">
          <Terminal className="w-8 h-8 text-text-tertiary mx-auto mb-3" />
          <p className="font-mono text-xs text-text-tertiary mb-1">No CLI scripts found</p>
          <p className="font-mono text-[10px] text-text-tertiary">
            Create scripts in ~/.claude/scripts/ with a SCRIPT.md manifest
          </p>
        </div>
      )}

      <div className="columns-1 md:columns-2 xl:columns-3 gap-4">
        {(scripts ?? []).map((script) => (
          <ScriptCard key={script.id} script={script} onClick={() => setSelected(script)} />
        ))}
      </div>

      {selected && (
        <ScriptDetailSheet script={selected} onClose={() => setSelected(null)} />
      )}

      {showCreate && <CreateScriptDialog onDone={() => setShowCreate(false)} />}
    </div>
  )
}
