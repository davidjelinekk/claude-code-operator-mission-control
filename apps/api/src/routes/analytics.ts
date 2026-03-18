import { Hono } from 'hono'
import { db } from '../db/client.js'
import { tokenEvents, tasks } from '../db/schema.js'
import { eq, gte, lte, and, sql, desc } from 'drizzle-orm'
import { analyticsIngestWorker } from '../workers/analytics.js'

export const analyticsRouter = new Hono()

analyticsRouter.get('/summary', async (c) => {
  const from = c.req.query('from')
  const to = c.req.query('to')

  let where = sql`1=1`
  if (from) where = sql`${where} AND ${tokenEvents.turnTimestamp} >= ${from}::timestamptz`
  if (to) where = sql`${where} AND ${tokenEvents.turnTimestamp} <= ${to}::timestamptz`

  const [result] = await db.select({
    totalCostUsd: sql<string>`COALESCE(SUM(CAST(${tokenEvents.costUsd} AS NUMERIC)), 0)::text`,
    totalInputTokens: sql<number>`COALESCE(SUM(${tokenEvents.inputTokens}), 0)::int`,
    totalOutputTokens: sql<number>`COALESCE(SUM(${tokenEvents.outputTokens}), 0)::int`,
    totalCacheReadTokens: sql<number>`COALESCE(SUM(${tokenEvents.cacheReadTokens}), 0)::int`,
    totalCacheWriteTokens: sql<number>`COALESCE(SUM(${tokenEvents.cacheWriteTokens}), 0)::int`,
    turnCount: sql<number>`COUNT(*)::int`,
  }).from(tokenEvents).where(where)

  const totalPromptTokens = result.totalInputTokens + result.totalCacheReadTokens + result.totalCacheWriteTokens
  const cacheHitPct = totalPromptTokens > 0
    ? (result.totalCacheReadTokens / totalPromptTokens) * 100
    : 0

  let mostExpensiveAgent: { agentId: string; name: string; totalCostUsd: string } | null = null
  const agentWhere = where
  const [topAgent] = await db.select({
    agentId: tokenEvents.agentId,
    totalCostUsd: sql<string>`SUM(CAST(${tokenEvents.costUsd} AS NUMERIC))::text`,
  }).from(tokenEvents).where(agentWhere).groupBy(tokenEvents.agentId).orderBy(sql`SUM(CAST(${tokenEvents.costUsd} AS NUMERIC)) DESC`).limit(1)

  if (topAgent) {
    mostExpensiveAgent = { agentId: topAgent.agentId, name: topAgent.agentId, totalCostUsd: topAgent.totalCostUsd }
  }

  return c.json({ ...result, cacheHitPct: Math.round(cacheHitPct * 10) / 10, mostExpensiveAgent })
})

analyticsRouter.get('/by-agent', async (c) => {
  const from = c.req.query('from')
  const to = c.req.query('to')

  let where = sql`1=1`
  if (from) where = sql`${where} AND ${tokenEvents.turnTimestamp} >= ${from}::timestamptz`
  if (to) where = sql`${where} AND ${tokenEvents.turnTimestamp} <= ${to}::timestamptz`

  const result = await db.select({
    agentId: tokenEvents.agentId,
    totalCostUsd: sql<string>`SUM(CAST(${tokenEvents.costUsd} AS NUMERIC))::text`,
    inputTokens: sql<number>`SUM(${tokenEvents.inputTokens})::int`,
    outputTokens: sql<number>`SUM(${tokenEvents.outputTokens})::int`,
    cacheReadTokens: sql<number>`SUM(${tokenEvents.cacheReadTokens})::int`,
    cacheWriteTokens: sql<number>`SUM(${tokenEvents.cacheWriteTokens})::int`,
    turnCount: sql<number>`COUNT(*)::int`,
  }).from(tokenEvents).where(where).groupBy(tokenEvents.agentId).orderBy(sql`SUM(CAST(${tokenEvents.costUsd} AS NUMERIC)) DESC`)

  return c.json(result)
})

analyticsRouter.get('/by-model', async (c) => {
  const from = c.req.query('from')
  const to = c.req.query('to')

  let where = sql`1=1`
  if (from) where = sql`${where} AND ${tokenEvents.turnTimestamp} >= ${from}::timestamptz`
  if (to) where = sql`${where} AND ${tokenEvents.turnTimestamp} <= ${to}::timestamptz`

  const result = await db.select({
    modelId: tokenEvents.modelId,
    provider: tokenEvents.provider,
    totalCostUsd: sql<string>`SUM(CAST(${tokenEvents.costUsd} AS NUMERIC))::text`,
    inputTokens: sql<number>`SUM(${tokenEvents.inputTokens})::int`,
    outputTokens: sql<number>`SUM(${tokenEvents.outputTokens})::int`,
    turnCount: sql<number>`COUNT(*)::int`,
  }).from(tokenEvents).where(where).groupBy(tokenEvents.modelId, tokenEvents.provider).orderBy(sql`SUM(CAST(${tokenEvents.costUsd} AS NUMERIC)) DESC`)

  return c.json(result)
})

