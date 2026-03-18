import { Hono } from 'hono'
import { sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { redis } from '../lib/redis.js'
import { getAgentSdkStatus } from '../services/claude-code/agent-sdk-client.js'
import { workerRegistry } from '../lib/workerRegistry.js'
import { config } from '../config.js'

export const systemRouter = new Hono()

systemRouter.get('/status', async (c) => {
  // DB health
  let dbResult: { ok: boolean; latencyMs?: number } = { ok: false }
  try {
    const t0 = Date.now()
    await db.execute(sql`SELECT 1`)
    dbResult = { ok: true, latencyMs: Date.now() - t0 }
  } catch { /* db unreachable */ }

  // Redis health
  let redisResult: { ok: boolean; latencyMs?: number } = { ok: false }
  try {
    const t0 = Date.now()
    await redis.ping()
    redisResult = { ok: true, latencyMs: Date.now() - t0 }
  } catch { /* redis unreachable */ }

  // Agent SDK status
  const agentSdk = getAgentSdkStatus()

  // Workers
  const rawWorkers = workerRegistry.getAll()
  const workers: Record<string, { lastRunAt: string | null; ok: boolean }> = {}
  for (const [name, entry] of Object.entries(rawWorkers)) {
    workers[name] = { lastRunAt: entry.lastRunAt?.toISOString() ?? null, ok: entry.ok }
  }

  return c.json({
    db: dbResult,
    redis: redisResult,
    agentSdk,
    workers,
    env: {
      nodeEnv: config.NODE_ENV,
      port: config.PORT,
      operatorTokenPrefix: config.OPERATOR_TOKEN.slice(0, 8) + '...',
    },
  })
})

export default systemRouter
