import { useState, useRef } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, MessageSquare, Loader2, Plus, X, Copy } from 'lucide-react'
import {
  usePerson,
  useUpdatePerson,
  useDeletePerson,
  useAddPersonThread,
  useLinkPersonTask,
  useUnlinkPersonTask,
  relativeTime,
  initials,
  type Person,
  type PersonThread,
} from '@/hooks/api/people'
import { useBoards } from '@/hooks/api/boards'
import { useBoardTasks } from '@/hooks/api/tasks'
import { useAgents } from '@/hooks/api/agents'
import { useNavigate } from '@tanstack/react-router'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/people/$personId')({
  component: PersonDetailPage,
})

// --- helpers ---

const CHANNEL_COLORS: Record<PersonThread['channel'], string> = {
  telegram: 'text-[#58a6ff] border-[#1f6feb]',
  teams:    'text-[#a5a0ff] border-[#6e40c9]',
  email:    'text-[#8b949e] border-[#30363d]',
  other:    'text-[#6e7681] border-[#21262d]',
}

const TASK_STATUS_STYLES: Record<string, string> = {
  inbox: 'text-[#8b949e] border-[#30363d]',
  in_progress: 'text-[#58a6ff] border-[#1f6feb]',
  review: 'text-[#a5a0ff] border-[#6e40c9]',
  done: 'text-[#3fb950] border-[#238636]',
}

const RELATIONSHIP_SUGGESTIONS = ['Direct report', 'Manager', 'Client', 'Vendor', 'Partner', 'Contractor']

const CHANNEL_OPTIONS = ['telegram', 'teams', 'email', 'slack', 'discord', 'phone']

// --- editable field ---

interface EditableFieldProps {
  value: string
  placeholder?: string
  onSave: (val: string) => void
  className?: string
  inputClassName?: string
}

function EditableField({ value, placeholder, onSave, className, inputClassName }: EditableFieldProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const cancelRef = useRef(false)

  const handleBlur = () => {
    if (cancelRef.current) { cancelRef.current = false; setEditing(false); return }
    setEditing(false)
    if (draft !== value) onSave(draft)
  }

  if (editing) {
    return (
      <input
        autoFocus
        className={cn(
          'border border-[#58a6ff] bg-[#0d1117] px-1.5 py-0.5 text-xs text-[#e6edf3] outline-none font-mono w-full',
          inputClassName,
        )}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); handleBlur() }
          if (e.key === 'Escape') { cancelRef.current = true; setDraft(value); handleBlur() }
        }}
        onBlur={handleBlur}
      />
    )
  }

  return (
    <button
      onClick={() => { setDraft(value); setEditing(true) }}
      className={cn(
        'text-left text-xs font-mono text-[#e6edf3] hover:text-[#58a6ff] transition-colors w-full truncate',
        !value && 'text-[#6e7681] italic',
        className,
      )}
    >
      {value || placeholder || '—'}
    </button>
  )
}

// --- add thread form ---

interface AddThreadFormProps {
  personId: string
  agents: Array<{ id: string; name: string }>
  onDone: () => void
}

function AddThreadForm({ personId, agents, onDone }: AddThreadFormProps) {
  const addThread = useAddPersonThread(personId)
  const [agentId, setAgentId] = useState(agents[0]?.id ?? '')
  const [channel, setChannel] = useState<PersonThread['channel']>('telegram')
  const [summary, setSummary] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!agentId) return
    addThread.mutate(
      { agentId, channel, summary: summary.trim() || undefined },
      { onSuccess: onDone },
    )
  }

  return (
    <form onSubmit={handleSubmit} className="border border-[#30363d] bg-[#0d1117] p-3 flex flex-col gap-3 mt-2">
      <div className="flex gap-2">
        <select
          className="flex-1 border border-[#30363d] bg-[#0d1117] px-2 py-1.5 text-xs text-[#e6edf3] outline-none focus:border-[#58a6ff] font-mono"
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
        >
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <select
          className="border border-[#30363d] bg-[#0d1117] px-2 py-1.5 text-xs text-[#e6edf3] outline-none focus:border-[#58a6ff] font-mono"
          value={channel}
          onChange={(e) => setChannel(e.target.value as PersonThread['channel'])}
        >
          {(['telegram', 'teams', 'email', 'other'] as const).map((ch) => (
            <option key={ch} value={ch}>{ch}</option>
          ))}
        </select>
      </div>
      <textarea
        className="w-full border border-[#30363d] bg-[#0d1117] px-2 py-1.5 text-xs text-[#e6edf3] outline-none focus:border-[#58a6ff] resize-none font-mono"
        rows={2}
        placeholder="Summary (optional)"
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
      />
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onDone}
          className="border border-[#30363d] bg-[#21262d] px-2 py-1 text-xs text-[#e6edf3] hover:bg-[#30363d] transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={addThread.isPending}
          className="bg-[#1f6feb] border border-[#388bfd] px-2 py-1 text-xs font-medium text-white hover:bg-[#388bfd] disabled:opacity-50 transition-colors"
        >
          {addThread.isPending ? 'Adding…' : 'Add'}
        </button>
      </div>
    </form>
  )
}

