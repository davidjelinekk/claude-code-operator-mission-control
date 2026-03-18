import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/client.js'
import { boards, activityEvents } from '../db/schema.js'
import { and, asc, desc, eq } from 'drizzle-orm'
import { spawnAgentSession } from '../services/claude-code/agent-sdk-client.js'
import { config } from '../config.js'

const router = new Hono()

router.get('/boards/:boardId/chat', async (c) => {
  const boardId = c.req.param('boardId')

  const [board] = await db.select().from(boards).where(eq(boards.id, boardId))
  if (!board) return c.json({ error: 'Not found' }, 404)

  const messages = await db
    .select()
    .from(activityEvents)
    .where(and(eq(activityEvents.boardId, boardId), eq(activityEvents.eventType, 'board.chat')))
    .orderBy(asc(activityEvents.createdAt))
    .limit(100)

  return c.json(messages)
})

router.post(
  '/boards/:boardId/chat',
  zValidator('json', z.object({ message: z.string().min(1) })),
  async (c) => {
    const boardId = c.req.param('boardId')
    const { message } = c.req.valid('json')

    const [board] = await db.select().from(boards).where(eq(boards.id, boardId))
    if (!board) return c.json({ error: 'Not found' }, 404)

    if (board.gatewayAgentId) {
      const history = await db
        .select()
        .from(activityEvents)
        .where(and(eq(activityEvents.boardId, boardId), eq(activityEvents.eventType, 'board.chat')))
        .orderBy(desc(activityEvents.createdAt))
        .limit(10)

      history.reverse()

      let messageWithContext = message
      if (history.length > 0) {
        const lines = history
          .map((e) => `${e.agentId ? 'agent' : 'user'}: ${e.message}`)
          .join('\n')
        messageWithContext = `[Prior conversation:]\n${lines}\n[Current message:] ${message}`
      }

      if (config.ANTHROPIC_API_KEY) {
        await spawnAgentSession({ prompt: messageWithContext }).catch(() => {})
      }
    }

    await db.insert(activityEvents).values({
      boardId,
      eventType: 'board.chat',
      message,
      agentId: board.gatewayAgentId ?? undefined,
    })

    return c.json({ ok: true })
  },
)

export default router
