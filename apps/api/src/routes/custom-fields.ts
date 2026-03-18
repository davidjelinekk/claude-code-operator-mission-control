import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/client.js'
import {
  taskCustomFieldDefinitions,
  boardTaskCustomFields,
  taskCustomFieldValues,
  boards,
  tasks,
} from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import type { InferInsertModel } from 'drizzle-orm'

const router = new Hono()

const CreateDefinitionSchema = z.object({
  fieldKey: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  fieldType: z.enum(['text', 'text_long', 'integer', 'decimal', 'boolean', 'date', 'url', 'json']).optional(),
  uiVisibility: z.enum(['always', 'if_set', 'hidden']).optional(),
  description: z.string().optional(),
  required: z.boolean().optional(),
  defaultValue: z.unknown().optional(),
})

const UpdateDefinitionSchema = CreateDefinitionSchema.partial()

// --- definitions ---

router.get('/', async (c) => {
  const result = await db.select().from(taskCustomFieldDefinitions).orderBy(taskCustomFieldDefinitions.label)
  return c.json(result)
})

router.post('/', zValidator('json', CreateDefinitionSchema), async (c) => {
  const data = c.req.valid('json')
  const insertData: InferInsertModel<typeof taskCustomFieldDefinitions> = {
    fieldKey: data.fieldKey,
    label: data.label,
    ...(data.fieldType !== undefined && { fieldType: data.fieldType }),
    ...(data.uiVisibility !== undefined && { uiVisibility: data.uiVisibility }),
    ...(data.description !== undefined && { description: data.description }),
    ...(data.required !== undefined && { required: data.required }),
    ...(data.defaultValue !== undefined && { defaultValue: data.defaultValue }),
  }
  const [def] = await db.insert(taskCustomFieldDefinitions).values(insertData).returning()
  return c.json(def, 201)
})

router.patch('/:id', zValidator('json', UpdateDefinitionSchema), async (c) => {
  const id = c.req.param('id')
  const data = c.req.valid('json')
  const [def] = await db
    .update(taskCustomFieldDefinitions)
    .set({ ...data, updatedAt: new Date() } as Record<string, unknown>)
    .where(eq(taskCustomFieldDefinitions.id, id))
    .returning()
  if (!def) return c.json({ error: 'Not found' }, 404)
  return c.json(def)
})

router.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await db.delete(taskCustomFieldDefinitions).where(eq(taskCustomFieldDefinitions.id, id))
  return c.json({ ok: true })
})

// --- board bindings ---

router.get('/boards/:boardId', async (c) => {
  const boardId = c.req.param('boardId')
  const rows = await db
    .select({ def: taskCustomFieldDefinitions })
    .from(boardTaskCustomFields)
    .innerJoin(taskCustomFieldDefinitions, eq(boardTaskCustomFields.definitionId, taskCustomFieldDefinitions.id))
    .where(eq(boardTaskCustomFields.boardId, boardId))
    .orderBy(taskCustomFieldDefinitions.label)
  return c.json(rows.map((r) => r.def))
})

router.post(
  '/boards/:boardId/bind',
  zValidator('json', z.object({ definitionId: z.string().uuid() })),
  async (c) => {
    const boardId = c.req.param('boardId')
    const { definitionId } = c.req.valid('json')
    const [board] = await db.select().from(boards).where(eq(boards.id, boardId))
    if (!board) return c.json({ error: 'Board not found' }, 404)
    await db.insert(boardTaskCustomFields).values({ boardId, definitionId }).onConflictDoNothing()
    return c.json({ ok: true }, 201)
  },
)

router.delete('/boards/:boardId/unbind/:definitionId', async (c) => {
  const boardId = c.req.param('boardId')
  const definitionId = c.req.param('definitionId')
  await db
    .delete(boardTaskCustomFields)
    .where(and(eq(boardTaskCustomFields.boardId, boardId), eq(boardTaskCustomFields.definitionId, definitionId)))
  return c.json({ ok: true })
})

// --- task values ---

router.get('/tasks/:taskId/values', async (c) => {
  const taskId = c.req.param('taskId')
  const rows = await db
    .select({ value: taskCustomFieldValues, def: taskCustomFieldDefinitions })
    .from(taskCustomFieldValues)
    .innerJoin(taskCustomFieldDefinitions, eq(taskCustomFieldValues.definitionId, taskCustomFieldDefinitions.id))
    .where(eq(taskCustomFieldValues.taskId, taskId))
  return c.json(rows.map((r) => ({ ...r.value, definition: r.def })))
})

router.post(
  '/tasks/:taskId/values',
  zValidator('json', z.object({ definitionId: z.string().uuid(), value: z.unknown().optional() })),
  async (c) => {
    const taskId = c.req.param('taskId')
    const { definitionId, value } = c.req.valid('json')

    const [existing] = await db
      .select()
      .from(taskCustomFieldValues)
      .where(and(eq(taskCustomFieldValues.taskId, taskId), eq(taskCustomFieldValues.definitionId, definitionId)))

    if (existing) {
      const [updated] = await db
        .update(taskCustomFieldValues)
        .set({ value: value ?? null, updatedAt: new Date() })
        .where(eq(taskCustomFieldValues.id, existing.id))
        .returning()
      return c.json(updated)
    }

    const [created] = await db
      .insert(taskCustomFieldValues)
      .values({ taskId, definitionId, value: value ?? null })
      .returning()
    return c.json(created, 201)
  },
)

export default router
