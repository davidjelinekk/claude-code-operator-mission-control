import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { db } from '../db/client.js'
import { tasks, taskDependencies, approvals, boards, activityEvents, projects } from '../db/schema.js'
import { eq, and, desc, asc, sql, count, type SQL } from 'drizzle-orm'
import { CreateTaskSchema, UpdateTaskSchema } from '@claude-code-operator/shared-types'
import { redis } from '../lib/redis.js'
import { config } from '../config.js'
import { z } from 'zod'
import { dispatchWebhookEvent } from '../lib/webhookDispatcher.js'
import { discoverAgents } from '../services/claude-code/agent-discovery.js'
import { sessionManager } from '../services/claude-code/agent-sdk-client.js'

function getKnownAgentIds(): Set<string> {
  try {
    const agents = discoverAgents()
    return new Set(agents.map((a) => a.id))
  } catch {
    return new Set()
  }
}

function parseMentions(message: string, knownAgents: Set<string>): string[] {
  const matches = message.match(/@([\w-]+)/g)
  if (!matches) return []
  return [...new Set(matches.map((m) => m.slice(1)).filter((id) => knownAgents.has(id)))]
}

const UpdateTaskWithOutcomeSchema = UpdateTaskSchema.extend({
  outcome: z.enum(['success', 'failed', 'partial', 'abandoned']).optional(),
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const tasksRouter = new Hono()

// Validate :id param is a proper UUID before hitting Postgres
const NAMED_ROUTES = new Set(['queue', 'batch', 'overdue'])
tasksRouter.use('/:id/:rest{.*}?', async (c, next) => {
  const id = c.req.param('id')
  if (!id || NAMED_ROUTES.has(id) || UUID_RE.test(id)) {
    return next()
  }
  return c.json({ error: 'Invalid task ID format' }, 400)
})

tasksRouter.get('/', async (c) => {
  const boardId = c.req.query('boardId')
  const projectId = c.req.query('projectId')
  const status = c.req.query('status')
  const assignedAgentId = c.req.query('assignedAgentId')
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10) || 50, 200)
  const offset = Math.max(parseInt(c.req.query('offset') ?? '0', 10) || 0, 0)

  const conditions: SQL[] = []
  if (boardId) conditions.push(eq(tasks.boardId, boardId))
  if (projectId) conditions.push(eq(tasks.projectId, projectId))
  if (status) conditions.push(eq(tasks.status, status))
  if (assignedAgentId) conditions.push(eq(tasks.assignedAgentId, assignedAgentId))

  const where = conditions.length > 0 ? and(...conditions) : undefined

  const [result, [{ total }]] = await Promise.all([
    db.select().from(tasks).where(where).orderBy(desc(tasks.createdAt)).limit(limit).offset(offset),
    db.select({ total: count() }).from(tasks).where(where),
  ])

  c.header('X-Total-Count', String(total))
  return c.json(result)
})

tasksRouter.post('/', zValidator('json', CreateTaskSchema), async (c) => {
  const data = c.req.valid('json')
  const [task] = await db.insert(tasks).values({
    ...data,
    dueAt: data.dueAt ? new Date(data.dueAt) : undefined,
  }).returning()
  await redis.publish(`board:${task.boardId}`, JSON.stringify({ type: 'task.created', task }))
  dispatchWebhookEvent({ type: 'task.created', boardId: task.boardId, payload: task })
  return c.json(task, 201)
})

