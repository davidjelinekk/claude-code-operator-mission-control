import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/client.js'
import { boardMemory, boards } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'

const router = new Hono()

const CreateMemorySchema = z.object({
  content: z.string().min(1),
  tags: z.array(z.string()).optional(),
  isChat: z.boolean().optional(),
  source: z.string().optional(),
})

router.get('/boards/:boardId/memory', async (c) => {
  const boardId = c.req.param('boardId')
  const isChat = c.req.query('isChat')

  let q = db.select().from(boardMemory).where(eq(boardMemory.boardId, boardId)).$dynamic()
  if (isChat !== undefined) {
    q = q.where(and(eq(boardMemory.boardId, boardId), eq(boardMemory.isChat, isChat === 'true')))
  }

  const result = await q.orderBy(desc(boardMemory.createdAt))
  return c.json(result)
})

router.post('/boards/:boardId/memory', zValidator('json', CreateMemorySchema), async (c) => {
  const boardId = c.req.param('boardId')
  const data = c.req.valid('json')

  const [board] = await db.select().from(boards).where(eq(boards.id, boardId))
  if (!board) return c.json({ error: 'Not found' }, 404)

  const [item] = await db.insert(boardMemory).values({ ...data, boardId }).returning()
  return c.json(item, 201)
})

router.delete('/boards/:boardId/memory/:id', async (c) => {
  const boardId = c.req.param('boardId')
  const id = c.req.param('id')
  await db.delete(boardMemory).where(and(eq(boardMemory.id, id), eq(boardMemory.boardId, boardId)))
  return c.json({ ok: true })
})

export default router
