import { EventEmitter } from 'node:events'
import pino from 'pino'
import {
  query,
  listSessions as sdkListSessions,
  getSessionInfo as sdkGetSessionInfo,
  getSessionMessages as sdkGetSessionMessages,
  renameSession as sdkRenameSession,
  tagSession as sdkTagSession,
  forkSession as sdkForkSession,
  listSubagents as sdkListSubagents,
  getSubagentMessages as sdkGetSubagentMessages,
  type SDKSessionInfo,
  type SessionMessage,
  type PermissionMode,
} from '@anthropic-ai/claude-agent-sdk'
import type { Provider, NormalizedMessage, ProviderStatus } from '@claude-code-operator/shared-types'
import type { ProviderSession } from '../providers/types.js'
import { getProvider, detectAvailableProviders } from '../providers/registry.js'
import { readMcpConfig, type McpServerConfig } from './config-reader.js'
import { extractFromText, compressSession } from '../context-graph/extractor.js'
import { processExtractionResult } from '../context-graph/graph-store.js'
import { db } from '../../db/client.js'
import { sessionArchives } from '../../db/schema.js'
import { eq } from 'drizzle-orm'

const log = pino({ name: 'agent-sdk' })

// --- Types ---

export interface SpawnParams {
  prompt: string
  /** Provider to use for this session (defaults to 'claude') */
  provider?: Provider
  model?: string
  maxTurns?: number
  permissionMode?: PermissionMode
  tools?: string[]
  disallowedTools?: string[]
  cwd?: string
  additionalDirectories?: string[]
  systemPrompt?: string | { type: 'preset'; preset: 'claude_code'; append?: string }
  agent?: string
  /** Inline agent definitions keyed by name */
  agents?: Record<string, { description: string; prompt: string; tools?: string[]; model?: string; maxTurns?: number }>
  maxBudgetUsd?: number
  /**
   * SDK 0.2.84+: API-side token budget awareness. The model sees its remaining
   * budget and paces tool use to wrap up before hitting the limit.
   * Sent as `output_config.task_budget` with the `task-budgets-2026-03-13` beta.
   */
  taskBudget?: { total: number }
  persistSession?: boolean
  /** Include streaming partial message events */
  includePartialMessages?: boolean
  /** Enable AI-generated progress summaries for subagents */
  agentProgressSummaries?: boolean
  /** Effort level: low, medium, high, max */
  effort?: 'low' | 'medium' | 'high' | 'max'
  /** Inject MCP servers (looked up from settings.json or passed directly) */
  mcpServers?: Record<string, McpServerConfig>
  /** Enable prompt suggestions after each turn */
  promptSuggestions?: boolean
  /** Fallback model if primary is unavailable */
  fallbackModel?: string
  /** Enable file checkpointing for rewindFiles() support */
  enableFileCheckpointing?: boolean
  /** Structured output format */
  outputFormat?: { type: 'json_schema'; schema: Record<string, unknown> }
  /** CLI scripts to inject as MCP tools */
  scripts?: string[]
  /** Environment variables to pass to the CLI subprocess */
  env?: Record<string, string | undefined>
  /** Sandbox settings for isolated execution */
  sandbox?: boolean | { enabled: boolean; failIfUnavailable?: boolean; autoAllowBashIfSandboxed?: boolean; network?: { allowLocalBinding?: boolean; allowUnixSockets?: string[] } }
  /** Inline settings to apply (permissions, model, etc.) */
  settings?: Record<string, unknown>
  /** Enable beta features (e.g., 'context-1m-2025-08-07' for 1M context) */
  betas?: string[]
  /** Control which filesystem settings to load */
  settingSources?: Array<'user' | 'project' | 'local'>
  /** Allowed tools that auto-execute without prompting */
  allowedTools?: string[]
  /** Thinking/reasoning behavior control */
  thinking?: { type: 'adaptive' } | { type: 'enabled'; budgetTokens: number } | { type: 'disabled' }
  /** Resume from a specific message UUID */
  resumeSessionAt?: string
  /** Fork to new session when resuming */
  forkSession?: boolean
  /** Enable debug logging for the spawned session */
  debug?: boolean
  /** Write debug logs to a specific file path (implies debug: true) */
  debugFile?: string
  /** Load plugins into the session */
  plugins?: Array<{ type: 'local'; path: string }>
  // Session management
  resume?: string
  sessionId?: string
  // Metadata for tracking (not passed to SDK)
  boardId?: string
  taskId?: string
  callerContext?: string
}

