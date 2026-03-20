import { EventEmitter } from 'node:events'
import { execSync } from 'node:child_process'
import pino from 'pino'
import {
  query,
  listSessions as sdkListSessions,
  getSessionInfo as sdkGetSessionInfo,
  getSessionMessages as sdkGetSessionMessages,
  renameSession as sdkRenameSession,
  tagSession as sdkTagSession,
  forkSession as sdkForkSession,
  type SDKMessage,
  type SDKResultMessage,
  type Options,
  type PermissionMode,
  type SDKSessionInfo,
  type SessionMessage,
} from '@anthropic-ai/claude-agent-sdk'
import { config } from '../../config.js'
import { getAgent } from './agent-discovery.js'
import { readMcpConfig, type McpServerConfig } from './config-reader.js'
import { getScript } from './script-discovery.js'
import { buildScriptMcpConfig } from './script-mcp-bridge.js'
import { retrieveContextWithTrace } from '../context-graph/context-retriever.js'
import { buildContextPrompt } from '../context-graph/prompt-builder.js'
import { extractFromText, compressSession } from '../context-graph/extractor.js'
import { processExtractionResult } from '../context-graph/graph-store.js'
import { db } from '../../db/client.js'
import { sessionArchives } from '../../db/schema.js'
import { eq } from 'drizzle-orm'

const log = pino({ name: 'agent-sdk' })

// --- Types ---

export interface SpawnParams {
  prompt: string
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
  status: SessionStatus
  messages: SDKMessage[]
  result?: SDKResultMessage
  query: ReturnType<typeof query> | null
  abortController: AbortController
  createdAt: Date
  completedAt?: Date
  meta: { boardId?: string; taskId?: string; callerContext?: string; agentId?: string }
}

export interface AgentSdkStatus {
  available: boolean
  cliInstalled: boolean
  apiKeyConfigured: boolean
  model: string | null
  activeSessions: number
}

// --- Session Manager ---

