import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/client.js'
import { people, personThreads, personTasks, personProjects, tasks, projects, boards } from '../db/schema.js'
import { eq, desc, and, sql } from 'drizzle-orm'
import { CreatePersonSchema, UpdatePersonSchema, CreatePersonThreadSchema } from '@claude-code-operator/shared-types'

const router = new Hono()

// List all people
router.get('/', async (c) => {
  const rows = await db
    .select({
      person: people,
      threadCount: sql<number>`cast(count(${personThreads.id}) as int)`,
      lastActiveAt: sql<string | null>`max(${personThreads.lastMessageAt})`,
    })
    .from(people)
    .leftJoin(personThreads, eq(personThreads.personId, people.id))
    .groupBy(people.id)
    .orderBy(desc(people.updatedAt))
  return c.json(rows.map(r => ({ ...r.person, threadCount: r.threadCount, lastActiveAt: r.lastActiveAt })))
})

// Create person
router.post('/', zValidator('json', CreatePersonSchema), async (c) => {
  const data = c.req.valid('json')
  const [person] = await db.insert(people).values(data).returning()
  return c.json(person, 201)
})

// Get person detail with threads, tasks, projects
router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [person] = await db.select().from(people).where(eq(people.id, id))
  if (!person) return c.json({ error: 'Not found' }, 404)

  const threads = await db.select().from(personThreads)
    .where(eq(personThreads.personId, id))
    .orderBy(desc(personThreads.lastMessageAt))

  const linkedTasks = await db.select({ task: tasks, boardName: boards.name })
    .from(personTasks)
    .leftJoin(tasks, eq(personTasks.taskId, tasks.id))
    .leftJoin(boards, eq(tasks.boardId, boards.id))
    .where(eq(personTasks.personId, id))

  const linkedProjects = await db.select({ project: projects })
    .from(personProjects)
    .leftJoin(projects, eq(personProjects.projectId, projects.id))
    .where(eq(personProjects.personId, id))

  return c.json({ person, threads, tasks: linkedTasks, projects: linkedProjects })
})

// Update person
router.patch('/:id', zValidator('json', UpdatePersonSchema), async (c) => {
  const id = c.req.param('id')
  const data = c.req.valid('json')
  const [person] = await db.update(people).set({ ...data, updatedAt: new Date() })
    .where(eq(people.id, id)).returning()
  if (!person) return c.json({ error: 'Not found' }, 404)
  return c.json(person)
})

// Delete person
router.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const [deleted] = await db.delete(people).where(eq(people.id, id)).returning()
  if (!deleted) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})

// Add thread
router.post('/:id/threads', zValidator('json', CreatePersonThreadSchema), async (c) => {
  const personId = c.req.param('id')
  const data = c.req.valid('json')
  const [thread] = await db.insert(personThreads).values({
    personId,
    ...data,
    lastMessageAt: data.lastMessageAt ? new Date(data.lastMessageAt) : undefined,
  }).returning()
  return c.json(thread, 201)
})

// Get tasks linked to person
router.get('/:id/tasks', async (c) => {
  const personId = c.req.param('id')
  const rows = await db.select({ task: tasks, boardName: boards.name })
    .from(personTasks)
    .leftJoin(tasks, eq(personTasks.taskId, tasks.id))
    .leftJoin(boards, eq(tasks.boardId, boards.id))
    .where(eq(personTasks.personId, personId))
  return c.json(rows)
})

// Link task
router.post('/:id/tasks', zValidator('json', z.object({ taskId: z.string().uuid() })), async (c) => {
  const personId = c.req.param('id')
  const { taskId } = c.req.valid('json')
  await db.insert(personTasks).values({ personId, taskId }).onConflictDoNothing()
  return c.json({ ok: true }, 201)
})

// Unlink task
router.delete('/:id/tasks/:taskId', async (c) => {
  const personId = c.req.param('id')
  const taskId = c.req.param('taskId')
  await db.delete(personTasks).where(and(eq(personTasks.personId, personId), eq(personTasks.taskId, taskId)))
  return c.json({ ok: true })
})

// Link project
router.post('/:id/projects', zValidator('json', z.object({ projectId: z.string().uuid() })), async (c) => {
  const personId = c.req.param('id')
  const { projectId } = c.req.valid('json')
  await db.insert(personProjects).values({ personId, projectId }).onConflictDoNothing()
  return c.json({ ok: true }, 201)
})

// Unlink project
router.delete('/:id/projects/:projectId', async (c) => {
  const personId = c.req.param('id')
  const projectId = c.req.param('projectId')
  await db.delete(personProjects).where(and(eq(personProjects.personId, personId), eq(personProjects.projectId, projectId)))
  return c.json({ ok: true })
})

// Update thread
router.patch('/:id/threads/:threadId', zValidator('json', z.object({
  summary: z.string().optional(),
  lastMessageAt: z.string().optional(),
})), async (c) => {
  const personId = c.req.param('id')
  const threadId = c.req.param('threadId')
  const { summary, lastMessageAt } = c.req.valid('json')

  const updates: Record<string, unknown> = {}
  if (summary !== undefined) updates.summary = summary
  if (lastMessageAt !== undefined) updates.lastMessageAt = new Date(lastMessageAt)

  if (Object.keys(updates).length === 0) return c.json({ error: 'No fields to update' }, 400)

  const [updated] = await db
    .update(personThreads)
    .set(updates)
    .where(and(eq(personThreads.id, threadId), eq(personThreads.personId, personId)))
    .returning()
  if (!updated) return c.json({ error: 'Not found' }, 404)
  return c.json(updated)
})

// Delete thread
router.delete('/:id/threads/:threadId', async (c) => {
  const personId = c.req.param('id')
  const threadId = c.req.param('threadId')
  const [deleted] = await db
    .delete(personThreads)
    .where(and(eq(personThreads.id, threadId), eq(personThreads.personId, personId)))
    .returning()
  if (!deleted) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})

export default router
