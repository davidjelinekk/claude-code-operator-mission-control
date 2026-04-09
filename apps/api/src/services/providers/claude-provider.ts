import { execSync } from 'node:child_process'
import pino from 'pino'
import {
  query,
  type SDKMessage,
  type Options,
  type PermissionMode,
} from '@anthropic-ai/claude-agent-sdk'
import type { NormalizedMessage } from '@claude-code-operator/shared-types'
import type { SessionProvider, ProviderSession, ProviderSpawnParams } from './types.js'
import { config } from '../../config.js'
import { getAgent } from '../claude-code/agent-discovery.js'
import { readMcpConfig, type McpServerConfig } from '../claude-code/config-reader.js'
import { getScript } from '../claude-code/script-discovery.js'
import { buildScriptMcpConfig } from '../claude-code/script-mcp-bridge.js'
import { createToolGovernanceHandler, createToolLoggingHooks } from '../claude-code/tool-governance.js'
import { retrieveContextWithTrace } from '../context-graph/context-retriever.js'
import { buildContextPrompt } from '../context-graph/prompt-builder.js'

const log = pino({ name: 'claude-provider' })

export class ClaudeProvider implements SessionProvider {
  readonly name = 'claude' as const
  private cliInstalled: boolean | null = null

  checkAvailable(): boolean {
    if (this.cliInstalled !== null) return this.cliInstalled
    try {
      execSync('claude --version', { stdio: 'pipe', timeout: 5000 })
      this.cliInstalled = true
    } catch {
      this.cliInstalled = false
    }
    return this.cliInstalled
  }

  getStatus() {
    const cliInstalled = this.checkAvailable()
    return {
      provider: 'claude' as const,
      available: cliInstalled,
      cliInstalled,
      defaultModel: cliInstalled ? 'claude-sonnet-4-6' : null,
    }
  }

  async spawn(params: ProviderSpawnParams): Promise<ProviderSession> {
    if (!this.checkAvailable()) {
      throw new Error('Claude CLI not installed — orchestration mode unavailable')
    }

    const raw = params.raw as Record<string, any>
    const options = await this.buildOptions(params, raw)

    const session = query({ prompt: params.prompt, options })

    return {
      messages: this.normalizeStream(session),
      abort: () => params.abortController.abort(),
      close: () => {
        if (typeof session.close === 'function') {
          session.close()
        } else {
          params.abortController.abort()
        }
      },
      queryHandle: session,
    }
  }