// Task queue — prioritized inbox tasks for agents
tasksRouter.get('/queue', async (c) => {
  const boardId = c.req.query('boardId')
  const agentId = c.req.query('agentId')
  const limit = Math.min(parseInt(c.req.query('limit') ?? '10', 10) || 10, 100)
  const respectDeps = c.req.query('respectDeps') === 'true'

  const conditions: SQL[] = [eq(tasks.status, 'inbox')]
  if (boardId) conditions.push(eq(tasks.boardId, boardId))
  if (agentId) conditions.push(eq(tasks.assignedAgentId, agentId))
  if (respectDeps) {
    conditions.push(
      sql`NOT EXISTS (
        SELECT 1 FROM task_dependencies td
        JOIN tasks dep ON dep.id = td.depends_on_task_id
        WHERE td.task_id = ${tasks.id} AND dep.status != 'done'
      )`
    )
  }

  const result = await db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(
      sql`CASE WHEN ${tasks.priority} = 'high' THEN 2 WHEN ${tasks.priority} = 'medium' THEN 1 ELSE 0 END DESC`,
      asc(tasks.createdAt),
    )
    .limit(limit)

  return c.json(result)
})

tasksRouter.post('/batch', zValidator('json', z.object({ tasks: z.array(CreateTaskSchema).min(1).max(100) })), async (c) => {
  const { tasks: taskList } = c.req.valid('json')
  const rows = taskList.map((t) => ({ ...t, dueAt: t.dueAt ? new Date(t.dueAt) : undefined }))
  const created = await db.insert(tasks).values(rows).returning()
  const boardIds = [...new Set(created.map((t) => t.boardId))]
  await Promise.all(
    boardIds.map((boardId) =>
      redis.publish(
        `board:${boardId}`,
        JSON.stringify({ type: 'task.batch_created', tasks: created.filter((t) => t.boardId === boardId) }),
      ),
    ),
  )
  return c.json(created, 201)
})

// Overdue tasks — status in inbox/in_progress/review with dueAt < now
tasksRouter.get('/overdue', async (c) => {
  const boardId = c.req.query('boardId')
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10) || 20, 100)

  let q = db.select().from(tasks).$dynamic()
  q = q.where(
    and(
      sql`${tasks.status} IN ('inbox', 'in_progress', 'review')`,
      sql`${tasks.dueAt} IS NOT NULL AND ${tasks.dueAt} < NOW()`,
      ...(boardId ? [eq(tasks.boardId, boardId)] : []),
    )
  )
  q = q.orderBy(asc(tasks.dueAt)).limit(limit)

  const result = await q
  return c.json(result)
})

tasksRouter.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id))
  if (!task) return c.json({ error: 'Not found' }, 404)
  return c.json(task)
})

tasksRouter.patch('/:id', zValidator('json', UpdateTaskWithOutcomeSchema), async (c) => {
  const id = c.req.param('id')
  const data = c.req.valid('json')

  const [existingTask] = await db.select().from(tasks).where(eq(tasks.id, id))
  if (!existingTask) return c.json({ error: 'Not found' }, 404)

  const statusChanging = data.status !== undefined && data.status !== existingTask.status

  if (statusChanging) {
    const [board] = await db.select().from(boards).where(eq(boards.id, existingTask.boardId))

    if (board) {
      // 1. blockStatusChangesWithPendingApproval
      if (board.blockStatusChangesWithPendingApproval) {
        const [pendingApproval] = await db.select().from(approvals)
          .where(and(eq(approvals.taskId, id), eq(approvals.status, 'pending')))
        if (pendingApproval) {
          return c.json({ error: 'Status change blocked: this task has a pending approval.' }, 409)
        }
      }

      // 2. requireReviewBeforeDone
      if (board.requireReviewBeforeDone && data.status === 'done' && existingTask.status !== 'review') {
        return c.json({ error: 'Task must pass through Review before being marked Done.' }, 409)
      }

      // 3. requireApprovalForDone
      if (board.requireApprovalForDone && data.status === 'done') {
        const [approvedApproval] = await db.select().from(approvals)
          .where(and(eq(approvals.taskId, id), eq(approvals.status, 'approved')))
        if (!approvedApproval) {
          return c.json({ error: 'An approved approval is required before marking Done.' }, 409)
        }
      }

      // 4. onlyLeadCanChangeStatus
      if (board.onlyLeadCanChangeStatus) {
        const agentId = c.req.header('x-agent-id')
        if (!agentId || agentId !== board.gatewayAgentId) {
          return c.json({ error: 'Only the lead agent can change task status.' }, 403)
        }
      }
    }
  }

  const updates: Record<string, unknown> = {
    ...data,
    updatedAt: new Date(),
    dueAt: data.dueAt != null ? new Date(data.dueAt) : data.dueAt,
  }
  if (data.status === 'in_progress') updates['inProgressAt'] = new Date()
  if (data.status === 'done' && existingTask.status !== 'done') updates['completedAt'] = new Date()
  const [task] = await db.update(tasks).set(updates).where(eq(tasks.id, id)).returning()
  if (!task) return c.json({ error: 'Not found' }, 404)
  await redis.publish(`board:${task.boardId}`, JSON.stringify({ type: 'task.updated', task }))
  dispatchWebhookEvent({ type: 'task.updated', boardId: task.boardId, payload: task })

  // Auto-update project progress when a task is marked done
  if (data.status === 'done' && task.projectId) {
    const [totalRow] = await db.select({ total: count() }).from(tasks).where(eq(tasks.projectId, task.projectId))
    const [doneRow] = await db.select({ done: count() }).from(tasks).where(and(eq(tasks.projectId, task.projectId), eq(tasks.status, 'done')))
    const total = totalRow?.total ?? 0
    const done = doneRow?.done ?? 0
    const progressPct = total > 0 ? Math.round((done / total) * 100) : 0
    await db.update(projects).set({ progressPct, updatedAt: new Date() }).where(eq(projects.id, task.projectId))
  }

  return c.json(task)
})

