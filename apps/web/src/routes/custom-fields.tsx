import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Plus, X, Loader2 } from 'lucide-react'
import {
  useCustomFields,
  useCreateCustomField,
  useDeleteCustomField,
  type CustomFieldDefinition,
} from '@/hooks/api/custom-fields'

export const Route = createFileRoute('/custom-fields')({
  component: CustomFieldsPage,
})

const FIELD_TYPES: CustomFieldDefinition['fieldType'][] = [
  'text',
  'text_long',
  'integer',
  'decimal',
  'boolean',
  'date',
  'url',
  'json',
]

const TYPE_COLOR: Record<CustomFieldDefinition['fieldType'], string> = {
  text: 'text-[#79c0ff]',
  text_long: 'text-[#79c0ff]',
  integer: 'text-success',
  decimal: 'text-success',
  boolean: 'text-warning',
  date: 'text-[#a5d6ff]',
  url: 'text-[#f78166]',
  json: 'text-[#d2a8ff]',
}

function FieldRow({ field }: { field: CustomFieldDefinition }) {
  const deleteField = useDeleteCustomField()
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-border-subtle last:border-0">
      <div className="flex items-center gap-4 min-w-0">
        <span className={`font-mono text-[11px] uppercase tracking-widest flex-shrink-0 ${TYPE_COLOR[field.fieldType]}`}>
          {field.fieldType}
        </span>
        <div className="min-w-0">
          <span className="font-mono text-sm text-text-primary truncate block">{field.label}</span>
          <span className="font-mono text-[10px] text-text-tertiary truncate block">{field.fieldKey}</span>
        </div>
        {field.required && (
          <span className="font-mono text-[10px] px-1.5 py-0.5 border border-error text-error flex-shrink-0">
            required
          </span>
        )}
      </div>
      <div className="flex-shrink-0">
        {confirming ? (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => deleteField.mutate(field.id)}
              disabled={deleteField.isPending}
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
  )
}

function CreateFieldForm({ onDone }: { onDone: () => void }) {
  const createField = useCreateCustomField()
  const [fieldKey, setFieldKey] = useState('')
  const [label, setLabel] = useState('')
  const [fieldType, setFieldType] = useState<CustomFieldDefinition['fieldType']>('text')
  const [required, setRequired] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fieldKey.trim() || !label.trim()) return
    await createField.mutateAsync({ fieldKey: fieldKey.trim(), label: label.trim(), fieldType, required })
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onDone} />
      <div className="relative bg-surface border border-border w-full max-w-md p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-mono text-[13px] font-semibold text-text-primary uppercase tracking-wide">New Custom Field</h2>
          <button onClick={onDone} className="text-text-tertiary hover:text-text-primary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-text-secondary mb-1">Label</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
              placeholder="Display label"
              className="w-full bg-canvas border border-border px-3 py-2 text-sm font-mono text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-text-secondary mb-1">Field Key</label>
            <input
              value={fieldKey}
              onChange={(e) => setFieldKey(e.target.value)}
              placeholder="snake_case_key"
              className="w-full bg-canvas border border-border px-3 py-2 text-sm font-mono text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-text-secondary mb-1">Type</label>
            <select
              value={fieldType}
              onChange={(e) => setFieldType(e.target.value as CustomFieldDefinition['fieldType'])}
              className="w-full bg-canvas border border-border px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-accent"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="required"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="accent-accent"
            />
            <label htmlFor="required" className="text-xs font-mono text-text-secondary cursor-pointer">Required</label>
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
              disabled={!fieldKey.trim() || !label.trim() || createField.isPending}
              className="px-3 py-1.5 font-mono text-xs text-white bg-accent border border-accent hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {createField.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CustomFieldsPage() {
  const { data: fields, isLoading } = useCustomFields()
  const [showCreate, setShowCreate] = useState(false)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between pb-4 border-b border-border-subtle">
        <h1 className="font-mono text-[13px] font-semibold text-text-primary tracking-wide uppercase flex items-center gap-2">
          <span className="text-accent">~/</span>custom-fields
        </h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] text-accent border border-border hover:border-accent transition-colors"
        >
          <Plus className="w-3 h-3" />
          New Field
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      )}

      {!isLoading && (fields ?? []).length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-text-tertiary">
          <span className="font-mono text-4xl opacity-20">{'{}'}</span>
          <span className="font-mono text-sm">no custom fields defined</span>
        </div>
      )}

      {!isLoading && (fields ?? []).length > 0 && (
        <div className="border border-border bg-surface px-4">
          {(fields ?? []).map((field) => (
            <FieldRow key={field.id} field={field} />
          ))}
        </div>
      )}

      {showCreate && <CreateFieldForm onDone={() => setShowCreate(false)} />}
    </div>
  )
}
