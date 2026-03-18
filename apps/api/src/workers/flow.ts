import { db } from '../db/client.js'
import { agentFlowEdges, tasks, boards } from '../db/schema.js'
import { redis } from '../lib/redis.js'
import { gte, isNotNull, and, eq, notExists } from 'drizzle-orm'
import { workerRegistry } from '../lib/workerRegistry.js'

// Derive dispatch edges from tasks that recently became in_progress.
// Runs every 2 minutes; uses a 6-minute lookback so no transition is missed
// even if a run is slightly delayed. Deduplicates by checking whether an edge
// for the same task already exists before inserting.
async function runFlowTail(): Promise<void> {
  const since = new Date(Date.now() - 6 * 60 * 1000) // 6-minute lookback

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
    .limit(100)

  if (dispatchedTasks.length === 0) {
    workerRegistry.record('flowTail', true)
    return
  }

  const toInsert: typeof agentFlowEdges.$inferInsert[] = []

  for (const t of dispatchedTasks) {
    // Skip if we already have an explicit edge for this task
    const existing = await db
      .select({ id: agentFlowEdges.id })
      .from(agentFlowEdges)
      .where(eq(agentFlowEdges.taskId, t.taskId))
      .limit(1)

    if (existing.length > 0) continue

    toInsert.push({
      fromAgentId: t.gatewayAgentId ?? 'system',
      toAgentId: t.assignedAgentId!,
      messageType: 'dispatch',
      sessionId: null,
      taskId: t.taskId,
      tokenCost: null,
      occurredAt: t.inProgressAt!,
      rawLogLine: null,
    })
  }

  if (toInsert.length === 0) {
    workerRegistry.record('flowTail', true)
    return
  }

  const inserted = await db.insert(agentFlowEdges)
    .values(toInsert)
    .onConflictDoNothing()
    .returning()

  if (inserted.length > 0) {
    await redis.publish('flow:edges', JSON.stringify({ edges: inserted }))
  }

  workerRegistry.record('flowTail', true)
}

export const flowTailWorker = {
  run: async () => {
    try {
      await runFlowTail()
    } catch (err) {
      workerRegistry.record('flowTail', false)
      throw err
    }
  },
}