// --- channel handles section ---

interface ChannelHandlesProps {
  handles: Record<string, string>
  onUpdate: (handles: Record<string, string>) => void
}

function ChannelHandles({ handles, onUpdate }: ChannelHandlesProps) {
  const [addingChannel, setAddingChannel] = useState(false)
  const [newChannel, setNewChannel] = useState('')
  const [newHandle, setNewHandle] = useState('')

  const handleRemove = (ch: string) => {
    const next = { ...handles }
    delete next[ch]
    onUpdate(next)
  }

  const handleHandleChange = (ch: string, val: string) => {
    onUpdate({ ...handles, [ch]: val })
  }

  const handleAdd = () => {
    const ch = newChannel.trim().toLowerCase()
    const handle = newHandle.trim()
    if (!ch || !handle) return
    onUpdate({ ...handles, [ch]: handle })
    setNewChannel('')
    setNewHandle('')
    setAddingChannel(false)
  }

  return (
    <div className="flex flex-col gap-2">
      {Object.entries(handles).map(([ch, handle]) => (
        <div key={ch} className="flex items-center gap-2">
          <span className="text-xs font-mono text-[#6e7681] w-16 flex-shrink-0">{ch}</span>
          <EditableField
            value={handle}
            placeholder="handle"
            onSave={(val) => handleHandleChange(ch, val)}
            className="flex-1"
          />
          <button
            onClick={() => handleRemove(ch)}
            className="text-[#6e7681] hover:text-[#f85149] transition-colors flex-shrink-0"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      {addingChannel ? (
        <div className="flex items-center gap-1 mt-1">
          <select
            autoFocus
            className="border border-[#30363d] bg-[#0d1117] px-1.5 py-0.5 text-xs text-[#e6edf3] outline-none focus:border-[#58a6ff] font-mono w-20 flex-shrink-0"
            value={newChannel}
            onChange={(e) => setNewChannel(e.target.value)}
          >
            <option value="">channel</option>
            {CHANNEL_OPTIONS.filter((c) => !(c in handles)).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input
            className="border border-[#30363d] bg-[#0d1117] px-1.5 py-0.5 text-xs text-[#e6edf3] outline-none focus:border-[#58a6ff] font-mono flex-1 min-w-0"
            placeholder="handle"
            value={newHandle}
            onChange={(e) => setNewHandle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleAdd() }
              if (e.key === 'Escape') { setAddingChannel(false); setNewChannel(''); setNewHandle('') }
            }}
          />
          <button onClick={handleAdd} className="text-[#3fb950] hover:text-[#56d364] transition-colors flex-shrink-0 text-xs font-mono">add</button>
          <button onClick={() => { setAddingChannel(false); setNewChannel(''); setNewHandle('') }} className="text-[#6e7681] hover:text-[#e6edf3] transition-colors flex-shrink-0">
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAddingChannel(true)}
          className="self-start px-1.5 py-0.5 text-xs font-mono border border-dashed border-[#30363d] text-[#6e7681] hover:text-[#8b949e] hover:border-[#8b949e] transition-colors"
        >
          + channel
        </button>
      )}
    </div>
  )
}

// --- link task form ---

interface LinkTaskFormProps {
  personId: string
  boards: Array<{ id: string; name: string }>
  linkedTaskIds: Set<string>
  onDone: () => void
}

function LinkTaskForm({ personId, boards, linkedTaskIds, onDone }: LinkTaskFormProps) {
  const [boardId, setBoardId] = useState(boards[0]?.id ?? '')
  const [taskId, setTaskId] = useState('')
  const { data: boardTasks = [] } = useBoardTasks(boardId)
  const linkTask = useLinkPersonTask(personId)

  const availableTasks = boardTasks.filter((t) => !linkedTaskIds.has(t.id))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!taskId) return
    linkTask.mutate(taskId, { onSuccess: onDone })
  }

  return (
    <form onSubmit={handleSubmit} className="border border-[#30363d] bg-[#0d1117] p-3 flex flex-col gap-2 mt-1">
      <select
        className="border border-[#30363d] bg-[#0d1117] px-2 py-1.5 text-xs text-[#e6edf3] outline-none focus:border-[#58a6ff] font-mono w-full"
        value={boardId}
        onChange={(e) => { setBoardId(e.target.value); setTaskId('') }}
      >
        {boards.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
      <select
        className="border border-[#30363d] bg-[#0d1117] px-2 py-1.5 text-xs text-[#e6edf3] outline-none focus:border-[#58a6ff] font-mono w-full"
        value={taskId}
        onChange={(e) => setTaskId(e.target.value)}
      >
        <option value="">select task…</option>
        {availableTasks.map((t) => (
          <option key={t.id} value={t.id}>{t.title}</option>
        ))}
      </select>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onDone}
          className="border border-[#30363d] bg-[#21262d] px-2 py-1 text-xs text-[#e6edf3] hover:bg-[#30363d] transition-colors font-mono"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!taskId || linkTask.isPending}
          className="bg-[#1f6feb] border border-[#388bfd] px-2 py-1 text-xs font-medium text-white hover:bg-[#388bfd] disabled:opacity-50 transition-colors"
        >
          {linkTask.isPending ? 'Linking…' : 'Link'}
        </button>
      </div>
    </form>
  )
}

