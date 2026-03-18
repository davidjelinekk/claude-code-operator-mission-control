import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/client.js'
import { tags, taskTags } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { slugify } from '../lib/slugify.js'

const router = new Hono()

const CreateTagSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^[0-9a-fA-F]{6}$/).optional(),
  description: z.string().max(500).optional(),
})

const UpdateTagSchema = CreateTagSchema.partial()

router.get('/', async (c) => {
  const result = await db.select().from(tags).orderBy(desc(tags.createdAt))
  return c.json(result)
})

router.post('/', zValidator('json', CreateTagSchema), async (c) => {
  const data = c.req.valid('json')
  const slug = slugify(data.name)
  const [tag] = await db.insert(tags).values({ ...data, slug }).returning()
  return c.json(tag, 201)
})

router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [tag] = await db.select().from(tags).where(eq(tags.id, id))
  if (!tag) return c.json({ error: 'Not found' }, 404)
  return c.json(tag)
})

router.patch('/:id', zValidator('json', UpdateTagSchema), async (c) => {
  const id = c.req.param('id')
  const data = c.req.valid('json')
  const updates: Record<string, unknown> = { ...data, updatedAt: new Date() }
  if (data.name) updates['slug'] = slugify(data.name)
  const [tag] = await db.update(tags).set(updates).where(eq(tags.id, id)).returning()
  if (!tag) return c.json({ error: 'Not found' }, 404)
  return c.json(tag)
})

router.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await db.delete(tags).where(eq(tags.id, id))
  return c.json({ ok: true })
})

router.get('/tasks/:taskId', async (c) => {
  const taskId = c.req.param('taskId')
  const rows = await db
    .select({ tag: tags })
    .from(taskTags)
    .innerJoin(tags, eq(taskTags.tagId, tags.id))
    .where(eq(taskTags.taskId, taskId))
  return c.json(rows.map((r) => r.tag))
})

router.post(
  '/tasks/:taskId/add',
  zValidator('json', z.object({ tagId: z.string().uuid() })),
  async (c) => {
    const taskId = c.req.param('taskId')
    const { tagId } = c.req.valid('json')
    await db.insert(taskTags).values({ taskId, tagId }).onConflictDoNothing()
    return c.json({ ok: true }, 201)
  },
)

router.delete('/tasks/:taskId/:tagId', async (c) => {
  const taskId = c.req.param('taskId')
  const tagId = c.req.param('tagId')
  await db.delete(taskTags).where(and(eq(taskTags.taskId, taskId), eq(taskTags.tagId, tagId)))
  return c.json({ ok: true })
})

export default router