export type SessionStatus = 'running' | 'completed' | 'error' | 'aborted'

export interface ManagedSession {
  sessionId: string
  provider: Provider
  status: SessionStatus
  messages: NormalizedMessage[]
  result?: NormalizedMessage
  providerSession: ProviderSession | null
  /** @deprecated Use providerSession.queryHandle for Claude-specific access */
  query: ReturnType<typeof query> | null
  abortController: AbortController
  createdAt: Date
  completedAt?: Date
  /** SDK 0.2.91+: terminal_reason from result message (Claude only) */
  terminalReason?: string | null
  meta: { boardId?: string; taskId?: string; callerContext?: string; agentId?: string }
}

export interface AgentSdkStatus {
  available: boolean
  cliInstalled: boolean
  apiKeyConfigured: boolean
  model: string | null
  activeSessions: number
  providers: ProviderStatus[]
}

// --- Session Manager ---

class AgentSessionManager extends EventEmitter {
  private sessions = new Map<string, ManagedSession>()
  private pruneTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    super()
    this.pruneTimer = setInterval(() => this.pruneCompleted(), 10 * 60 * 1000)
  }

  checkCli(): boolean {
    try {
      return getProvider('claude').checkAvailable()
    } catch {
      return false
    }
  }

  getStatus(): AgentSdkStatus {
    const providers = detectAvailableProviders()
    const claudeStatus = providers.find((p) => p.provider === 'claude')
    return {
      available: providers.some((p) => p.available),
      cliInstalled: claudeStatus?.cliInstalled ?? false,
      apiKeyConfigured: !!process.env.ANTHROPIC_API_KEY,
      model: claudeStatus?.defaultModel ?? null,
      activeSessions: this.getActiveSessions().length,
      providers,
    }
  }

  async spawn(params: SpawnParams): Promise<{ sessionId: string; status: SessionStatus }> {
    const providerName = params.provider ?? 'claude'
    const provider = getProvider(providerName)

    if (!provider.checkAvailable()) {
      throw new Error(`${providerName} CLI not available — check installation and API keys`)
    }

    const abortController = new AbortController()

    const providerSession = await provider.spawn({
      prompt: params.prompt,
      model: params.model,
      maxTurns: params.maxTurns,
      cwd: params.cwd,
      systemPrompt: params.systemPrompt,
      env: params.env,
      sandbox: params.sandbox,
      abortController,
      raw: params as unknown as Record<string, unknown>,
    })

    const placeholderId = crypto.randomUUID()

    const managed: ManagedSession = {
      sessionId: placeholderId,
      provider: providerName,
      status: 'running',
      messages: [],
      providerSession,
      query: providerName === 'claude' ? (providerSession.queryHandle as ReturnType<typeof query>) : null,
      abortController,
      createdAt: new Date(),
      meta: {
        boardId: params.boardId,
        taskId: params.taskId,
        callerContext: params.callerContext,
        agentId: params.agent,
      },
    }

    this.sessions.set(placeholderId, managed)
    this.consumeSession(placeholderId, providerSession.messages)

    log.info({ sessionId: placeholderId, provider: providerName, callerContext: params.callerContext, agent: params.agent }, 'session spawned')

    return { sessionId: placeholderId, status: 'running' }
  }

  private async consumeSession(
    id: string,
    messages: AsyncGenerator<NormalizedMessage, void>,
  ) {
    const managed = this.sessions.get(id)
    if (!managed) return

    let remapped = false

    try {
      for await (const message of messages) {
        // If already aborted, don't process further messages
        if (managed.status === 'aborted') break

        // Remap session ID from the first message (once only)
        if (
          !remapped &&
          message.session_id &&
          message.session_id !== id
        ) {
          remapped = true
          const realId = message.session_id
          managed.sessionId = realId
          // Atomic remap: set new key, then delete old
          this.sessions.set(realId, managed)
          this.sessions.delete(id)
          log.debug({ oldId: id, realId }, 'session ID remapped')
        }

        managed.messages.push(message)
        this.emit('message', { sessionId: managed.sessionId, message })

        // SDK 0.2.77+: api_retry system messages expose transient API retry telemetry.
        // Shape (from SDKAPIRetryMessage):
        //   { type:'system', subtype:'api_retry', attempt, max_retries, retry_delay_ms, error_status }
        if (message.type === 'progress' && message.subtype === 'api_retry') {
          const raw = (message.raw ?? {}) as Record<string, unknown>
          log.warn(
            {
              sessionId: managed.sessionId,
              provider: managed.provider,
              attempt: raw.attempt,
              maxRetries: raw.max_retries,
              retryDelayMs: raw.retry_delay_ms,
              errorStatus: raw.error_status,
            },
            'api retry',
          )
          this.emit('api-retry', { sessionId: managed.sessionId, detail: raw })
        }

        if (message.type === 'result') {
          managed.result = message
          managed.status = message.is_error ? 'error' : 'completed'
          managed.completedAt = new Date()
          managed.terminalReason = message.terminal_reason ?? null
          managed.providerSession = null
          managed.query = null
          this.emit('done', { sessionId: managed.sessionId, result: message })
          log.info(
            {
              sessionId: managed.sessionId,
              provider: managed.provider,
              status: managed.status,
              terminalReason: managed.terminalReason,
              turns: message.num_turns,
              cost: message.total_cost_usd,
            },
            'session completed',
          )

          // Extract knowledge + compress session output (non-blocking)
          if (!message.is_error) {
            const textContent = managed.messages
              .filter((m) => m.type === 'assistant' && m.content)
              .map((m) => m.content)
              .filter(Boolean)
              .join('\n')
            if (textContent.length > 100) {
              // Entity/observation extraction
              extractFromText(textContent.slice(0, 4000))
                .then((result) => {
                  if (result && (result.entities.length > 0 || result.observations.length > 0)) {
                    return processExtractionResult(result, {
                      boardId: managed.meta.boardId,
                      source: 'session',
                      sourceId: managed.sessionId,
                    })
                  }
                })
                .catch((err) => log.warn({ err }, 'session knowledge extraction failed'))

              // Session compression → archive
              compressSession(textContent)
                .then((summary) => {
                  if (!summary) return
                  return db.insert(sessionArchives).values({
                    sessionId: managed.sessionId,
                    boardId: managed.meta.boardId ?? null,
                    agentId: managed.meta.agentId ?? null,
                    summary: summary.summary,
                    keyDecisions: summary.keyDecisions,
                    keyOutcomes: summary.keyOutcomes,
                    errorPatterns: summary.errorPatterns,
                    tokenCost: message.total_cost_usd?.toString() ?? null,
                    turnCount: message.num_turns ?? null,
                    terminalReason: message.terminal_reason ?? null,
                    provider: managed.provider,
                  }).onConflictDoNothing()
                })
                .catch((err) => log.warn({ err }, 'session compression failed'))
            }
          }

          break // result is terminal
        }
      }
    } catch (err) {
      // Only transition to error if not already terminal (aborted/completed/error)
      if (managed.status === 'running') {
        managed.status = 'error'
        managed.completedAt = new Date()
        managed.providerSession = null
        managed.query = null
        log.error({ sessionId: managed.sessionId, error: String(err) }, 'session error')
        this.emit('done', { sessionId: managed.sessionId, error: String(err) })
      }
    }
  }

  abort(sessionId: string): boolean {
    const managed = this.findSession(sessionId)
    if (!managed || managed.status !== 'running') return false

    // Mark as aborted BEFORE aborting so consumeSession doesn't double-emit
    managed.status = 'aborted'
    managed.completedAt = new Date()

    // Use provider session's close for proper cleanup
    if (managed.providerSession) {
      managed.providerSession.close()
    } else {
      managed.abortController.abort()
    }
    managed.providerSession = null
    managed.query = null

    log.info({ sessionId: managed.sessionId }, 'session aborted')
    this.emit('done', { sessionId: managed.sessionId, aborted: true })
    return true
  }

  /**
   * Check if there's already an active session for a given board+callerContext.
   * Prevents duplicate spawns from rapid-fire calls.
   */
  hasActiveSessionFor(boardId: string, callerContext: string): boolean {
    for (const s of this.sessions.values()) {
      if (
        s.status === 'running' &&
        s.meta.boardId === boardId &&
        s.meta.callerContext === callerContext
      ) {
        return true
      }
    }
    return false
  }

  getSession(id: string): ManagedSession | undefined {
    return this.findSession(id)
  }

  getActiveSessions(): ManagedSession[] {
    return [...this.sessions.values()].filter((s) => s.status === 'running')
  }

  getAllSessions(): ManagedSession[] {
    return [...this.sessions.values()].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    )
  }

  pruneCompleted(maxAgeMs = 30 * 60 * 1000): number {
    const cutoff = Date.now() - maxAgeMs
    let pruned = 0
    for (const [id, session] of this.sessions) {
      if (
        session.status !== 'running' &&
        session.completedAt &&
        session.completedAt.getTime() < cutoff
      ) {
        // Ensure session is archived before pruning (safety net)
        if (session.status === 'completed' && session.result && !session.result.is_error) {
          db.select({ id: sessionArchives.id })
            .from(sessionArchives)
            .where(eq(sessionArchives.sessionId, session.sessionId))
            .limit(1)
            .then(([existing]) => {
              if (existing) return
              const textContent = session.messages
                .filter((m) => m.type === 'assistant' && m.content)
                .map((m) => m.content)
                .filter(Boolean)
                .join('\n')
              if (textContent.length <= 100) return
              return compressSession(textContent).then((summary) => {
                if (!summary) return
                return db.insert(sessionArchives).values({
                  sessionId: session.sessionId,
                  boardId: session.meta.boardId ?? null,
                  agentId: session.meta.agentId ?? null,
                  summary: summary.summary,
                  keyDecisions: summary.keyDecisions,
                  keyOutcomes: summary.keyOutcomes,
                  errorPatterns: summary.errorPatterns,
                  tokenCost: session.result?.total_cost_usd?.toString() ?? null,
                  turnCount: session.result?.num_turns ?? null,
                  terminalReason: session.result?.terminal_reason ?? null,
                  provider: session.provider,
                }).onConflictDoNothing()
              })
            })
            .catch(() => {})
        }

        this.sessions.delete(id)
        pruned++
      }
    }
    return pruned
  }

  // --- SDK session management functions (Claude-only) ---

  async listSdkSessions(options?: {
    dir?: string
    limit?: number
    offset?: number
  }): Promise<SDKSessionInfo[]> {
    try {
      return await sdkListSessions(options)
    } catch {
      return []
    }
  }

  async getSdkSessionInfo(
    sessionId: string,
    dir?: string,
  ): Promise<SDKSessionInfo | undefined> {
    try {
      return await sdkGetSessionInfo(sessionId, dir ? { dir } : undefined)
    } catch {
      return undefined
    }
  }

  async getSdkSessionMessages(
    sessionId: string,
    options?: { dir?: string; limit?: number; offset?: number },
  ): Promise<SessionMessage[]> {
    try {
      return await sdkGetSessionMessages(sessionId, options)
    } catch {
      return []
    }
  }

  async renameSession(sessionId: string, title: string, dir?: string): Promise<void> {
    await sdkRenameSession(sessionId, title, dir ? { dir } : undefined)
  }

  async tagSession(sessionId: string, tag: string | null, dir?: string): Promise<void> {
    await sdkTagSession(sessionId, tag, dir ? { dir } : undefined)
  }

  async forkSession(sessionId: string, options?: { upToMessageId?: string; title?: string; dir?: string }): Promise<{ sessionId: string }> {
    return sdkForkSession(sessionId, options)
  }

  /**
   * SDK 0.2.89+: List subagent IDs that ran in a session.
   * Reads from the session transcript file. Claude sessions only.
   */
  async listSessionSubagents(sessionId: string, dir?: string): Promise<string[]> {
    try {
      return await sdkListSubagents(sessionId, dir ? { dir } : undefined)
    } catch {
      return []
    }
  }

  /**
   * SDK 0.2.89+: Get messages for a specific subagent within a session.
   * Reads from the session transcript file. Claude sessions only.
   */
  async getSessionSubagentMessages(
    sessionId: string,
    agentId: string,
    options?: { dir?: string; limit?: number; offset?: number },
  ): Promise<SessionMessage[]> {
    try {
      return await sdkGetSubagentMessages(sessionId, agentId, options)
    } catch {
      return []
    }
  }

  getMcpServersForSpawn(projectDir?: string): Record<string, McpServerConfig> {
    return readMcpConfig(projectDir)
  }

  // --- Query control methods (Claude-only, require running session with query handle) ---

  private getClaudeQuery(sessionId: string): ReturnType<typeof query> | null {
    const managed = this.findSession(sessionId)
    if (!managed || managed.status !== 'running' || managed.provider !== 'claude') return null
    return managed.query
  }

  async interruptSession(sessionId: string): Promise<boolean> {
    const q = this.getClaudeQuery(sessionId)
    if (!q) return false
    try {
      await q.interrupt()
      return true
    } catch {
      return false
    }
  }

  async getSessionModels(sessionId: string): Promise<unknown[] | null> {
    const q = this.getClaudeQuery(sessionId)
    if (!q) return null
    try {
      return await q.supportedModels()
    } catch {
      return null
    }
  }

  async getSessionMcpStatus(sessionId: string): Promise<unknown | null> {
    const q = this.getClaudeQuery(sessionId)
    if (!q) return null
    try {
      return await q.mcpServerStatus()
    } catch {
      return null
    }
  }

  /**
   * SDK 0.2.86+: Real-time context window usage breakdown by category
   * (system prompt, tools, messages, MCP tools, memory files, etc.).
   * Only works on running Claude sessions.
   */
  async getSessionContextUsage(sessionId: string): Promise<unknown | null> {
    const q = this.getClaudeQuery(sessionId)
    if (!q) return null
    try {
      return await q.getContextUsage()
    } catch {
      return null
    }
  }

  async getAccountInfo(sessionId: string): Promise<unknown | null> {
    const q = this.getClaudeQuery(sessionId)
    if (!q) return null
    try {
      return await q.accountInfo()
    } catch {
      return null
    }
  }

  async setSessionModel(sessionId: string, model?: string): Promise<boolean> {
    const q = this.getClaudeQuery(sessionId)
    if (!q) return false
    try {
      await q.setModel(model)
      return true
    } catch {
      return false
    }
  }

  async setSessionPermissionMode(sessionId: string, mode: PermissionMode): Promise<boolean> {
    const q = this.getClaudeQuery(sessionId)
    if (!q) return false
    try {
      await q.setPermissionMode(mode)
      return true
    } catch {
      return false
    }
  }

  async applySessionSettings(sessionId: string, settings: Record<string, unknown>): Promise<boolean> {
    const q = this.getClaudeQuery(sessionId)
    if (!q) return false
    try {
      await q.applyFlagSettings(settings as Parameters<typeof q.applyFlagSettings>[0])
      return true
    } catch {
      return false
    }
  }

  async stopSessionTask(sessionId: string, taskId: string): Promise<boolean> {
    const q = this.getClaudeQuery(sessionId)
    if (!q) return false
    try {
      await q.stopTask(taskId)
      return true
    } catch {
      return false
    }
  }

  async setSessionMcpServers(sessionId: string, servers: Record<string, unknown>): Promise<unknown> {
    const q = this.getClaudeQuery(sessionId)
    if (!q) return null
    try {
      return await q.setMcpServers(servers as Parameters<typeof q.setMcpServers>[0])
    } catch {
      return null
    }
  }

  async rewindSessionFiles(sessionId: string, userMessageId: string, dryRun?: boolean): Promise<unknown> {
    const q = this.getClaudeQuery(sessionId)
    if (!q) return null
    try {
      return await q.rewindFiles(userMessageId, dryRun ? { dryRun } : undefined)
    } catch {
      return null
    }
  }

  async getSessionAgents(sessionId: string): Promise<unknown[] | null> {
    const q = this.getClaudeQuery(sessionId)
    if (!q) return null
    try {
      return await q.supportedAgents()
    } catch {
      return null
    }
  }

  async getSessionCommands(sessionId: string): Promise<unknown[] | null> {
    const q = this.getClaudeQuery(sessionId)
    if (!q) return null
    try {
      return await q.supportedCommands()
    } catch {
      return null
    }
  }

  destroy(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer)
      this.pruneTimer = null
    }
    for (const session of this.sessions.values()) {
      if (session.status === 'running') {
        this.abort(session.sessionId)
      }
    }
    this.removeAllListeners()
    log.info('session manager destroyed')
  }

  private findSession(id: string): ManagedSession | undefined {
    const direct = this.sessions.get(id)
    if (direct) return direct
    for (const session of this.sessions.values()) {
      if (session.sessionId === id) return session
    }
    return undefined
  }
}

// --- Singleton + backward-compatible exports ---

export const sessionManager = new AgentSessionManager()

// Re-export SDK session types for routes
export type { SDKSessionInfo, SessionMessage as SDKSessionMessage }

export function getAgentSdkStatus(): AgentSdkStatus {
  return sessionManager.getStatus()
}

export async function spawnAgentSession(params: {
  prompt: string
  provider?: Provider
  model?: string
  maxTurns?: number
  permissionMode?: string
}): Promise<{ sessionId: string; status: string }> {
  return await sessionManager.spawn({
    ...params,
    permissionMode: (params.permissionMode as PermissionMode) ?? 'plan',
  })
}