// --- main page ---

function PersonDetailPage() {
  const { personId } = Route.useParams()
  const { data, isLoading, isError } = usePerson(personId)
  const { data: agents = [] } = useAgents()
  const { data: allBoards = [] } = useBoards()
  const updatePerson = useUpdatePerson(personId)
  const deletePerson = useDeletePerson()
  const unlinkTask = useUnlinkPersonTask(personId)
  const navigate = useNavigate()

  const [notesVal, setNotesVal] = useState<string | null>(null)
  const [contextVal, setContextVal] = useState<string | null>(null)
  const [showAddThread, setShowAddThread] = useState(false)
  const [showLinkTask, setShowLinkTask] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [addingTag, setAddingTag] = useState(false)
  const [newPriority, setNewPriority] = useState('')
  const [addingPriority, setAddingPriority] = useState(false)
  const [showRelSuggestions, setShowRelSuggestions] = useState(false)
  const cancelledRef = useRef(false)

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#58a6ff]" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex h-64 items-center justify-center text-[#6e7681] font-mono">
        person not found.
      </div>
    )
  }

  const { person, threads, tasks, projects } = data
  const currentNotes = notesVal !== null ? notesVal : (person.notes ?? '')
  const currentContext = contextVal !== null ? contextVal : (person.context ?? '')

  const handleNotesBlur = () => {
    if (notesVal !== null && notesVal !== person.notes) {
      updatePerson.mutate({ notes: notesVal })
    }
  }

  const handleContextBlur = () => {
    if (contextVal !== null && contextVal !== person.context) {
      updatePerson.mutate({ context: contextVal })
    }
  }

  const handleAddTag = () => {
    if (cancelledRef.current) { cancelledRef.current = false; return }
    const tag = newTag.trim()
    if (!tag) return
    updatePerson.mutate({ tags: [...(person.tags ?? []), tag] })
    setNewTag('')
    setAddingTag(false)
  }

  const handleRemoveTag = (tag: string) => {
    updatePerson.mutate({ tags: (person.tags ?? []).filter((t) => t !== tag) })
  }

  const handleAddPriority = () => {
    if (cancelledRef.current) { cancelledRef.current = false; return }
    const p = newPriority.trim()
    if (!p) return
    updatePerson.mutate({ priorities: [...(person.priorities ?? []), p] })
    setNewPriority('')
    setAddingPriority(false)
  }

  const handleRemovePriority = (p: string) => {
    updatePerson.mutate({ priorities: (person.priorities ?? []).filter((x) => x !== p) })
  }

  const handleDelete = () => {
    if (!window.confirm(`Delete ${person.name}? This cannot be undone.`)) return
    deletePerson.mutate(person.id, {
      onSuccess: () => navigate({ to: '/people' }),
    })
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* back link */}
      <div>
        <Link to="/people" className="inline-flex items-center gap-1.5 text-sm font-mono text-[#8b949e] hover:text-[#e6edf3] transition-colors">
          <ArrowLeft className="h-4 w-4" />
          people
        </Link>
      </div>

      {/* two-column layout */}
      <div className="flex flex-row gap-6 flex-1 min-h-0">
        {/* left: threads timeline */}
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-widest text-[#8b949e]">Threads</span>
            <button
              onClick={() => setShowAddThread((v) => !v)}
              className="inline-flex items-center gap-1 bg-[#21262d] border border-[#30363d] px-2 py-1 text-xs font-mono text-[#c9d1d9] hover:bg-[#30363d] transition-colors"
            >
              <Plus className="h-3 w-3" />
              add thread
            </button>
          </div>

          {showAddThread && (
            <AddThreadForm
              personId={personId}
              agents={agents}
              onDone={() => setShowAddThread(false)}
            />
          )}

          {threads.length === 0 && !showAddThread && (
            <div className="border border-[#30363d] bg-[#161b22] px-4 py-12 text-center">
              <p className="font-mono text-sm text-[#6e7681]">no threads yet</p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {threads.map((thread) => (
              <div key={thread.id} className="border border-[#30363d] bg-[#161b22] px-4 py-3 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <MessageSquare className={cn('h-4 w-4 flex-shrink-0', CHANNEL_COLORS[thread.channel].split(' ')[0])} />
                  <span className={cn('text-xs font-mono border px-1.5 py-0.5', CHANNEL_COLORS[thread.channel])}>
                    {thread.channel}
                  </span>
                  <span className="text-xs font-mono text-[#58a6ff] bg-[#0d2341] border border-[#1f6feb] px-1.5 py-0.5">
                    {thread.agentId}
                  </span>
                  <span className="ml-auto text-xs font-mono text-[#6e7681]">
                    {relativeTime(thread.lastMessageAt ?? thread.createdAt)}
                  </span>
                </div>
                {thread.summary && (
                  <p className="text-sm text-[#8b949e] line-clamp-2">{thread.summary}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* right: person info panel */}
        <div className="w-72 flex flex-col gap-4 overflow-y-auto flex-shrink-0">
          {/* avatar + name + contact */}
          <div className="border border-[#30363d] bg-[#161b22] p-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 flex items-center justify-center bg-[#21262d] border border-[#30363d] flex-shrink-0">
                <span className="font-mono text-xl text-[#58a6ff]">{initials(person.name)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <EditableField
                  value={person.name}
                  placeholder="name"
                  onSave={(name) => updatePerson.mutate({ name })}
                  className="font-semibold text-base"
                />
              </div>
            </div>

            {/* email */}
            <div className="flex items-center gap-2 group">
              <span className="text-xs font-mono text-[#6e7681] w-10 flex-shrink-0">email</span>
              <EditableField
                value={person.email ?? ''}
                placeholder="add email"
                onSave={(email) => updatePerson.mutate({ email: email || undefined })}
                className="flex-1"
              />
              {person.email && (
                <button
                  onClick={() => copyToClipboard(person.email!)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-[#6e7681] hover:text-[#e6edf3]"
                >
                  <Copy className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* phone */}
            <div className="flex items-center gap-2 group">
              <span className="text-xs font-mono text-[#6e7681] w-10 flex-shrink-0">phone</span>
              <EditableField
                value={person.phone ?? ''}
                placeholder="add phone"
                onSave={(phone) => updatePerson.mutate({ phone: phone || undefined })}
                className="flex-1"
              />
              {person.phone && (
                <button
                  onClick={() => copyToClipboard(person.phone!)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-[#6e7681] hover:text-[#e6edf3]"
                >
                  <Copy className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* channel handles */}
          <div className="border border-[#30363d] bg-[#161b22] p-4 flex flex-col gap-2">
            <span className="text-xs font-mono uppercase tracking-widest text-[#8b949e]">Channel Handles</span>
            <ChannelHandles
              handles={person.channelHandles ?? {}}
              onUpdate={(channelHandles) => updatePerson.mutate({ channelHandles })}
            />
          </div>

          {/* relationship context */}
          <div className="border border-[#30363d] bg-[#161b22] p-4 flex flex-col gap-3">
            <span className="text-xs font-mono uppercase tracking-widest text-[#8b949e]">Relationship</span>

            {/* role */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-[#6e7681] w-16 flex-shrink-0">role</span>
              <EditableField
                value={person.role ?? ''}
                placeholder="job title / role"
                onSave={(role) => updatePerson.mutate({ role: role || undefined })}
                className="flex-1"
              />
            </div>

            {/* relationship */}
            <div className="flex items-center gap-2 relative">
              <span className="text-xs font-mono text-[#6e7681] w-16 flex-shrink-0">relation</span>
              <div className="flex-1 relative">
                <EditableField
                  value={person.relationship ?? ''}
                  placeholder="relationship type"
                  onSave={(relationship) => updatePerson.mutate({ relationship: relationship || undefined })}
                  className="flex-1"
                />
                <button
                  onClick={() => setShowRelSuggestions((v) => !v)}
                  className="absolute right-0 top-0 text-[#6e7681] hover:text-[#8b949e] transition-colors text-xs font-mono"
                >
                  ▾
                </button>
                {showRelSuggestions && (
                  <div className="absolute top-5 left-0 z-10 border border-[#30363d] bg-[#161b22] flex flex-col w-full shadow-lg">
                    {RELATIONSHIP_SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        className="px-2 py-1 text-xs font-mono text-left text-[#e6edf3] hover:bg-[#21262d] transition-colors"
                        onClick={() => { updatePerson.mutate({ relationship: s }); setShowRelSuggestions(false) }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* priorities */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-mono text-[#6e7681]">priorities</span>
              <div className="flex flex-wrap gap-1">
                {(person.priorities ?? []).map((p) => (
                  <span key={p} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-mono border border-[#1f6feb] text-[#58a6ff] bg-[#0d2341]">
                    {p}
                    <button onClick={() => handleRemovePriority(p)} className="hover:text-[#e6edf3] transition-colors">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
                {addingPriority ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      className="border border-[#30363d] bg-[#0d1117] px-1.5 py-0.5 text-xs text-[#e6edf3] outline-none focus:border-[#58a6ff] font-mono w-28"
                      value={newPriority}
                      onChange={(e) => setNewPriority(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); handleAddPriority() }
                        if (e.key === 'Escape') { cancelledRef.current = true; setAddingPriority(false); setNewPriority('') }
                      }}
                      onBlur={handleAddPriority}
                      placeholder="priority"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingPriority(true)}
                    className="px-1.5 py-0.5 text-xs font-mono border border-dashed border-[#30363d] text-[#6e7681] hover:text-[#8b949e] hover:border-[#8b949e] transition-colors"
                  >
                    + priority
                  </button>
                )}
              </div>
            </div>

            {/* context */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-mono text-[#6e7681]">context</span>
              <textarea
                className="w-full border border-[#30363d] bg-[#0d1117] px-2 py-1.5 text-xs text-[#e6edf3] outline-none focus:border-[#58a6ff] resize-none font-mono"
                rows={3}
                placeholder="communication preferences, scope, background…"
                value={currentContext}
                onChange={(e) => setContextVal(e.target.value)}
                onBlur={handleContextBlur}
              />
            </div>
          </div>

          {/* notes */}
          <div className="border border-[#30363d] bg-[#161b22] p-4 flex flex-col gap-2">
            <span className="text-xs font-mono uppercase tracking-widest text-[#8b949e]">Notes</span>
            <textarea
              className="w-full border border-[#30363d] bg-[#0d1117] px-2 py-1.5 text-xs text-[#e6edf3] outline-none focus:border-[#58a6ff] resize-none font-mono"
              rows={4}
              placeholder="notes about this person…"
              value={currentNotes}
              onChange={(e) => setNotesVal(e.target.value)}
              onBlur={handleNotesBlur}
            />
          </div>

          {/* tags */}
          <div className="border border-[#30363d] bg-[#161b22] p-4 flex flex-col gap-2">
            <span className="text-xs font-mono uppercase tracking-widest text-[#8b949e]">Tags</span>
            <div className="flex flex-wrap gap-1">
              {(person.tags ?? []).map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-mono border border-[#30363d] text-[#8b949e]">
                  {tag}
                  <button onClick={() => handleRemoveTag(tag)} className="hover:text-[#e6edf3] transition-colors">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
              {addingTag ? (
                <div className="flex items-center gap-1">
                  <input
                    autoFocus
                    className="border border-[#30363d] bg-[#0d1117] px-1.5 py-0.5 text-xs text-[#e6edf3] outline-none focus:border-[#58a6ff] font-mono w-24"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); handleAddTag() }
                      if (e.key === 'Escape') { cancelledRef.current = true; setAddingTag(false); setNewTag('') }
                    }}
                    onBlur={handleAddTag}
                    placeholder="tag"
                  />
                </div>
              ) : (
                <button
                  onClick={() => setAddingTag(true)}
                  className="px-1.5 py-0.5 text-xs font-mono border border-dashed border-[#30363d] text-[#6e7681] hover:text-[#8b949e] hover:border-[#8b949e] transition-colors"
                >
                  + tag
                </button>
              )}
            </div>
          </div>

          {/* linked tasks */}
          <div className="border border-[#30363d] bg-[#161b22] overflow-hidden">
            <div className="border-b border-[#30363d] px-4 py-2 flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-widest text-[#8b949e]">Linked Tasks</span>
              <button
                onClick={() => setShowLinkTask((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-mono text-[#6e7681] hover:text-[#e6edf3] transition-colors"
              >
                <Plus className="h-3 w-3" />
                link
              </button>
            </div>
            {showLinkTask && (
              <div className="px-3 pb-2">
                <LinkTaskForm
                  personId={personId}
                  boards={allBoards}
                  linkedTaskIds={new Set(tasks.map(({ task }) => task?.id ?? '').filter(Boolean))}
                  onDone={() => setShowLinkTask(false)}
                />
              </div>
            )}
            <div className="flex flex-col divide-y divide-[#21262d]">
              {tasks.length === 0 && !showLinkTask && (
                <p className="px-4 py-3 text-xs font-mono text-[#6e7681]">no tasks linked</p>
              )}
              {tasks.map(({ task, boardName }) =>
                task ? (
                  <div key={task.id} className="px-4 py-2 flex items-center justify-between gap-2">
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <span className="text-xs text-[#e6edf3] truncate">{task.title}</span>
                      {boardName && (
                        <span className="text-xs font-mono text-[#6e7681] truncate">{boardName}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className={cn('text-xs font-mono border px-1 py-0.5', TASK_STATUS_STYLES[task.status] ?? 'text-[#8b949e] border-[#30363d]')}>
                        {task.status}
                      </span>
                      <button
                        onClick={() => unlinkTask.mutate(task.id)}
                        className="text-[#6e7681] hover:text-[#f85149] transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ) : null
              )}
            </div>
          </div>

          {/* linked projects */}
          <div className="border border-[#30363d] bg-[#161b22] overflow-hidden">
            <div className="border-b border-[#30363d] px-4 py-2">
              <span className="text-xs font-mono uppercase tracking-widest text-[#8b949e]">Linked Projects</span>
            </div>
            <div className="flex flex-col divide-y divide-[#21262d]">
              {projects.length === 0 && (
                <p className="px-4 py-3 text-xs font-mono text-[#6e7681]">no projects linked</p>
              )}
              {projects.map(({ project }) =>
                project ? (
                  <div key={project.id} className="px-4 py-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-[#e6edf3] truncate flex-1">{project.name}</span>
                    <span className="text-xs font-mono text-[#8b949e] flex-shrink-0">{project.progressPct}%</span>
                  </div>
                ) : null
              )}
            </div>
          </div>

          {/* delete */}
          <div className="border border-[#30363d] bg-[#161b22] p-4">
            <button
              onClick={handleDelete}
              disabled={deletePerson.isPending}
              className="w-full border border-[#f85149] bg-transparent px-3 py-1.5 text-xs font-mono text-[#f85149] hover:bg-[#f85149]/10 disabled:opacity-50 transition-colors"
            >
              {deletePerson.isPending ? 'deleting…' : 'delete person'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
