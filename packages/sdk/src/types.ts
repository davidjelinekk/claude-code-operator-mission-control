export type * from '@claude-code-operator/shared-types'

export interface CCOperatorConfig {
  baseUrl: string
  token?: string
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number
}

export class CCOperatorError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message)
    this.name = 'CCOperatorError'
  }
}

export interface SSEEvent {
  event: string
  data: string
}

export interface SpawnParams {
  provider?: 'claude' | 'codex' | 'gemini'
  prompt: string
  model?: string
  maxTurns?: number
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto'
  taskBudget?: { total: number }
  tools?: string[]
  disallowedTools?: string[]
  cwd?: string
  systemPrompt?: string | { type: 'preset'; preset: 'claude_code'; append?: string }
  agent?: string
  agents?: Record<string, { description: string; prompt: string; tools?: string[]; model?: string }>
  maxBudgetUsd?: number
  persistSession?: boolean
  includePartialMessages?: boolean
  agentProgressSummaries?: boolean
  effort?: 'low' | 'medium' | 'high' | 'max'
  promptSuggestions?: boolean
  fallbackModel?: string
  additionalDirectories?: string[]
  enableFileCheckpointing?: boolean
  outputFormat?: { type: 'json_schema'; schema: Record<string, unknown> }
  scripts?: string[]
  sandbox?: boolean | { enabled: boolean; failIfUnavailable?: boolean; autoAllowBashIfSandboxed?: boolean; network?: { allowLocalBinding?: boolean; allowUnixSockets?: string[] } }
  settings?: Record<string, unknown>
  betas?: string[]
  settingSources?: Array<'user' | 'project' | 'local'>
  allowedTools?: string[]
  thinking?: { type: 'adaptive' } | { type: 'enabled'; budgetTokens: number } | { type: 'disabled' }
  resumeSessionAt?: string
  forkSession?: boolean
  debug?: boolean
  debugFile?: string
  plugins?: Array<{ type: 'local'; path: string }>
  resume?: string
  sessionId?: string
  boardId?: string
  taskId?: string
}

export interface SessionSummary {
  sessionId: string
  provider?: 'claude' | 'codex' | 'gemini'
  status: string
  /** SDK 0.2.91+: why the query loop terminated (Claude only) */
  terminalReason?: string | null
  createdAt: string
  completedAt: string | null
  meta: Record<string, unknown>
  messageCount: number
}

export interface SessionDetail extends SessionSummary {
  messages: Array<Record<string, unknown>>
  result: Record<string, unknown> | null
}

export interface AgentBusMessage {
  boardId: string
  fromAgentId: string
  toAgentId: string
  content: string
  priority?: string
  metadata?: Record<string, unknown> | null
}

export interface ContextGraphEntity {
  name: string
  entityType: string
  description?: string
  properties?: Record<string, unknown>
  boardId?: string
}

export interface ContextGraphObservation {
  entityId: string
  content: string
  observationType?: 'fact' | 'preference' | 'behavior' | 'outcome' | 'error'
  source?: string
  sourceId?: string
}

export interface AnalyticsQuery {
  from?: string
  to?: string
}

export interface TimeseriesQuery extends AnalyticsQuery {
  bucket?: 'hourly' | 'daily'
}
