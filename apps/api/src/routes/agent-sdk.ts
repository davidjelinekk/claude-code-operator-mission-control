import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { NormalizedMessage } from '@claude-code-operator/shared-types'
import {
  sessionManager,
  getAgentSdkStatus,
  type SDKSessionInfo,
} from '../services/claude-code/agent-sdk-client.js'
import { detectAvailableProviders } from '../services/providers/registry.js'
import { listSessions } from '../services/claude-code/session-parser.js'
import { getSessionUser, safeTokenMatch } from '../lib/auth.js'
import { config } from '../config.js'

export const agentSdkRouter = new Hono()

// --- Shared SSE auth helper ---

async function authenticateSSE(c: { req: { header: (n: string) => string | undefined; query: (n: string) => string | undefined } }): Promise<boolean> {
  const authHeader = c.req.header('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    if (safeTokenMatch(token, config.OPERATOR_TOKEN)) return true
    const user = await getSessionUser(token)
    if (user) return true
  }
  const queryToken = c.req.query('token')
  if (queryToken) {
    if (safeTokenMatch(queryToken, config.OPERATOR_TOKEN)) return true
    const user = await getSessionUser(queryToken)
    if (user) return true
  }
  return false
}

// --- GET /status ---
agentSdkRouter.get('/status', async (c) => {
  const status = getAgentSdkStatus()
  return c.json(status)
})

// --- GET /providers ---
agentSdkRouter.get('/providers', async (c) => {
  return c.json(detectAvailableProviders())
})

// --- POST /spawn ---
agentSdkRouter.post(
  '/spawn',
  zValidator(
    'json',
    z.object({
      provider: z.enum(['claude', 'codex', 'gemini']).optional(),
      prompt: z.string().min(1),
      model: z.string().optional(),
      maxTurns: z.number().optional(),
      permissionMode: z.enum(['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk', 'auto']).optional(),
      taskBudget: z.object({
        total: z.number(),
      }).optional(),
      tools: z.array(z.string()).optional(),
      disallowedTools: z.array(z.string()).optional(),
      cwd: z.string().optional(),
      systemPrompt: z.union([
        z.string(),
        z.object({
          type: z.literal('preset'),
          preset: z.literal('claude_code'),
          append: z.string().optional(),
        }),
      ]).optional(),
      agent: z.string().optional(),
      agents: z.record(z.object({
        description: z.string(),
        prompt: z.string(),
        tools: z.array(z.string()).optional(),
        model: z.string().optional(),
      })).optional(),
      maxBudgetUsd: z.number().optional(),
      persistSession: z.boolean().optional(),
      includePartialMessages: z.boolean().optional(),
      agentProgressSummaries: z.boolean().optional(),
      effort: z.enum(['low', 'medium', 'high', 'max']).optional(),
      promptSuggestions: z.boolean().optional(),
      fallbackModel: z.string().optional(),
      additionalDirectories: z.array(z.string()).optional(),
      enableFileCheckpointing: z.boolean().optional(),
      outputFormat: z.object({
        type: z.literal('json_schema'),
        schema: z.record(z.unknown()),
      }).optional(),
      scripts: z.array(z.string()).optional(),
      sandbox: z.union([
        z.boolean(),
        z.object({
          enabled: z.boolean(),
          failIfUnavailable: z.boolean().optional(),
          autoAllowBashIfSandboxed: z.boolean().optional(),
          network: z.object({
            allowLocalBinding: z.boolean().optional(),
            allowUnixSockets: z.array(z.string()).optional(),
          }).optional(),
        }),
      ]).optional(),
      settings: z.record(z.unknown()).optional(),
      betas: z.array(z.string()).optional(),
      settingSources: z.array(z.enum(['user', 'project', 'local'])).optional(),
      allowedTools: z.array(z.string()).optional(),
      thinking: z.union([
        z.object({ type: z.literal('adaptive') }),
        z.object({ type: z.literal('enabled'), budgetTokens: z.number() }),
        z.object({ type: z.literal('disabled') }),
      ]).optional(),
      resumeSessionAt: z.string().optional(),
      forkSession: z.boolean().optional(),
      debug: z.boolean().optional(),
      debugFile: z.string().optional(),
      plugins: z.array(z.object({
        type: z.literal('local'),
        path: z.string().min(1),
      })).optional(),
      resume: z.string().optional(),
      sessionId: z.string().optional(),
      boardId: z.string().optional(),
      taskId: z.string().optional(),
    }),
  ),
  async (c) => {
    const body = c.req.valid('json')
    try {
      const result = await sessionManager.spawn(body)
      return c.json(result, 201)
    } catch (err) {
      return c.json({ error: String(err) }, 503)
    }
  },
)

