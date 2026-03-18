import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/client.js'
import { taskTemplates, tasks, tags, taskTags } from '../db/schema.js'
import { eq, desc, inArray } from 'drizzle-orm'
import { slugify } from '../lib/slugify.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const TemplateBodySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.string().optional(),
  assignedAgentId: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  boardId: z.string().uuid().optional(),
  template: TemplateBodySchema,
})

const UpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  boardId: z.string().uuid().nullable().optional(),
  template: TemplateBodySchema.optional(),
})

const InstantiateSchema = z.object({
  boardId: z.string().uuid().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  priority: z.string().optional(),
  assignedAgentId: z.string().optional(),
  projectId: z.string().uuid().optional(),
})

const router = new Hono()

router.use('/:id/:rest{.*}?', async (c, next) => {
  const id = c.req.param('id')
  if (!id || UUID_RE.test(id)) return next()
  return c.json({ error: 'Invalid template ID format' }, 400)
})

router.get('/', async (c) => {
  const boardId = c.req.query('boardId')
  const where = boardId ? eq(taskTemplates.boardId, boardId) : undefined
  const result = await db.select().from(taskTemplates).where(where).orderBy(desc(taskTemplates.createdAt))
  return c.json(result)
})

router.post('/', zValidator('json', CreateSchema), async (c) => {
  const data = c.req.valid('json')
  const slug = data.slug ?? slugify(data.name)
  const [row] = await db.insert(taskTemplates).values({
    name: data.name,
    slug,
    description: data.description,
    boardId: data.boardId,
    template: data.template,
  }).returning()
  return c.json(row, 201)
})

router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [row] = await db.select().from(taskTemplates).where(eq(taskTemplates.id, id))
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json(row)
})

router.patch('/:id', zValidator('json', UpdateSchema), async (c) => {
  const id = c.req.param('id')
  const data = c.req.valid('json')
  const updates: Record<string, unknown> = { ...data, updatedAt: new Date() }
  if (data.name && !data.slug) updates['slug'] = slugify(data.name)
  const [row] = await db.update(taskTemplates).set(updates).where(eq(taskTemplates.id, id)).returning()
  if (!row) return c.json({ error: 'Not found' }, 404)
  return c.json(row)
})

router.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await db.delete(taskTemplates).where(eq(taskTemplates.id, id))
  return c.json({ ok: true })
})

router.post('/:id/instantiate', zValidator('json', InstantiateSchema), async (c) => {
  const id = c.req.param('id')
  const overrides = c.req.valid('json')

  const [tmpl] = await db.select().from(taskTemplates).where(eq(taskTemplates.id, id))
  if (!tmpl) return c.json({ error: 'Template not found' }, 404)

  const t = tmpl.template as {
    title: string
    description?: string
    priority?: string
    assignedAgentId?: string
    tags?: string[]
  }

  const boardId = overrides.boardId ?? tmpl.boardId
  if (!boardId) return c.json({ error: 'boardId is required (not set on template and not provided in overrides)' }, 400)

  const [task] = await db.insert(tasks).values({
    boardId,
    title: overrides.title ?? t.title,
    description: overrides.description ?? t.description,
    priority: overrides.priority ?? t.priority ?? 'medium',
    assignedAgentId: overrides.assignedAgentId ?? t.assignedAgentId,
    projectId: overrides.projectId,
  }).returning()

  if (t.tags && t.tags.length > 0) {
    const foundTags = await db.select().from(tags).where(inArray(tags.slug, t.tags))
    if (foundTags.length > 0) {
      await db.insert(taskTags).values(foundTags.map((tag) => ({ taskId: task.id, tagId: tag.id }))).onConflictDoNothing()
    }
  }

  return c.json(task, 201)
})

export default router
