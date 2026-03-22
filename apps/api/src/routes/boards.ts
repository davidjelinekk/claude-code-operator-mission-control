import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { db } from '../db/client.js'
import { boards, tasks, approvals } from '../db/schema.js'
import { eq, desc, count, lt, ne, asc, and, sql } from 'drizzle-orm'
import { CreateBoardSchema, UpdateBoardSchema } from '@claude-code-operator/shared-types'
import { redis } from '../lib/redis.js'
import { slugify } from '../lib/slugify.js'

export const boardsRouter = new Hono()

boardsRouter.get('/', async (c) => {
  const result = await db.select().from(boards).orderBy(desc(boards.createdAt))
  return c.json(result)
})

boardsRouter.post('/', zValidator('json', CreateBoardSchema), async (c) => {
  const { targetDate, ...rest } = c.req.valid('json')
  const slug = rest.slug ?? slugify(rest.name)
  const values = {
    ...rest,
    slug,
    ...(targetDate !== undefined && { targetDate: targetDate ? new Date(targetDate) : null }),
  }
  const [board] = await db.insert(boards).values(values).returning()
  return c.json(board, 201)
})

boardsRouter.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [board] = await db.select().from(boards).where(eq(boards.id, id))
  if (!board) return c.json({ error: 'Not found' }, 404)
  return c.json(board)
})

boardsRouter.patch('/:id', zValidator('json', UpdateBoardSchema), async (c) => {
  const id = c.req.param('id')
  const { targetDate, ...rest } = c.req.valid('json')
  const updates = {
    ...rest,
    ...(targetDate !== undefined && { targetDate: targetDate ? new Date(targetDate) : null }),
    updatedAt: new Date(),
  }
  const [board] = await db.update(boards).set(updates).where(eq(boards.id, id)).returning()
  if (!board) return c.json({ error: 'Not found' }, 404)
  return c.json(board)
})

boardsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const [board] = await db.select().from(boards).where(eq(boards.id, id))
  if (!board) return c.json({ error: 'Not found' }, 404)

  // FK cascades handle tasks, approvals, activity_events, board_memory, etc.
  await db.delete(boards).where(eq(boards.id, id))
  return c.json({ ok: true })
})

boardsRouter.get('/:id/summary', async (c) => {
  const id = c.req.param('id')
  const [board] = await db
    .select({ id: boards.id, name: boards.name, slug: boards.slug, objective: boards.objective })
    .from(boards)
    .where(eq(boards.id, id))
  if (!board) return c.json({ error: 'Not found' }, 404)

  const statusList = ['inbox', 'in_progress', 'review', 'done'] as const
  const countRows = await db
    .select({ status: tasks.status, count: count() })
    .from(tasks)
    .where(eq(tasks.boardId, id))
    .groupBy(tasks.status)

  const taskCounts = { inbox: 0, in_progress: 0, review: 0, done: 0, total: 0 }
  for (const row of countRows) {
    const s = row.status as typeof statusList[number]
    if (s in taskCounts) taskCounts[s] = Number(row.count)
    taskCounts.total += Number(row.count)
  }

  const inProgress = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      assignedAgentId: tasks.assignedAgentId,
      priority: tasks.priority,
      inProgressAt: tasks.inProgressAt,
    })
    .from(tasks)
    .where(and(eq(tasks.boardId, id), eq(tasks.status, 'in_progress')))
    .orderBy(asc(tasks.inProgressAt))
    .limit(20)

  const overdue = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      dueAt: tasks.dueAt,
      status: tasks.status,
      assignedAgentId: tasks.assignedAgentId,
    })
    .from(tasks)
    .where(and(eq(tasks.boardId, id), lt(tasks.dueAt, new Date()), ne(tasks.status, 'done')))
    .orderBy(asc(tasks.dueAt))
    .limit(10)

  const recentlyCompleted = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      outcome: tasks.outcome,
      completedAt: tasks.completedAt,
      assignedAgentId: tasks.assignedAgentId,
    })
    .from(tasks)
    .where(and(eq(tasks.boardId, id), eq(tasks.status, 'done')))
    .orderBy(desc(sql`COALESCE(${tasks.completedAt}, ${tasks.updatedAt})`))
    .limit(10)

  const [pendingRow] = await db
    .select({ count: count() })
    .from(approvals)
    .where(and(eq(approvals.boardId, id), eq(approvals.status, 'pending')))

  return c.json({
    board,
    taskCounts,
    inProgress,
    overdue,
    recentlyCompleted,
    pendingApprovals: Number(pendingRow?.count ?? 0),
  })
})

boardsRouter.get('/:id/snapshot', async (c) => {
  const id = c.req.param('id')
  const [board] = await db.select().from(boards).where(eq(boards.id, id))
  if (!board) return c.json({ error: 'Not found' }, 404)
  const boardTasks = await db.select().from(tasks).where(eq(tasks.boardId, id)).orderBy(desc(tasks.createdAt)).limit(500)
  const boardApprovals = await db.select().from(approvals).where(eq(approvals.boardId, id)).orderBy(desc(approvals.createdAt)).limit(50)
  return c.json({ board, tasks: boardTasks, approvals: boardApprovals })
})

export default boardsRouter
