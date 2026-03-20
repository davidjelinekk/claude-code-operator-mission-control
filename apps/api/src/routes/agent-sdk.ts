import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import {
  sessionManager,
  getAgentSdkStatus,
  type SDKSessionInfo,
} from '../services/claude-code/agent-sdk-client.js'
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

// --- POST /spawn ---
agentSdkRouter.post(
  '/spawn',
  zValidator(
    'json',
    z.object({
      prompt: z.string().min(1),
      model: z.string().optional(),
      maxTurns: z.number().optional(),
      permissionMode: z.enum(['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk']).optional(),
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
    status: s.status,
    createdAt: s.createdAt.toISOString(),
    completedAt: s.completedAt?.toISOString() ?? null,
    meta: s.meta,
    messageCount: s.messages.length,
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
      status: session.status,
      createdAt: session.createdAt.toISOString(),
      completedAt: session.completedAt?.toISOString() ?? null,
      meta: session.meta,
      messageCount: session.messages.length,
      messages: session.messages.map((m) => ({
        type: m.type,
        ...('session_id' in m ? { session_id: m.session_id } : {}),
        ...('uuid' in m ? { uuid: m.uuid } : {}),
        // Include text content for assistant messages
        ...('message' in m && m.type === 'assistant'
          ? { content: extractTextContent(m) }
          : {}),
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

      const onMessage = (data: { sessionId: string; message: SDKMessage }) => {
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

// --- GET /sessions/:id/account-info (running sessions only) ---
agentSdkRouter.get('/sessions/:id/account-info', async (c) => {
  const id = c.req.param('id')
  const info = await sessionManager.getAccountInfo(id)
  if (info === null) return c.json({ error: 'Session not found or not running' }, 404)
  return c.json(info)
})

// --- GET /mcp-servers (available for injection) ---
agentSdkRouter.get('/mcp-servers', async (c) => {
  const projectDir = c.req.query('projectDir')
  const servers = sessionManager.getMcpServersForSpawn(projectDir || undefined)
  return c.json(servers)
})

// --- Helpers ---

type SDKMessage = import('../services/claude-code/agent-sdk-client.js').ManagedSession['messages'][number]

function formatStreamMessage(msg: SDKMessage): Record<string, unknown> {
  const base: Record<string, unknown> = { type: msg.type }
  if ('session_id' in msg) base.session_id = msg.session_id
  if ('uuid' in msg) base.uuid = msg.uuid

  // Include richer data for assistant messages
  if (msg.type === 'assistant') {
    base.content = extractTextContent(msg)
  }

  // Include result details
  if (msg.type === 'result') {
    const r = msg as SDKMessage & { subtype?: string; is_error?: boolean; total_cost_usd?: number; num_turns?: number; result?: string; errors?: string[] }
    base.subtype = r.subtype
    base.is_error = r.is_error
    base.total_cost_usd = r.total_cost_usd
    base.num_turns = r.num_turns
    if ('result' in r) base.result = r.result
    if ('errors' in r) base.errors = r.errors
  }

  // Include progress info for system messages
  if (msg.type === 'system' && 'subtype' in msg) {
    base.subtype = (msg as Record<string, unknown>).subtype
  }

  // Include tool use summaries
  if ('type' in msg && (msg.type as string) === 'tool_use_summary') {
    const t = msg as Record<string, unknown>
    base.tool_name = t.tool_name
    base.tool_use_id = t.tool_use_id
  }

  // Include task notifications (subagent progress)
  if ('type' in msg && (msg.type as string).startsWith('task_')) {
    const t = msg as Record<string, unknown>
    if (t.task_id) base.task_id = t.task_id
    if (t.status) base.status = t.status
    if (t.summary) base.summary = t.summary
  }

  return base
}

function extractTextContent(msg: unknown): string | undefined {
  const m = msg as { message?: { content?: Array<{ type: string; text?: string }> | string } }
  if (!m.message?.content) return undefined
  if (typeof m.message.content === 'string') return m.message.content
  if (Array.isArray(m.message.content)) {
    return m.message.content
      .filter((b) => b.type === 'text' && b.text)
      .map((b) => b.text)
      .join('\n')
  }
  return undefined
}

function formatResult(result?: { type: string; subtype: string; is_error: boolean; duration_ms: number; num_turns: number; total_cost_usd: number } & Record<string, unknown>) {
  if (!result) return null
  return {
    type: result.type,
    subtype: result.subtype,
    is_error: result.is_error,
    duration_ms: result.duration_ms,
    num_turns: result.num_turns,
    total_cost_usd: result.total_cost_usd,
    ...('result' in result ? { result: result.result } : {}),
    ...('errors' in result ? { errors: result.errors } : {}),
  }
}

export default agentSdkRouter