// --- GET /sessions ---
agentSdkRouter.get('/sessions', async (c) => {
  // Return all in-memory sessions (active + recently completed/errored/aborted)
  const active = sessionManager.getAllSessions().map((s) => ({
    sessionId: s.sessionId,
    provider: s.provider,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
    completedAt: s.completedAt?.toISOString() ?? null,
    meta: s.meta,
    messageCount: s.messages.length,
    terminalReason: s.terminalReason ?? null,
  }))

  // Use SDK's richer session listing when available, fall back to our parser
  let historical: (SDKSessionInfo | ReturnType<typeof listSessions>[number])[]
  try {
    historical = await sessionManager.listSdkSessions({ limit: 50 })
  } catch {
    historical = listSessions().slice(0, 50)
  }

  return c.json({ active, historical })
})

// --- GET /sessions/:id ---
agentSdkRouter.get('/sessions/:id', async (c) => {
  const id = c.req.param('id')

  // Check in-memory active/recent sessions first
  const session = sessionManager.getSession(id)
  if (session) {
    return c.json({
      sessionId: session.sessionId,
      provider: session.provider,
      status: session.status,
      createdAt: session.createdAt.toISOString(),
      completedAt: session.completedAt?.toISOString() ?? null,
      meta: session.meta,
      messageCount: session.messages.length,
      terminalReason: session.terminalReason ?? null,
      messages: session.messages.map((m) => ({
        type: m.type,
        provider: m.provider,
        ...(m.session_id ? { session_id: m.session_id } : {}),
        ...(m.uuid ? { uuid: m.uuid } : {}),
        ...(m.type === 'assistant' && m.content ? { content: m.content } : {}),
      })),
      result: formatResult(session.result),
    })
  }

  // Fall back to SDK's historical session data
  const sdkInfo = await sessionManager.getSdkSessionInfo(id)
  if (!sdkInfo) return c.json({ error: 'Session not found' }, 404)

  const messages = await sessionManager.getSdkSessionMessages(id, { limit: 200 })

  return c.json({
    sessionId: sdkInfo.sessionId,
    status: 'completed',
    summary: sdkInfo.summary,
    customTitle: sdkInfo.customTitle,
    firstPrompt: sdkInfo.firstPrompt,
    gitBranch: sdkInfo.gitBranch,
    cwd: sdkInfo.cwd,
    lastModified: new Date(sdkInfo.lastModified).toISOString(),
    messageCount: messages.length,
    messages: messages.map((m) => ({
      type: m.type,
      uuid: m.uuid,
      session_id: m.session_id,
    })),
  })
})

// --- POST /sessions/:id/abort ---
agentSdkRouter.post('/sessions/:id/abort', async (c) => {
  const id = c.req.param('id')
  const aborted = sessionManager.abort(id)
  if (!aborted) return c.json({ error: 'Session not found or not running' }, 404)
  return c.json({ ok: true, sessionId: id })
})

