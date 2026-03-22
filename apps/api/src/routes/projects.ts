import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { db } from '../db/client.js'
import { projects, projectTasks, projectTaskDeps, tasks } from '../db/schema.js'
import { eq, and, desc, asc } from 'drizzle-orm'
import { CreateProjectSchema, UpdateProjectSchema } from '@claude-code-operator/shared-types'
import { z } from 'zod'
import { initProjectWorkspace } from '../lib/projectWorkspace.js'

export const projectsRouter = new Hono()

projectsRouter.get('/', async (c) => {
  const result = await db.select().from(projects).orderBy(desc(projects.createdAt))
  return c.json(result)
})

projectsRouter.post('/', zValidator('json', CreateProjectSchema), async (c) => {
  const data = c.req.valid('json')
  let [project] = await db.insert(projects).values({
    ...data,
    targetDate: data.targetDate ? new Date(data.targetDate) : undefined,
  }).returning()

  let workspacePath: string | null = null
  try {
    workspacePath = await initProjectWorkspace(project)
    ;[project] = await db.update(projects).set({ workspacePath }).where(eq(projects.id, project.id)).returning()
  } catch (err) {
    console.error('[workspace] init failed:', err)
  }

  return c.json(project, 201)
})

projectsRouter.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [project] = await db.select().from(projects).where(eq(projects.id, id))
  if (!project) return c.json({ error: 'Not found' }, 404)
  const projectTaskList = await db
    .select({ pt: projectTasks, task: tasks })
    .from(projectTasks)
    .leftJoin(tasks, eq(projectTasks.taskId, tasks.id))
    .where(eq(projectTasks.projectId, id))
    .orderBy(asc(projectTasks.position))
  return c.json({ project, tasks: projectTaskList })
})

projectsRouter.patch('/:id', zValidator('json', UpdateProjectSchema), async (c) => {
  const id = c.req.param('id')
  const data = c.req.valid('json')
  const [project] = await db.update(projects).set({
    ...data,
    updatedAt: new Date(),
    targetDate: data.targetDate != null ? new Date(data.targetDate) : data.targetDate,
  }).where(eq(projects.id, id)).returning()
  if (!project) return c.json({ error: 'Not found' }, 404)
  return c.json(project)
})

projectsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await db.transaction(async (tx) => {
    await tx.delete(projectTaskDeps).where(eq(projectTaskDeps.projectId, id))
    await tx.delete(projectTasks).where(eq(projectTasks.projectId, id))
    await tx.delete(projects).where(eq(projects.id, id))
  })
  return c.json({ ok: true })
})

projectsRouter.post('/:id/tasks', zValidator('json', z.object({
  taskId: z.string().uuid(),
  position: z.number().int().optional(),
  executionMode: z.enum(['sequential', 'parallel']).default('sequential'),
})), async (c) => {
  const projectId = c.req.param('id')
  const { taskId, position, executionMode } = c.req.valid('json')
  const existing = await db.select().from(projectTasks).where(eq(projectTasks.projectId, projectId))
  const pos = position ?? existing.length
  await db.insert(projectTasks).values({ projectId, taskId, position: pos, executionMode }).onConflictDoNothing()
  return c.json({ ok: true }, 201)
})

projectsRouter.delete('/:id/tasks/:taskId', async (c) => {
  const projectId = c.req.param('id')
  const taskId = c.req.param('taskId')
  await db.delete(projectTasks).where(and(eq(projectTasks.projectId, projectId), eq(projectTasks.taskId, taskId)))
  return c.json({ ok: true })
})

projectsRouter.post('/:id/kickoff', async (c) => {
  const id = c.req.param('id')
  const [project] = await db.select().from(projects).where(eq(projects.id, id))
  if (!project) return c.json({ error: 'Not found' }, 404)

  const projectTaskList = await db
    .select({ pt: projectTasks, task: tasks })
    .from(projectTasks)
    .leftJoin(tasks, eq(projectTasks.taskId, tasks.id))
    .where(eq(projectTasks.projectId, id))
    .orderBy(asc(projectTasks.position))

  if (projectTaskList.length === 0) {
    return c.json({ error: 'Project has no tasks to kick off' }, 409)
  }

  await db.update(projects).set({ status: 'active', updatedAt: new Date() }).where(eq(projects.id, id))

  return c.json({ project: { ...project, status: 'active' }, tasks: projectTaskList })
})

projectsRouter.patch('/:id/tasks/:taskId', zValidator('json', z.object({
  executionMode: z.enum(['sequential', 'parallel']).optional(),
  order: z.number().int().optional(),
})), async (c) => {
  const projectId = c.req.param('id')
  const taskId = c.req.param('taskId')
  const { executionMode, order } = c.req.valid('json')

  const updates: Record<string, unknown> = {}
  if (executionMode !== undefined) updates.executionMode = executionMode
  if (order !== undefined) updates.position = order

  if (Object.keys(updates).length === 0) return c.json({ error: 'No fields to update' }, 400)

  const [updated] = await db
    .update(projectTasks)
    .set(updates)
    .where(and(eq(projectTasks.projectId, projectId), eq(projectTasks.taskId, taskId)))
    .returning()
  if (!updated) return c.json({ error: 'Not found' }, 404)
  return c.json(updated)
})

projectsRouter.get('/:id/progress', async (c) => {
  const id = c.req.param('id')
  const projectTaskList = await db
    .select({ task: tasks })
    .from(projectTasks)
    .leftJoin(tasks, eq(projectTasks.taskId, tasks.id))
    .where(eq(projectTasks.projectId, id))
  const total = projectTaskList.length
  const done = projectTaskList.filter((r) => r.task?.status === 'done').length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  await db.update(projects).set({ progressPct: pct, updatedAt: new Date() }).where(eq(projects.id, id))
  return c.json({ total, done, progressPct: pct })
})

projectsRouter.post('/:id/workspace', async (c) => {
  const id = c.req.param('id')
  const [project] = await db.select().from(projects).where(eq(projects.id, id))
  if (!project) return c.json({ error: 'Not found' }, 404)
  const workspacePath = await initProjectWorkspace(project)
  await db.update(projects).set({ workspacePath, updatedAt: new Date() }).where(eq(projects.id, id))
  return c.json({ ok: true, workspacePath })
})

export default projectsRouter
