import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/client.js'
import { activityEvents } from '../db/schema.js'
import { eq, and, desc, gte } from 'drizzle-orm'

const router = new Hono()

const CreateActivitySchema = z.object({
  boardId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
  agentId: z.string().optional(),
  eventType: z.string().min(1),
  message: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
})

router.get('/', async (c) => {
  const boardId = c.req.query('boardId')
  const taskId = c.req.query('taskId')
  const eventType = c.req.query('eventType')
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 200)
  const offset = parseInt(c.req.query('offset') ?? '0', 10)

  let q = db.select().from(activityEvents).$dynamic()
  const conditions = []
  if (boardId) conditions.push(eq(activityEvents.boardId, boardId))
  if (taskId) conditions.push(eq(activityEvents.taskId, taskId))
  if (eventType) conditions.push(eq(activityEvents.eventType, eventType))
  if (conditions.length > 0) q = q.where(and(...conditions))

  const result = await q.orderBy(desc(activityEvents.createdAt)).limit(limit).offset(offset)
  return c.json(result)
})

router.post('/', zValidator('json', CreateActivitySchema), async (c) => {
  const data = c.req.valid('json')
  const [event] = await db.insert(activityEvents).values(data).returning()
  return c.json(event, 201)
})

router.get('/stream', async (c) => {
  const boardId = c.req.query('boardId')
  const sinceParam = c.req.query('since')
  let since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 60_000)

  const stream = new ReadableStream({
    start(controller) {
      let closed = false

      const encode = (data: string) => new TextEncoder().encode(data)

      const send = (event: string, data: string) => {
        if (!closed) {
          controller.enqueue(encode(`event: ${event}\ndata: ${data}\n\n`))
        }
      }

      const ping = () => {
        if (!closed) {
          controller.enqueue(encode(': ping\n\n'))
        }
      }

      const poll = async () => {
        if (closed) return
        try {
          let q = db
            .select()
            .from(activityEvents)
            .where(gte(activityEvents.createdAt, since))
            .$dynamic()
          if (boardId) q = q.where(and(eq(activityEvents.boardId, boardId), gte(activityEvents.createdAt, since)))

          const rows = await q.orderBy(activityEvents.createdAt)
          if (rows.length > 0) {
            since = new Date(rows[rows.length - 1].createdAt)
            // advance by 1ms to avoid re-sending the last event
            since = new Date(since.getTime() + 1)
            for (const row of rows) {
              send('activity', JSON.stringify(row))
            }
          }
        } catch {
          // ignore poll errors — keep streaming
        }
      }

      const pollInterval = setInterval(() => { poll().catch(() => {}) }, 2000)
      const pingInterval = setInterval(ping, 15_000)

      // Initial poll immediately
      poll().catch(() => {})

      // Check for client disconnect
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
