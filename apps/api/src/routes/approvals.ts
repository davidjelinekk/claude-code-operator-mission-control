import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/client.js'
import { approvals, boards, activityEvents } from '../db/schema.js'
import { eq, and, desc, gte } from 'drizzle-orm'
import { sessionManager } from '../services/claude-code/agent-sdk-client.js'
import { getSessionUser, safeTokenMatch } from '../lib/auth.js'
import { config } from '../config.js'

const router = new Hono()

const CreateApprovalSchema = z.object({
  boardId: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  agentId: z.string().min(1),
  actionType: z.string().min(1),
  payload: z.record(z.unknown()).optional(),
  confidence: z.string().optional(),
})

const UpdateApprovalSchema = z.object({
  status: z.enum(['approved', 'rejected', 'pending']).optional(),
  rubricScores: z.record(z.unknown()).optional(),
})

router.get('/', async (c) => {
  const boardId = c.req.query('boardId')
  const taskId = c.req.query('taskId')
  const status = c.req.query('status')
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 200)
  const offset = parseInt(c.req.query('offset') ?? '0', 10)

  let q = db.select().from(approvals).$dynamic()
  const conditions = []
  if (boardId) conditions.push(eq(approvals.boardId, boardId))
  if (taskId) conditions.push(eq(approvals.taskId, taskId))
  if (status) conditions.push(eq(approvals.status, status))
  if (conditions.length > 0) q = q.where(and(...conditions))

  const result = await q.orderBy(desc(approvals.createdAt)).limit(limit).offset(offset)
  return c.json(result)
})

router.post('/', zValidator('json', CreateApprovalSchema), async (c) => {
  const data = c.req.valid('json')
  const [approval] = await db.insert(approvals).values(data).returning()
  return c.json(approval, 201)
})

router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [approval] = await db.select().from(approvals).where(eq(approvals.id, id))
  if (!approval) return c.json({ error: 'Not found' }, 404)
  return c.json(approval)
})

router.patch('/:id', zValidator('json', UpdateApprovalSchema), async (c) => {
  const id = c.req.param('id')
  const data = c.req.valid('json')

  const [existing] = await db.select().from(approvals).where(eq(approvals.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)

  const updates: Record<string, unknown> = { ...data }
  const isResolving =
    data.status &&
    data.status !== 'pending' &&
    existing.status === 'pending'

  if (isResolving) {
    updates['resolvedAt'] = new Date()
  }

  const [approval] = await db.update(approvals).set(updates).where(eq(approvals.id, id)).returning()

  if (isResolving && data.status) {
    const [board] = await db.select().from(boards).where(eq(boards.id, approval.boardId))

    if (board?.gatewayAgentId && sessionManager.getStatus().available) {
      sessionManager.spawn({
        prompt: `APPROVAL RESOLVED\nApproval ID: ${approval.id}\nAction: ${approval.actionType}\nDecision: ${approval.status}\nTask: ${approval.taskId ?? 'none'}`,
        callerContext: 'approval',
        boardId: approval.boardId,
        taskId: approval.taskId ?? undefined,
        agent: board.gatewayAgentId,
        permissionMode: 'plan',
      }).catch(() => {})
    }

    await db.insert(activityEvents).values({
      boardId: approval.boardId,
      taskId: approval.taskId ?? undefined,
      eventType: 'approval.resolved',
      message: `Approval ${approval.status}: ${approval.actionType}`,
      agentId: approval.agentId,
    })
  }

  return c.json(approval)
})

router.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await db.delete(approvals).where(eq(approvals.id, id))
  return c.json({ ok: true })
})

// SSE stream for approvals by board
router.get('/boards/:boardId/stream', async (c) => {
  let authenticated = false
  const authHeader = c.req.header('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    if (safeTokenMatch(token, config.OPERATOR_TOKEN)) {
      authenticated = true
    } else {
      const user = await getSessionUser(token)
      if (user) authenticated = true
    }
  }
  if (!authenticated) {
    const queryToken = c.req.query('token')
    if (queryToken) {
      if (safeTokenMatch(queryToken, config.OPERATOR_TOKEN)) {
        authenticated = true
      } else {
        const user = await getSessionUser(queryToken)
        if (user) authenticated = true
      }
    }
  }
  if (!authenticated) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const boardId = c.req.param('boardId')
  const sinceParam = c.req.query('since')
  let since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 60_000)

  const stream = new ReadableStream({
    start(controller) {
      let closed = false

      const encode = (data: string) => new TextEncoder().encode(data)

      const ping = () => {
        if (!closed) {
          controller.enqueue(encode(': ping\n\n'))
        }
      }

      const poll = async () => {
        if (closed) return
        try {
          const rows = await db
            .select()
            .from(approvals)
            .where(and(eq(approvals.boardId, boardId), gte(approvals.createdAt, since)))
            .orderBy(approvals.createdAt)

          if (rows.length > 0) {
            since = new Date(rows[rows.length - 1].createdAt)
            since = new Date(since.getTime() + 1)
            for (const row of rows) {
              if (!closed) {
                controller.enqueue(encode(`event: approval\ndata: ${JSON.stringify(row)}\n\n`))
              }
            }
          }
        } catch {
          // ignore poll errors
        }
      }

      const pollInterval = setInterval(() => { poll().catch(() => {}) }, 2000)
      const pingInterval = setInterval(ping, 15_000)

      poll().catch(() => {})

      const abortCheck = setInterval(() => {
        if (c.req.raw.signal?.aborted) {
          closed = true
          clearInterval(pollInterval)
          clearInterval(pingInterval)
          clearInterval(abortCheck)
          try { controller.close() } catch { /* already closed */ }
        }
      }, 1000)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
})

export default router