// --- GET /sessions/:id/stream ---
agentSdkRouter.get('/sessions/:id/stream', async (c) => {
  if (!(await authenticateSSE(c))) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const id = c.req.param('id')
  const session = sessionManager.getSession(id)
  if (!session) return c.json({ error: 'Session not found' }, 404)

  const stream = new ReadableStream({
    start(controller) {
      let closed = false
      const encode = (data: string) => new TextEncoder().encode(data)

      const close = () => {
        if (closed) return
        closed = true
        cleanup()
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }

      // Subscribe BEFORE replay. Since start() runs synchronously and the
      // consumeSession async loop can't interleave, no duplicates are possible.
      // The listener only fires for messages arriving AFTER replay completes.

      const onMessage = (data: { sessionId: string; message: NormalizedMessage }) => {
        if (closed || data.sessionId !== session.sessionId) return
        controller.enqueue(
          encode(`event: message\ndata: ${JSON.stringify(formatStreamMessage(data.message))}\n\n`),
        )
      }

      const onDone = (data: { sessionId: string }) => {
        if (closed || data.sessionId !== session.sessionId) return
        controller.enqueue(
          encode(
            `event: done\ndata: ${JSON.stringify({ status: session.status, result: formatResult(session.result) })}\n\n`,
          ),
        )
        close()
      }

      sessionManager.on('message', onMessage)
      sessionManager.on('done', onDone)

      // Replay existing messages. Bound is captured before any async work.
      const replayCount = session.messages.length
      for (let i = 0; i < replayCount && !closed; i++) {
        controller.enqueue(
          encode(`event: message\ndata: ${JSON.stringify(formatStreamMessage(session.messages[i]))}\n\n`),
        )
      }

      // If already done, send result and close
      if (session.status !== 'running') {
        controller.enqueue(
          encode(
            `event: done\ndata: ${JSON.stringify({ status: session.status, result: formatResult(session.result) })}\n\n`,
          ),
        )
        close()
        return
      }

      const pingInterval = setInterval(() => {
        if (!closed) controller.enqueue(encode(': ping\n\n'))
      }, 15_000)

      const abortCheck = setInterval(() => {
        if (c.req.raw.signal?.aborted) close()
      }, 1000)

      function cleanup() {
        sessionManager.off('message', onMessage)
        sessionManager.off('done', onDone)
        clearInterval(pingInterval)
        clearInterval(abortCheck)
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
})

// --- POST /sessions/:id/interrupt ---
agentSdkRouter.post('/sessions/:id/interrupt', async (c) => {
  const id = c.req.param('id')
  const ok = await sessionManager.interruptSession(id)
  if (!ok) return c.json({ error: 'Session not found or not running' }, 404)
  return c.json({ ok: true })
})

// --- POST /sessions/:id/set-model ---
agentSdkRouter.post(
  '/sessions/:id/set-model',
  zValidator('json', z.object({ model: z.string().optional() })),
  async (c) => {
    const id = c.req.param('id')
    const { model } = c.req.valid('json')
    const ok = await sessionManager.setSessionModel(id, model)
    if (!ok) return c.json({ error: 'Session not found or not running' }, 404)
    return c.json({ ok: true })
  },
)

// --- POST /sessions/:id/set-permission-mode ---
agentSdkRouter.post(
  '/sessions/:id/set-permission-mode',
  zValidator('json', z.object({ mode: z.enum(['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk', 'auto']) })),
  async (c) => {
    const id = c.req.param('id')
    const { mode } = c.req.valid('json')
    const ok = await sessionManager.setSessionPermissionMode(id, mode)
    if (!ok) return c.json({ error: 'Session not found or not running' }, 404)
    return c.json({ ok: true })
  },
)

// --- POST /sessions/:id/apply-settings ---
agentSdkRouter.post(
  '/sessions/:id/apply-settings',
  zValidator('json', z.object({ settings: z.record(z.unknown()) })),
  async (c) => {
    const id = c.req.param('id')
    const { settings } = c.req.valid('json')
    const ok = await sessionManager.applySessionSettings(id, settings)
    if (!ok) return c.json({ error: 'Session not found or not running' }, 404)
    return c.json({ ok: true })
  },
)

// --- POST /sessions/:id/stop-task ---
agentSdkRouter.post(
  '/sessions/:id/stop-task',
  zValidator('json', z.object({ taskId: z.string().min(1) })),
  async (c) => {
    const id = c.req.param('id')
    const { taskId } = c.req.valid('json')
    const ok = await sessionManager.stopSessionTask(id, taskId)
    if (!ok) return c.json({ error: 'Session not found or not running' }, 404)
    return c.json({ ok: true })
  },
)

// --- POST /sessions/:id/rename ---
agentSdkRouter.post(
  '/sessions/:id/rename',
  zValidator('json', z.object({ title: z.string().min(1) })),
  async (c) => {
    const id = c.req.param('id')
    const { title } = c.req.valid('json')
    try {
      await sessionManager.renameSession(id, title)
      return c.json({ ok: true })
    } catch (err) {
      return c.json({ error: String(err) }, 400)
    }
  },
)

// --- POST /sessions/:id/tag ---
agentSdkRouter.post(
  '/sessions/:id/tag',
  zValidator('json', z.object({ tag: z.string().nullable() })),
  async (c) => {
    const id = c.req.param('id')
    const { tag } = c.req.valid('json')
    try {
      await sessionManager.tagSession(id, tag)
      return c.json({ ok: true })
    } catch (err) {
      return c.json({ error: String(err) }, 400)
    }
  },
)

// --- POST /sessions/:id/fork ---
agentSdkRouter.post(
  '/sessions/:id/fork',
  zValidator('json', z.object({
    upToMessageId: z.string().optional(),
    title: z.string().optional(),
  })),
  async (c) => {
    const id = c.req.param('id')
    const body = c.req.valid('json')
    try {
      const result = await sessionManager.forkSession(id, body)
      return c.json(result, 201)
    } catch (err) {
      return c.json({ error: String(err) }, 400)
    }
  },
)

// --- GET /sessions/:id/mcp-status (running sessions only) ---
agentSdkRouter.get('/sessions/:id/mcp-status', async (c) => {
  const id = c.req.param('id')
  const status = await sessionManager.getSessionMcpStatus(id)
  if (status === null) return c.json({ error: 'Session not found or not running' }, 404)
  return c.json(status)
})

// --- GET /sessions/:id/context-usage (running Claude sessions only) ---
// SDK 0.2.86+: Real-time context window breakdown by category
agentSdkRouter.get('/sessions/:id/context-usage', async (c) => {
  const id = c.req.param('id')
  const usage = await sessionManager.getSessionContextUsage(id)
  if (usage === null) {
    return c.json({ error: 'Session not found, not running, or not a Claude session' }, 404)
  }
  return c.json(usage)
})

// --- GET /sessions/:id/subagents ---
// SDK 0.2.89+: List subagent IDs from a Claude session transcript
agentSdkRouter.get('/sessions/:id/subagents', async (c) => {
  const id = c.req.param('id')
  const dir = c.req.query('dir')
  const agents = await sessionManager.listSessionSubagents(id, dir)
  return c.json(agents)
})

// --- GET /sessions/:id/subagents/:agentId/messages ---
// SDK 0.2.89+: Get messages for a specific subagent
agentSdkRouter.get('/sessions/:id/subagents/:agentId/messages', async (c) => {
  const id = c.req.param('id')
  const agentId = c.req.param('agentId')
  const dir = c.req.query('dir')
  const limit = c.req.query('limit') ? Number(c.req.query('limit')) : undefined
  const offset = c.req.query('offset') ? Number(c.req.query('offset')) : undefined
  const messages = await sessionManager.getSessionSubagentMessages(id, agentId, {
    dir,
    limit,
    offset,
  })
  return c.json(messages)
})

// --- GET /sessions/:id/account-info (running sessions only) ---
agentSdkRouter.get('/sessions/:id/account-info', async (c) => {
  const id = c.req.param('id')
  const info = await sessionManager.getAccountInfo(id)
  if (info === null) return c.json({ error: 'Session not found or not running' }, 404)
  return c.json(info)
})

// --- POST /sessions/:id/set-mcp-servers (hot-swap MCP servers) ---
agentSdkRouter.post(
  '/sessions/:id/set-mcp-servers',
  zValidator('json', z.object({ servers: z.record(z.unknown()) })),
  async (c) => {
    const id = c.req.param('id')
    const { servers } = c.req.valid('json')
    const result = await sessionManager.setSessionMcpServers(id, servers)
    if (result === null) return c.json({ error: 'Session not found or not running' }, 404)
    return c.json(result)
  },
)

// --- POST /sessions/:id/rewind-files ---
agentSdkRouter.post(
  '/sessions/:id/rewind-files',
  zValidator('json', z.object({
    userMessageId: z.string().min(1),
    dryRun: z.boolean().optional(),
  })),
  async (c) => {
    const id = c.req.param('id')
    const { userMessageId, dryRun } = c.req.valid('json')
    const result = await sessionManager.rewindSessionFiles(id, userMessageId, dryRun)
    if (result === null) return c.json({ error: 'Session not found or not running' }, 404)
    return c.json(result)
  },
)

// --- GET /sessions/:id/agents (available subagents) ---
agentSdkRouter.get('/sessions/:id/agents', async (c) => {
  const id = c.req.param('id')
  const agents = await sessionManager.getSessionAgents(id)
  if (agents === null) return c.json({ error: 'Session not found or not running' }, 404)
  return c.json(agents)
})

// --- GET /sessions/:id/commands (available slash commands) ---
agentSdkRouter.get('/sessions/:id/commands', async (c) => {
  const id = c.req.param('id')
  const commands = await sessionManager.getSessionCommands(id)
  if (commands === null) return c.json({ error: 'Session not found or not running' }, 404)
  return c.json(commands)
})

// --- GET /mcp-servers (available for injection) ---
agentSdkRouter.get('/mcp-servers', async (c) => {
  const projectDir = c.req.query('projectDir')
  const servers = sessionManager.getMcpServersForSpawn(projectDir || undefined)
  return c.json(servers)
})

// --- Helpers ---

function formatStreamMessage(msg: NormalizedMessage): Record<string, unknown> {
  const base: Record<string, unknown> = { type: msg.type, provider: msg.provider }
  if (msg.session_id) base.session_id = msg.session_id
  if (msg.uuid) base.uuid = msg.uuid

  if (msg.type === 'assistant' && msg.content) {
    base.content = msg.content
  }

  if (msg.type === 'result') {
    base.subtype = msg.subtype
    base.is_error = msg.is_error
    base.total_cost_usd = msg.total_cost_usd
    base.num_turns = msg.num_turns
    if (msg.terminal_reason != null) base.terminal_reason = msg.terminal_reason
  }

  if (msg.type === 'progress' && msg.subtype) {
    base.subtype = msg.subtype
  }

  return base
}

function formatResult(result?: NormalizedMessage) {
  if (!result) return null
  return {
    type: result.type,
    provider: result.provider,
    subtype: result.subtype,
    is_error: result.is_error,
    num_turns: result.num_turns,
    total_cost_usd: result.total_cost_usd,
    terminal_reason: result.terminal_reason ?? null,
  }
}

export default agentSdkRouter
