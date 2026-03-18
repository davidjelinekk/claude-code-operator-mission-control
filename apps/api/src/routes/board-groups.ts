import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/client.js'
import { boardGroups, boards } from '../db/schema.js'
import { eq, desc, sql } from 'drizzle-orm'
import { slugify } from '../lib/slugify.js'

const router = new Hono()

const CreateGroupSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
})

const UpdateGroupSchema = CreateGroupSchema.partial()

router.get('/', async (c) => {
  const rows = await db
    .select({
      group: boardGroups,
      boardCount: sql<number>`cast(count(${boards.id}) as int)`,
    })
    .from(boardGroups)
    .leftJoin(boards, eq(boards.boardGroupId, boardGroups.id))
    .groupBy(boardGroups.id)
    .orderBy(desc(boardGroups.createdAt))

  return c.json(rows.map((r) => ({ ...r.group, boardCount: r.boardCount })))
})

router.post('/', zValidator('json', CreateGroupSchema), async (c) => {
  const data = c.req.valid('json')
  const slug = slugify(data.name)
  const [group] = await db.insert(boardGroups).values({ ...data, slug }).returning()
  return c.json(group, 201)
})

router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [group] = await db.select().from(boardGroups).where(eq(boardGroups.id, id))
  if (!group) return c.json({ error: 'Not found' }, 404)
  const groupBoards = await db.select().from(boards).where(eq(boards.boardGroupId, id)).orderBy(desc(boards.createdAt))
  return c.json({ ...group, boards: groupBoards })
})

router.patch('/:id', zValidator('json', UpdateGroupSchema), async (c) => {
  const id = c.req.param('id')
  const data = c.req.valid('json')
  const updates: Record<string, unknown> = { ...data, updatedAt: new Date() }
  if (data.name) updates['slug'] = slugify(data.name)
  const [group] = await db.update(boardGroups).set(updates).where(eq(boardGroups.id, id)).returning()
  if (!group) return c.json({ error: 'Not found' }, 404)
  return c.json(group)
})

router.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await db.delete(boardGroups).where(eq(boardGroups.id, id))
  return c.json({ ok: true })
})

router.post('/:id/boards/:boardId', async (c) => {
  const id = c.req.param('id')
  const boardId = c.req.param('boardId')
  const [group] = await db.select().from(boardGroups).where(eq(boardGroups.id, id))
  if (!group) return c.json({ error: 'Group not found' }, 404)
  const [board] = await db
    .update(boards)
    .set({ boardGroupId: id, updatedAt: new Date() })
    .where(eq(boards.id, boardId))
    .returning()
  if (!board) return c.json({ error: 'Board not found' }, 404)
  return c.json({ ok: true })
})

router.delete('/:id/boards/:boardId', async (c) => {
  const boardId = c.req.param('boardId')
  const [board] = await db
    .update(boards)
    .set({ boardGroupId: null, updatedAt: new Date() })
    .where(eq(boards.id, boardId))
    .returning()
  if (!board) return c.json({ error: 'Board not found' }, 404)
  return c.json({ ok: true })
})

export default router