  private async buildOptions(params: ProviderSpawnParams, raw: Record<string, any>): Promise<Options> {
    const options: Options = {
      abortController: params.abortController,
      permissionMode: (raw.permissionMode as PermissionMode) ?? 'plan',
      persistSession: raw.persistSession ?? false,
      env: {
        HOME: process.env.HOME,
        PATH: process.env.PATH,
        SHELL: process.env.SHELL,
        USER: process.env.USER,
        LANG: process.env.LANG,
        TERM: process.env.TERM,
        NODE_ENV: process.env.NODE_ENV,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        CLAUDE_AGENT_SDK_CLIENT_APP: 'claude-code-operator/1.0',
        ...params.env,
      },
    }

    // Core options
    if (params.model) options.model = params.model
    if (raw.maxTurns) options.maxTurns = raw.maxTurns
    if (raw.maxBudgetUsd) options.maxBudgetUsd = raw.maxBudgetUsd
    // SDK 0.2.84+: API-side token budget awareness (beta header applied below).
    if (raw.taskBudget) options.taskBudget = raw.taskBudget as Options['taskBudget']
    if (params.cwd) options.cwd = params.cwd
    if (raw.tools) options.tools = raw.tools
    if (raw.disallowedTools) options.disallowedTools = raw.disallowedTools
    if (raw.resume) options.resume = raw.resume
    if (raw.sessionId) options.sessionId = raw.sessionId
    if (params.systemPrompt) options.systemPrompt = params.systemPrompt as Options['systemPrompt']
    if (raw.additionalDirectories) options.additionalDirectories = raw.additionalDirectories
    if (raw.fallbackModel) options.fallbackModel = raw.fallbackModel
    if (raw.enableFileCheckpointing) options.enableFileCheckpointing = true
    if (raw.outputFormat) options.outputFormat = raw.outputFormat

    // Advanced capabilities
    if (raw.effort) options.effort = raw.effort
    if (raw.includePartialMessages) options.includePartialMessages = true
    if (raw.agentProgressSummaries) options.agentProgressSummaries = true
    if (raw.promptSuggestions) options.promptSuggestions = true

    // Sandbox mode
    // SDK 0.2.91+: failIfUnavailable defaults to true when enabled:true is passed.
    // We set it explicitly to false to preserve pre-0.2.91 behavior (graceful
    // degradation on missing sandbox deps). Callers who need strict sandboxing
    // can pass the full sandbox object with failIfUnavailable:true.
    if (params.sandbox) {
      if (typeof params.sandbox === 'boolean') {
        options.sandbox = {
          enabled: params.sandbox,
          autoAllowBashIfSandboxed: true,
          failIfUnavailable: false,
        } as Options['sandbox']
      } else {
        const explicit = params.sandbox as { failIfUnavailable?: boolean }
        options.sandbox = {
          ...params.sandbox,
          failIfUnavailable: explicit.failIfUnavailable ?? false,
        } as Options['sandbox']
      }
    }

    // Settings injection
    if (raw.settings) {
      options.settings = raw.settings as Options['settings']
    }

    // Beta features. Merge caller-provided betas with any auto-required ones
    // (e.g., task-budgets-2026-03-13 when taskBudget is set).
    {
      const betas = new Set<string>(Array.isArray(raw.betas) ? (raw.betas as string[]) : [])
      if (raw.taskBudget) betas.add('task-budgets-2026-03-13')
      if (betas.size > 0) {
        options.betas = [...betas] as Options['betas']
      }
    }

    // Setting sources
    if (raw.settingSources) {
      options.settingSources = raw.settingSources as Options['settingSources']
    }

    // Allowed tools
    if (raw.allowedTools) {
      options.allowedTools = raw.allowedTools
    }

    // Thinking/reasoning behavior
    if (raw.thinking) options.thinking = raw.thinking as Options['thinking']
    if (raw.resumeSessionAt) options.resumeSessionAt = raw.resumeSessionAt
    if (raw.forkSession) options.forkSession = raw.forkSession

    // Debug logging
    if (raw.debug) options.debug = true
    if (raw.debugFile) options.debugFile = raw.debugFile

    // Plugins
    if (raw.plugins && raw.plugins.length > 0) {
      options.plugins = raw.plugins as Options['plugins']
    }

    // Strict MCP config validation
    options.strictMcpConfig = true

    // Debug stderr capture
    if (raw.debug || raw.debugFile) {
      options.stderr = (data: string) => {
        log.debug({ data: data.slice(0, 500) }, 'session stderr')
      }
    }

    // Agent resolution
    if (raw.agent) {
      const agentDef = getAgent(raw.agent)
      if (agentDef) {
        options.agent = agentDef.id
        options.agents = {
          ...raw.agents,
          [agentDef.id]: {
            description: agentDef.description ?? agentDef.name,
            prompt: agentDef.promptContent,
            ...(agentDef.tools.length > 0 ? { tools: agentDef.tools } : {}),
            ...(agentDef.model ? { model: agentDef.model } : {}),
            ...(agentDef.maxTurns ? { maxTurns: agentDef.maxTurns } : {}),
          },
        }
        if (!params.model && agentDef.model) options.model = agentDef.model
        if (!raw.maxTurns && agentDef.maxTurns) options.maxTurns = agentDef.maxTurns
        if (!raw.permissionMode && agentDef.permissionMode) {
          options.permissionMode = agentDef.permissionMode as PermissionMode
        }
      } else {
        options.agent = raw.agent
      }
    } else if (raw.agents) {
      options.agents = raw.agents
    }

    // MCP server injection
    if (raw.mcpServers && Object.keys(raw.mcpServers).length > 0) {
      options.mcpServers = raw.mcpServers as Options['mcpServers']
    }

    // CLI script injection
    if (raw.scripts && raw.scripts.length > 0) {
      const resolvedScripts = (raw.scripts as string[])
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

    // Inject claude-mem MCP server
    try {
      const allMcpConfig = readMcpConfig()
      if (allMcpConfig['mcp-search']) {
        options.mcpServers = {
          ...options.mcpServers,
          'mcp-search': allMcpConfig['mcp-search'],
        } as Options['mcpServers']
      }
    } catch {
      // claude-mem not configured
    }

    // Inject agent-bus MCP server for inter-agent communication
    if (raw.boardId) {
      const busWrapperPath = new URL('../claude-code/agent-bus-mcp.mjs', import.meta.url).pathname
      options.mcpServers = {
        ...options.mcpServers,
        'agent-bus': {
          command: 'node',
          args: [busWrapperPath],
          env: {
            AGENT_BUS_API_URL: config.BASE_URL,
            AGENT_BUS_AGENT_ID: raw.agent ?? raw.callerContext ?? 'anonymous',
            AGENT_BUS_BOARD_ID: raw.boardId,
            AGENT_BUS_TOKEN: config.OPERATOR_TOKEN,
          },
        },
      } as Options['mcpServers']
    }

    // Context graph injection
    if (raw.boardId || raw.taskId) {
      try {
        const { blocks: contextBlocks, trace } = await retrieveContextWithTrace({
          boardId: raw.boardId,
          taskId: raw.taskId,
          agentId: raw.agent,
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

    // Tool governance
    if (raw.boardId) {
      options.canUseTool = createToolGovernanceHandler(raw.boardId, raw.agent)
      const loggingHooks = createToolLoggingHooks(raw.boardId, raw.agent)
      options.hooks = { ...options.hooks, ...loggingHooks }
    }

    return options
  }

  private async *normalizeStream(stream: AsyncGenerator<SDKMessage, void>): AsyncGenerator<NormalizedMessage, void> {
    for await (const msg of stream) {
      yield this.toNormalized(msg)
    }
  }

  private toNormalized(msg: SDKMessage): NormalizedMessage {
    const base = {
      provider: 'claude' as const,
      session_id: 'session_id' in msg ? (msg as any).session_id : undefined,
      uuid: 'uuid' in msg ? (msg as any).uuid : undefined,
      raw: msg,
    }

    if (msg.type === 'result') {
      return {
        ...base,
        type: 'result',
        content: typeof (msg as any).result === 'string' ? (msg as any).result : undefined,
        is_error: (msg as any).is_error ?? false,
        total_cost_usd: (msg as any).total_cost_usd ?? null,
        num_turns: (msg as any).num_turns ?? null,
        // SDK 0.2.91+: terminal_reason exposes *why* the loop terminated
        terminal_reason: (msg as any).terminal_reason ?? null,
      }
    }

    if (msg.type === 'assistant') {
      const content = (msg as any).content
      const text = Array.isArray(content)
        ? content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
        : typeof content === 'string' ? content : undefined
      return { ...base, type: 'assistant', content: text }
    }

    if (msg.type === 'user') {
      return { ...base, type: 'user', content: typeof (msg as any).content === 'string' ? (msg as any).content : undefined }
    }

    // System messages: preserve subtype (SDK 0.2.77+ api_retry, init, task_progress, etc.)
    if (msg.type === 'system') {
      return { ...base, type: 'progress', subtype: (msg as any).subtype ?? 'system' }
    }

    // Map anything else as progress
    return { ...base, type: 'progress', subtype: msg.type }
  }
}
