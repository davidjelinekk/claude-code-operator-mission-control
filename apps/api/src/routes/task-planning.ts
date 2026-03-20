import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/client.js'
import { taskPlanningSessions, tasks, boards } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { config } from '../config.js'
import { sessionManager } from '../services/claude-code/agent-sdk-client.js'

const router = new Hono()

export const taskPlanningCallbackRouter = new Hono()

const AgentCallbackSchema = z.object({
  question: z.string().optional(),
  options: z.array(z.string()).optional(),
  status: z.string().optional(),
  spec: z
    .object({
      title: z.string().optional(),
      summary: z.string().optional(),
      deliverables: z.array(z.string()).optional(),
      success_criteria: z.array(z.string()).optional(),
    })
    .optional(),
  suggestedAgents: z
    .array(
      z.object({
        name: z.string(),
        role: z.string().optional(),
        avatar_emoji: z.string().optional(),
      }),
    )
    .optional(),
})

taskPlanningCallbackRouter.post(
  '/tasks/:taskId/planning/agent',
  zValidator('json', AgentCallbackSchema),
  async (c) => {
    const taskId = c.req.param('taskId')
    const sid = c.req.query('sid')

    if (!sid) return c.json({ error: 'Missing sid' }, 401)

    const [session] = await db
      .select()
      .from(taskPlanningSessions)
      .where(and(eq(taskPlanningSessions.taskId, taskId), eq(taskPlanningSessions.status, 'active')))
      .orderBy(desc(taskPlanningSessions.createdAt))
      .limit(1)

    if (!session || session.id !== sid) return c.json({ error: 'Unauthorized' }, 401)

    const data = c.req.valid('json')

    const messages = [
      ...(session.messages ?? []),
      {
        role: 'agent',
        content: data.question ?? (data.spec ? JSON.stringify(data.spec) : ''),
        timestamp: new Date().toISOString(),
      },
    ]

    const updates: Record<string, unknown> = { messages, updatedAt: new Date() }
    if (data.spec) updates['planningSpec'] = data.spec
    if (data.suggestedAgents) updates['suggestedAgents'] = data.suggestedAgents
    if (data.status === 'completed') updates['status'] = 'completed'

    const [updated] = await db
      .update(taskPlanningSessions)
      .set(updates)
      .where(eq(taskPlanningSessions.id, session.id))
      .returning()

    return c.json(updated)
  },
)

router.get('/tasks/:taskId/planning', async (c) => {
  const taskId = c.req.param('taskId')
  const [session] = await db
    .select()
    .from(taskPlanningSessions)
    .where(eq(taskPlanningSessions.taskId, taskId))
    .orderBy(desc(taskPlanningSessions.createdAt))
    .limit(1)
  if (!session) return c.json({ error: 'Not found' }, 404)
  return c.json(session)
})

router.post('/tasks/:taskId/planning/start', async (c) => {
  const taskId = c.req.param('taskId')

  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId))
  if (!task) return c.json({ error: 'Task not found' }, 404)

  const [board] = await db.select().from(boards).where(eq(boards.id, task.boardId))
  if (!board) return c.json({ error: 'Board not found' }, 404)

  // Cancel any active sessions
  await db
    .update(taskPlanningSessions)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(and(eq(taskPlanningSessions.taskId, taskId), eq(taskPlanningSessions.status, 'active')))

  const sessionKey = `operator:planning:${taskId}`

  const [session] = await db
    .insert(taskPlanningSessions)
    .values({
      taskId,
      boardId: board.id,
      status: 'active',
      sessionKey,
      messages: [],
    })
    .returning()

  const callbackUrl = `${config.BASE_URL}/plan/tasks/${taskId}/planning/agent?sid=${session.id}`
  const prompt = `TASK PLANNING REQUEST

Board: ${board.name}
Task: ${task.title}
Description: ${task.description ?? '(not provided)'}

You are a planning agent. Ask 3-5 focused questions to clarify this task. Ask one at a time with multiple-choice options where possible. When done, POST your final spec back to: ${callbackUrl}`

  // Spawn planning via Agent SDK if available
  if (sessionManager.getStatus().available) {
    try {
      const spawnResult = await sessionManager.spawn({
        prompt,
        callerContext: 'task-planning',
        boardId: board.id,
        taskId,
        persistSession: true,
      })
      // Store the SDK session ID so we can resume later with follow-up answers
      await db
        .update(taskPlanningSessions)
        .set({ sessionKey: spawnResult.sessionId })
        .where(eq(taskPlanningSessions.id, session.id))
    } catch {
      // Agent spawn failure is non-blocking
    }
  }

  return c.json(session, 201)
})

router.post(
  '/tasks/:taskId/planning/answer',
  zValidator('json', z.object({ answer: z.string().min(1) })),
  async (c) => {
    const taskId = c.req.param('taskId')
    const { answer } = c.req.valid('json')

    const [session] = await db
      .select()
      .from(taskPlanningSessions)
      .where(and(eq(taskPlanningSessions.taskId, taskId), eq(taskPlanningSessions.status, 'active')))
      .orderBy(desc(taskPlanningSessions.createdAt))
      .limit(1)

    if (!session) return c.json({ error: 'No active planning session' }, 404)

    const messages = [
      ...(session.messages ?? []),
      { role: 'user', content: answer, timestamp: new Date().toISOString() },
    ]

    // Send follow-up via Agent SDK — resume existing session if we have a sessionKey
    if (sessionManager.getStatus().available && session.sessionKey) {
      try {
        await sessionManager.spawn({
          prompt: answer,
          resume: session.sessionKey,
          callerContext: 'task-planning',
          boardId: session.boardId,
          taskId,
        })
      } catch {
        // Agent spawn failure is non-blocking
      }
    }

    const [updated] = await db
      .update(taskPlanningSessions)
      .set({ messages, updatedAt: new Date() })
      .where(eq(taskPlanningSessions.id, session.id))
      .returning()

    return c.json(updated)
  },
)

router.delete('/tasks/:taskId/planning', async (c) => {
  const taskId = c.req.param('taskId')
  await db
    .update(taskPlanningSessions)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(and(eq(taskPlanningSessions.taskId, taskId), eq(taskPlanningSessions.status, 'active')))
  return c.json({ ok: true })
})

export default router