// Atomic claim — prevents two agents from claiming the same task
tasksRouter.post('/:id/claim', zValidator('json', z.object({ agentId: z.string().min(1) })), async (c) => {
  const id = c.req.param('id')
  const { agentId } = c.req.valid('json')

  const [task] = await db
    .update(tasks)
    .set({ status: 'in_progress', assignedAgentId: agentId, inProgressAt: new Date(), updatedAt: new Date() })
    .where(and(eq(tasks.id, id), eq(tasks.status, 'inbox')))
    .returning()

  if (!task) return c.json({ error: 'already claimed' }, 409)
  await redis.publish(`board:${task.boardId}`, JSON.stringify({ type: 'task.updated', task }))
  return c.json(task)
})

// Task notes — stored as activityEvents with eventType 'task.note'
tasksRouter.get('/:id/notes', async (c) => {
  const taskId = c.req.param('id')
  const notes = await db
    .select()
    .from(activityEvents)
    .where(and(eq(activityEvents.taskId, taskId), eq(activityEvents.eventType, 'task.note')))
    .orderBy(desc(activityEvents.createdAt))
  return c.json(notes)
})

tasksRouter.post(
  '/:id/notes',
  zValidator('json', z.object({ message: z.string().min(1), agentId: z.string().optional(), metadata: z.record(z.unknown()).optional() })),
  async (c) => {
    const taskId = c.req.param('id')
    const { message, agentId, metadata } = c.req.valid('json')

    const [task] = await db.select({ boardId: tasks.boardId }).from(tasks).where(eq(tasks.id, taskId))
    if (!task) return c.json({ error: 'Not found' }, 404)

    const [note] = await db
      .insert(activityEvents)
      .values({ taskId, boardId: task.boardId, agentId, eventType: 'task.note', message, metadata })
      .returning()

    // @mention routing: create task.mention events and spawn agent sessions
    const mentioned = parseMentions(message, getKnownAgentIds())
    for (const mentionedAgentId of mentioned) {
      await db.insert(activityEvents).values({
        taskId,
        boardId: task.boardId,
        agentId: mentionedAgentId,
        eventType: 'task.mention',
        message: `Mentioned by ${agentId ?? 'unknown'}: ${message.slice(0, 200)}`,
        metadata: { mentionedBy: agentId, noteId: note.id },
      })
      await redis.publish(`board:${task.boardId}`, JSON.stringify({
        type: 'task.mention',
        taskId,
        mentionedAgentId,
        mentionedBy: agentId,
        noteId: note.id,
      }))

      // Spawn agent session for the mentioned agent
      if (sessionManager.getStatus().available) {
        sessionManager.spawn({
          prompt: `You were mentioned in a task note.\nTask ID: ${taskId}\nMentioned by: ${agentId ?? 'unknown'}\nMessage: ${message}`,
          agent: mentionedAgentId,
          callerContext: 'task-mention',
          boardId: task.boardId,
          taskId,
          maxTurns: 3,
          permissionMode: 'plan',
        }).catch(() => {})
      }
    }

    return c.json(note, 201)
  },
)