class AgentSessionManager extends EventEmitter {
  private sessions = new Map<string, ManagedSession>()
  private cliInstalled: boolean | null = null
  private pruneTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    super()
    this.pruneTimer = setInterval(() => this.pruneCompleted(), 10 * 60 * 1000)
  }

  checkCli(): boolean {
    if (this.cliInstalled !== null) return this.cliInstalled
    try {
      execSync('claude --version', { stdio: 'pipe', timeout: 5000 })
      this.cliInstalled = true
    } catch {
      this.cliInstalled = false
    }
    return this.cliInstalled
  }

  getStatus(): AgentSdkStatus {
    const cliInstalled = this.checkCli()
    return {
      available: cliInstalled,
      cliInstalled,
      apiKeyConfigured: !!process.env.ANTHROPIC_API_KEY,
      model: cliInstalled ? 'claude-sonnet-4-6' : null,
      activeSessions: this.getActiveSessions().length,
    }
  }

  async spawn(params: SpawnParams): Promise<{ sessionId: string; status: SessionStatus }> {
    if (!this.checkCli()) {
      throw new Error('Claude CLI not installed — orchestration mode unavailable')
    }

    const abortController = new AbortController()

    const options: Options = {
      abortController,
      permissionMode: params.permissionMode ?? 'plan',
      persistSession: params.persistSession ?? false,
      // Identify this SDK consumer in User-Agent
      env: {
        ...process.env,
        CLAUDE_AGENT_SDK_CLIENT_APP: 'claude-code-operator/1.0',
        ...params.env,
      },
    }

    // Core options
    if (params.model) options.model = params.model
    if (params.maxTurns) options.maxTurns = params.maxTurns
    if (params.maxBudgetUsd) options.maxBudgetUsd = params.maxBudgetUsd
    if (params.cwd) options.cwd = params.cwd
    if (params.tools) options.tools = params.tools
    if (params.disallowedTools) options.disallowedTools = params.disallowedTools
    if (params.resume) options.resume = params.resume
    if (params.sessionId) options.sessionId = params.sessionId
    if (params.systemPrompt) options.systemPrompt = params.systemPrompt
    if (params.additionalDirectories) options.additionalDirectories = params.additionalDirectories
    if (params.fallbackModel) options.fallbackModel = params.fallbackModel
    if (params.enableFileCheckpointing) options.enableFileCheckpointing = true
    if (params.outputFormat) options.outputFormat = params.outputFormat

    // Advanced capabilities
    if (params.effort) options.effort = params.effort
    if (params.includePartialMessages) options.includePartialMessages = true
    if (params.agentProgressSummaries) options.agentProgressSummaries = true
    if (params.promptSuggestions) options.promptSuggestions = true

    // Agent resolution: if an agent name is given, look up its definition from
    // ~/.claude/agents/ and inject its config. The SDK's `agent` option expects
    // the agent to be defined either in `options.agents` or in the user's settings.
    if (params.agent) {
      const agentDef = getAgent(params.agent)
      if (agentDef) {
        options.agent = agentDef.id
        options.agents = {
          ...params.agents,
          [agentDef.id]: {
            description: agentDef.description ?? agentDef.name,
            prompt: agentDef.promptContent,
            ...(agentDef.tools.length > 0 ? { tools: agentDef.tools } : {}),
            ...(agentDef.model ? { model: agentDef.model } : {}),
            ...(agentDef.maxTurns ? { maxTurns: agentDef.maxTurns } : {}),
          },
        }
        // Apply agent-level overrides unless caller explicitly set them
        if (!params.model && agentDef.model) options.model = agentDef.model
        if (!params.maxTurns && agentDef.maxTurns) options.maxTurns = agentDef.maxTurns
        if (!params.permissionMode && agentDef.permissionMode) {
          options.permissionMode = agentDef.permissionMode as PermissionMode
        }
      } else {
        // Agent not found locally — pass the name through, SDK will look in settings
        options.agent = params.agent
      }
    } else if (params.agents) {
      options.agents = params.agents
    }

    // MCP server injection
    if (params.mcpServers && Object.keys(params.mcpServers).length > 0) {
      options.mcpServers = params.mcpServers as Options['mcpServers']
    }

    // CLI script injection: resolve script IDs → build MCP server config → inject
    if (params.scripts && params.scripts.length > 0) {
      const resolvedScripts = params.scripts
        .map((id) => getScript(id))
        .filter((s): s is NonNullable<typeof s> => s !== null)

      if (resolvedScripts.length > 0) {
        const scriptMcpConfig = buildScriptMcpConfig(resolvedScripts)
        if (scriptMcpConfig) {
          options.mcpServers = {
            ...options.mcpServers,
            ...scriptMcpConfig,
          } as Options['mcpServers']
          log.info(
            { scripts: resolvedScripts.map((s) => s.id) },
            'injecting CLI scripts as MCP tools',
          )
        }
      }
    }

    // Inject claude-mem MCP server into spawned sessions for observation capture
    try {
      const allMcpConfig = readMcpConfig()
      if (allMcpConfig['mcp-search']) {
        options.mcpServers = {
          ...options.mcpServers,
          'mcp-search': allMcpConfig['mcp-search'],
        } as Options['mcpServers']
      }
    } catch {
      // claude-mem not configured — fine
    }

    // Inject agent-bus MCP server for inter-agent communication
    if (params.boardId) {
      const busWrapperPath = new URL('./agent-bus-mcp.mjs', import.meta.url).pathname
      options.mcpServers = {
        ...options.mcpServers,
        'agent-bus': {
          command: 'node',
          args: [busWrapperPath],
          env: {
            AGENT_BUS_API_URL: config.BASE_URL,
            AGENT_BUS_AGENT_ID: params.agent ?? params.callerContext ?? 'anonymous',
            AGENT_BUS_BOARD_ID: params.boardId,
            AGENT_BUS_TOKEN: config.OPERATOR_TOKEN,
          },
        },
      } as Options['mcpServers']
    }

    // Retrieve and inject contextual knowledge (context graph + session archives)
    if (params.boardId || params.taskId) {
      try {
        const { blocks: contextBlocks, trace } = await retrieveContextWithTrace({
          boardId: params.boardId,
          taskId: params.taskId,
          agentId: params.agent,
          prompt: params.prompt,
        })
        if (contextBlocks.length > 0) {
          const contextPrompt = buildContextPrompt(contextBlocks)
          if (typeof options.systemPrompt === 'string') {
            options.systemPrompt = contextPrompt + '\n\n' + options.systemPrompt
          } else if (options.systemPrompt && typeof options.systemPrompt === 'object' && 'type' in options.systemPrompt && options.systemPrompt.type === 'preset') {
            (options.systemPrompt as any).append = contextPrompt + '\n\n' + ((options.systemPrompt as any).append ?? '')
          } else if (!options.systemPrompt) {
            options.systemPrompt = contextPrompt
          }
          log.info(
            { intent: trace.intent, blocks: trace.selectedBlocks, chars: trace.totalChars, reranked: trace.reranked, ms: trace.durationMs },
            'context injected',
          )
        }
      } catch (err) {
        log.warn({ err }, 'context retrieval failed, continuing without context')
      }
    }

    const session = query({ prompt: params.prompt, options })

    const placeholderId = crypto.randomUUID()

    const managed: ManagedSession = {
      sessionId: placeholderId,
      status: 'running',
      messages: [],
      query: session,
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
    this.consumeSession(placeholderId, session)

    log.info({ sessionId: placeholderId, callerContext: params.callerContext, agent: params.agent }, 'session spawned')

    return { sessionId: placeholderId, status: 'running' }
  }

  private async consumeSession(
    id: string,
    session: AsyncGenerator<SDKMessage, void>,
  ) {
    const managed = this.sessions.get(id)
    if (!managed) return

    let remapped = false

    try {
      for await (const message of session) {
        // If already aborted, don't process further messages
        if (managed.status === 'aborted') break

        // Remap session ID from the first SDK message (once only)
        if (
          !remapped &&
          'session_id' in message &&
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

        if (message.type === 'result') {
          managed.result = message
          managed.status = message.is_error ? 'error' : 'completed'
          managed.completedAt = new Date()
          managed.query = null
          this.emit('done', { sessionId: managed.sessionId, result: message })
          log.info(
            { sessionId: managed.sessionId, status: managed.status, turns: message.num_turns, cost: message.total_cost_usd },
            'session completed',
          )

          // Extract knowledge + compress session output (non-blocking)
          if (!message.is_error) {
            const textContent = managed.messages
              .filter((m) => m.type === 'assistant' && 'content' in m)
              .map((m) =>
                (m as any).content
                  ?.filter?.((b: any) => b.type === 'text')
                  ?.map((b: any) => b.text)
                  ?.join('\n'),
              )
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

              // Enhancement 2: Session compression → archive
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

    // Use Query.close() for proper subprocess + MCP transport cleanup
    if (managed.query && typeof managed.query.close === 'function') {
      managed.query.close()
    } else {
      managed.abortController.abort()
    }
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
        // Enhancement 2: Ensure session is archived before pruning
        // (archiving happens at completion time; this is a safety net)
        if (session.status === 'completed' && session.result && !session.result.is_error) {
          // Check if already archived (avoid redundant Haiku call)
          db.select({ id: sessionArchives.id })
            .from(sessionArchives)
            .where(eq(sessionArchives.sessionId, session.sessionId))
            .limit(1)
            .then(([existing]) => {
              if (existing) return // Already archived at completion time
              const textContent = session.messages
                .filter((m) => m.type === 'assistant' && 'content' in m)
                .map((m) =>
                  (m as any).content
                    ?.filter?.((b: any) => b.type === 'text')
                    ?.map((b: any) => b.text)
                    ?.join('\n'),
                )
                .filter(Boolean)
                .join('\n')
              if (textContent.length <= 100) return
              return compressSession(textContent).then((summary) => {
                if (!summary) return
                return db.insert(sessionArchives).values({
                  sessionId: session.sessionId,
                  boardId: session.meta.boardId ?? null,
                  agentId: session.meta.callerContext ?? null,
                  summary: summary.summary,
                  keyDecisions: summary.keyDecisions,
                  keyOutcomes: summary.keyOutcomes,
                  errorPatterns: summary.errorPatterns,
                  tokenCost: session.result?.total_cost_usd?.toString() ?? null,
                  turnCount: session.result?.num_turns ?? null,
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

  // --- SDK session management functions ---

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

  getMcpServersForSpawn(projectDir?: string): Record<string, McpServerConfig> {
    return readMcpConfig(projectDir)
  }

  // --- Query control methods (for running sessions) ---

  async interruptSession(sessionId: string): Promise<boolean> {
    const managed = this.findSession(sessionId)
    if (!managed?.query || managed.status !== 'running') return false
    try {
      await managed.query.interrupt()
      return true
    } catch {
      return false
    }
  }

  async getSessionModels(sessionId: string): Promise<unknown[] | null> {
    const managed = this.findSession(sessionId)
    if (!managed?.query || managed.status !== 'running') return null
    try {
      return await managed.query.supportedModels()
    } catch {
      return null
    }
  }

  async getSessionMcpStatus(sessionId: string): Promise<unknown | null> {
    const managed = this.findSession(sessionId)
    if (!managed?.query || managed.status !== 'running') return null
    try {
      return await managed.query.mcpServerStatus()
    } catch {
      return null
    }
  }

  async getAccountInfo(sessionId: string): Promise<unknown | null> {
    const managed = this.findSession(sessionId)
    if (!managed?.query || managed.status !== 'running') return null
    try {
      return await managed.query.accountInfo()
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
  model?: string
  maxTurns?: number
  permissionMode?: string
}): Promise<{ sessionId: string; status: string }> {
  return await sessionManager.spawn({
    ...params,
    permissionMode: (params.permissionMode as PermissionMode) ?? 'plan',
  })
}
