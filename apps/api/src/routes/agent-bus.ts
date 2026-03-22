import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/client.js'
import { agentMessages } from '../db/schema.js'
import { redis } from '../lib/redis.js'
import { sessionManager } from '../services/claude-code/agent-sdk-client.js'
import { eq, and, or, gte, desc } from 'drizzle-orm'

const SendMessageSchema = z.object({
  boardId: z.string().uuid(),
  fromAgentId: z.string().min(1),
  toAgentId: z.string().min(1),
  content: z.string().min(1),
  priority: z.string().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
})

const app = new Hono()

// POST /send — insert message, publish to Redis for dashboard push
app.post('/send', zValidator('json', SendMessageSchema), async (c) => {
  const { boardId, fromAgentId, toAgentId, content, priority, metadata } = c.req.valid('json')

  const [msg] = await db.insert(agentMessages).values({
    boardId,
    fromAgentId,
    toAgentId,
    content,
    priority: priority ?? 'normal',
    metadata: metadata ?? null,
  }).returning()

  // Push to dashboard via Redis pub/sub
  await redis.publish(`board:${boardId}`, JSON.stringify({
    type: 'agent_bus.message',
    message: msg,
  }))

  return c.json(msg, 201)
})

// GET /inbox — read messages addressed to an agent (direct + broadcasts)
app.get('/inbox', async (c) => {
  const boardId = c.req.query('boardId')
  const agentId = c.req.query('agentId')
  const since = c.req.query('since')
  const from = c.req.query('from')
  const limit = parseInt(c.req.query('limit') ?? '50', 10)

  if (!boardId || !agentId) {
    return c.json({ error: 'boardId and agentId are required' }, 400)
  }

  const conditions = [
    eq(agentMessages.boardId, boardId),
    or(eq(agentMessages.toAgentId, agentId), eq(agentMessages.toAgentId, '*')),
  ]

  if (since) {
    conditions.push(gte(agentMessages.createdAt, new Date(since)))
  }
  if (from) {
    conditions.push(eq(agentMessages.fromAgentId, from))
  }

  const messages = await db
    .select()
    .from(agentMessages)
    .where(and(...conditions))
    .orderBy(desc(agentMessages.createdAt))
    .limit(limit)

  return c.json(messages)
})

// GET /agents — list active agents on a board
app.get('/agents', async (c) => {
  const boardId = c.req.query('boardId')
  if (!boardId) {
    return c.json({ error: 'boardId is required' }, 400)
  }

  const activeSessions = sessionManager.getActiveSessions()
  const boardAgents = activeSessions
    .filter((s) => s.meta.boardId === boardId)
    .map((s) => ({
      sessionId: s.sessionId,
      agentId: s.meta.agentId ?? s.meta.callerContext ?? 'anonymous',
      status: s.status,
      createdAt: s.createdAt.toISOString(),
    }))

  return c.json(boardAgents)
})

export default app
