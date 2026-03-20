import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/client.js'
import { agentFlowEdges, tasks, boards } from '../db/schema.js'
import { gte, desc, isNotNull, and, eq } from 'drizzle-orm'
import { config } from '../config.js'
import { discoverAgents } from '../services/claude-code/agent-discovery.js'
import { sessionManager } from '../services/claude-code/agent-sdk-client.js'

export const flowRouter = new Hono()

// ── Agent metadata helpers ────────────────────────────────────────────────────

interface AgentMeta {
  id: string
  name: string
  emoji: string | null
  isOnline: boolean
  hasActiveSession: boolean
}

async function loadAgentMeta(): Promise<Map<string, AgentMeta>> {
  const map = new Map<string, AgentMeta>()
  try {
    const agents = discoverAgents()
    for (const a of agents) {
      map.set(a.id, {
        id: a.id,
        name: a.name,
        emoji: null,
        isOnline: false,
        hasActiveSession: false,
      })
    }
  } catch { /* agents unavailable */ }

  return map
}

// ── GET /graph ────────────────────────────────────────────────────────────────

flowRouter.get('/graph', async (c) => {
  const window = c.req.query('window') ?? '24h'
  const hours = { '1h': 1, '6h': 6, '24h': 24, '7d': 168 }[window] ?? 24
  const since = new Date(Date.now() - hours * 3600 * 1000)

  // Explicit edges written by agents / dispatch
  const explicitEdges = await db.select().from(agentFlowEdges)
    .where(gte(agentFlowEdges.occurredAt, since))
    .orderBy(desc(agentFlowEdges.occurredAt))
    .limit(500)

  // Synthetic dispatch edges: tasks that went in_progress in the window
  const dispatchedTasks = await db
    .select({
      taskId: tasks.id,
      assignedAgentId: tasks.assignedAgentId,
      inProgressAt: tasks.inProgressAt,
      gatewayAgentId: boards.gatewayAgentId,
    })
    .from(tasks)
    .innerJoin(boards, eq(tasks.boardId, boards.id))
    .where(and(
      isNotNull(tasks.assignedAgentId),
      isNotNull(tasks.inProgressAt),
      gte(tasks.inProgressAt, since),
    ))
    .limit(200)

  const syntheticEdges = dispatchedTasks.map((t) => ({
    id: `synthetic-dispatch-${t.taskId}`,
    fromAgentId: t.gatewayAgentId ?? 'system',
    toAgentId: t.assignedAgentId!,
    messageType: 'dispatch' as const,
    sessionId: null,
    taskId: t.taskId,
    tokenCost: null,
    occurredAt: t.inProgressAt!,
    rawLogLine: null,
  }))

  const allEdges = [...explicitEdges, ...syntheticEdges]

  // Collect all participating agent IDs
  const participatingIds = new Set<string>()
  for (const e of allEdges) {
    participatingIds.add(e.fromAgentId)
    participatingIds.add(e.toAgentId)
  }

  // Enrich nodes: all known agents + highlight those with edges + active sessions
  const agentMeta = await loadAgentMeta()
  const activeSessions = sessionManager.getActiveSessions()

  const allAgentIds = new Set([...participatingIds, ...agentMeta.keys()])
  const nodes = [...allAgentIds].map((id) => {
    const meta = agentMeta.get(id)
    const fallbackName = id === 'system' ? 'System' : id.length > 24 ? `${id.slice(0, 8)}…` : id
    const agentActiveSessions = activeSessions.filter(
      (s) => s.meta.callerContext && s.meta.boardId,
    ).length
    return {
      id,
      name: meta?.name ?? fallbackName,
      emoji: meta?.emoji ?? (id === 'system' ? '⚡' : null),
      isOnline: meta?.isOnline ?? false,
      hasActiveSession: activeSessions.some(
        (s) => s.meta.callerContext === id || s.meta.boardId === id,
      ),
      activeSessionCount: agentActiveSessions,
      hasEdges: participatingIds.has(id),
    }
  })

  return c.json({ nodes, edges: allEdges })
})

// ── POST /edges ───────────────────────────────────────────────────────────────

const edgeSchema = z.object({
  fromAgentId: z.string().min(1),
  toAgentId: z.string().min(1),
  messageType: z.string().min(1),
  sessionId: z.string().nullable().optional(),
  taskId: z.string().uuid().nullable().optional(),
  tokenCost: z.union([z.string(), z.number()]).nullable().optional(),
})

flowRouter.post('/edges', zValidator('json', edgeSchema), async (c) => {
  const body = c.req.valid('json')
  const [edge] = await db.insert(agentFlowEdges).values({
    fromAgentId: body.fromAgentId,
    toAgentId: body.toAgentId,
    messageType: body.messageType,
    sessionId: body.sessionId ?? null,
    taskId: body.taskId ?? null,
    tokenCost: body.tokenCost != null ? String(body.tokenCost) : null,
    occurredAt: new Date(),
  }).returning()
  return c.json(edge, 201)
})

// ── GET /edges ────────────────────────────────────────────────────────────────

flowRouter.get('/edges', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') ?? '100'), 500)
  const edges = await db.select().from(agentFlowEdges).orderBy(desc(agentFlowEdges.occurredAt)).limit(limit)
  return c.json(edges)
})

export default flowRouter