// Cancel task — sets status=abandoned, outcome=abandoned
tasksRouter.post('/:id/cancel', zValidator('json', z.object({ reason: z.string().optional() })), async (c) => {
  const id = c.req.param('id')
  const { reason } = c.req.valid('json')

  const [existing] = await db.select().from(tasks).where(eq(tasks.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.status === 'done') return c.json({ error: 'Cannot cancel a completed task' }, 409)

  const [task] = await db
    .update(tasks)
    .set({ status: 'abandoned', outcome: 'abandoned', updatedAt: new Date() })
    .where(eq(tasks.id, id))
    .returning()

  await redis.publish(`board:${task.boardId}`, JSON.stringify({ type: 'task.cancelled', task }))
  dispatchWebhookEvent({ type: 'task.cancelled', boardId: task.boardId, payload: task })

  if (reason) {
    await db.insert(activityEvents).values({
      taskId: id,
      boardId: task.boardId,
      eventType: 'task.note',
      message: `Task cancelled: ${reason}`,
    })
  }

  return c.json(task)
})

tasksRouter.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id))
  if (!task) return c.json({ error: 'Not found' }, 404)
  await db.delete(tasks).where(eq(tasks.id, id))
  await redis.publish(`board:${task.boardId}`, JSON.stringify({ type: 'task.deleted', taskId: id }))
  dispatchWebhookEvent({ type: 'task.deleted', boardId: task.boardId, payload: { id } })
  return c.json({ ok: true })
})

// Dependencies
tasksRouter.get('/:id/deps', async (c) => {
  const id = c.req.param('id')
  const deps = await db.select().from(taskDependencies).where(eq(taskDependencies.taskId, id))
  const blockedBy = await db.select().from(taskDependencies).where(eq(taskDependencies.dependsOnTaskId, id))
  return c.json({ blockedBy: deps, blocking: blockedBy })
})

tasksRouter.post('/:id/deps', zValidator('json', z.object({ dependsOnTaskId: z.string().uuid() })), async (c) => {
  const taskId = c.req.param('id')
  const { dependsOnTaskId } = c.req.valid('json')
  if (taskId === dependsOnTaskId) return c.json({ error: 'Self-dependency not allowed' }, 400)

  // Cycle detection: walk the dependency chain from dependsOnTaskId to see if it reaches taskId
  const visited = new Set<string>()
  const queue = [dependsOnTaskId]
  while (queue.length > 0) {
    if (visited.size > 200) return c.json({ error: 'Dependency chain too deep' }, 400)
    const current = queue.pop()!
    if (current === taskId) return c.json({ error: 'Circular dependency detected' }, 409)
    if (visited.has(current)) continue
    visited.add(current)
    const upstream = await db.select({ dep: taskDependencies.dependsOnTaskId })
      .from(taskDependencies).where(eq(taskDependencies.taskId, current))
    for (const { dep } of upstream) queue.push(dep)
  }

  await db.insert(taskDependencies).values({ taskId, dependsOnTaskId }).onConflictDoNothing()
  return c.json({ ok: true }, 201)
})

tasksRouter.delete('/:id/deps/:depId', async (c) => {
  const taskId = c.req.param('id')
  const depId = c.req.param('depId')
  await db.delete(taskDependencies).where(and(eq(taskDependencies.taskId, taskId), eq(taskDependencies.dependsOnTaskId, depId)))
  return c.json({ ok: true })
})

export default tasksRouter