analyticsRouter.get('/timeseries', async (c) => {
  const from = c.req.query('from')
  const to = c.req.query('to')
  const bucket = c.req.query('bucket') ?? 'hourly'

  const truncFn = bucket === 'daily' ? 'day' : 'hour'
  let where = sql`1=1`
  if (from) where = sql`${where} AND ${tokenEvents.turnTimestamp} >= ${from}::timestamptz`
  if (to) where = sql`${where} AND ${tokenEvents.turnTimestamp} <= ${to}::timestamptz`

  const result = await db.select({
    bucket: sql<string>`DATE_TRUNC('${sql.raw(truncFn)}', ${tokenEvents.turnTimestamp})::text`,
    agentId: tokenEvents.agentId,
    costUsd: sql<string>`SUM(CAST(${tokenEvents.costUsd} AS NUMERIC))::text`,
    tokens: sql<number>`SUM(${tokenEvents.inputTokens} + ${tokenEvents.outputTokens})::int`,
  }).from(tokenEvents).where(where)
    .groupBy(sql`DATE_TRUNC('${sql.raw(truncFn)}', ${tokenEvents.turnTimestamp})`, tokenEvents.agentId)
    .orderBy(sql`1`)

  return c.json(result)
})

analyticsRouter.get('/task-velocity', async (c) => {
  const start = c.req.query('start')
  const end = c.req.query('end')
  const boardId = c.req.query('boardId')

  const dateExpr = sql`COALESCE(${tasks.completedAt}, ${tasks.updatedAt})`
  let where = sql`${tasks.status} = 'done'`
  if (start) where = sql`${where} AND ${dateExpr} >= ${start}::timestamptz`
  if (end) where = sql`${where} AND ${dateExpr} <= ${end}::timestamptz`
  if (boardId) where = sql`${where} AND ${tasks.boardId} = ${boardId}::uuid`

  const result = await db.execute(
    sql`SELECT DATE_TRUNC('day', COALESCE(${tasks.completedAt}, ${tasks.updatedAt}))::text AS date, COUNT(*)::int AS count
        FROM ${tasks}
        WHERE ${where}
        GROUP BY 1
        ORDER BY 1 ASC`
  )

  return c.json([...result])
})

analyticsRouter.get('/task-outcomes', async (c) => {
  const start = c.req.query('start')
  const end = c.req.query('end')
  const boardId = c.req.query('boardId')

  let where = sql`1=1`
  if (start) where = sql`${where} AND ${tasks.createdAt} >= ${start}::timestamptz`
  if (end) where = sql`${where} AND ${tasks.createdAt} <= ${end}::timestamptz`
  if (boardId) where = sql`${where} AND ${tasks.boardId} = ${boardId}::uuid`

  const result = await db.execute(
    sql`SELECT COALESCE(${tasks.outcome}, 'none') AS outcome, COUNT(*)::int AS count
        FROM ${tasks}
        WHERE ${where}
        GROUP BY ${tasks.outcome}
        ORDER BY count DESC`
  )

  return c.json([...result])
})

analyticsRouter.get('/by-project', async (c) => {
  const from = c.req.query('from')
  const to = c.req.query('to')

  let where = sql`${tokenEvents.projectId} IS NOT NULL`
  if (from) where = sql`${where} AND ${tokenEvents.turnTimestamp} >= ${from}::timestamptz`
  if (to) where = sql`${where} AND ${tokenEvents.turnTimestamp} <= ${to}::timestamptz`

  const result = await db.select({
    projectId: tokenEvents.projectId,
    totalCostUsd: sql<string>`SUM(CAST(${tokenEvents.costUsd} AS NUMERIC))::text`,
    inputTokens: sql<number>`SUM(${tokenEvents.inputTokens})::int`,
    outputTokens: sql<number>`SUM(${tokenEvents.outputTokens})::int`,
    turnCount: sql<number>`COUNT(*)::int`,
  }).from(tokenEvents).where(where).groupBy(tokenEvents.projectId).orderBy(sql`SUM(CAST(${tokenEvents.costUsd} AS NUMERIC)) DESC`)

  return c.json(result)
})

analyticsRouter.post('/ingest', async (c) => {
  await analyticsIngestWorker.run()
  return c.json({ ok: true })
})

analyticsRouter.get('/failed-tasks', async (c) => {
  const start = c.req.query('start')
  const end = c.req.query('end')
  const boardId = c.req.query('boardId')

  let where = sql`${tasks.outcome} = 'failed'`
  if (start) where = sql`${where} AND ${tasks.completedAt} >= ${start}::timestamptz`
  if (end) where = sql`${where} AND ${tasks.completedAt} <= ${end}::timestamptz`
  if (boardId) where = sql`${where} AND ${tasks.boardId} = ${boardId}::uuid`

  const rows = await db.execute(
    sql`SELECT id AS "taskId", title, board_id AS "boardId", completed_at AS "completedAt", assigned_agent_id AS "assignedAgentId"
        FROM tasks
        WHERE ${where}
        ORDER BY completed_at DESC NULLS LAST
        LIMIT 20`
  )

  return c.json({
    count: rows.length,
    tasks: [...rows],
  })
})

export default analyticsRouter
