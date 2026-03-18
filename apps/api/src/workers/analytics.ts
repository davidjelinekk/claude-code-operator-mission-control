import { readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { createReadStream } from 'node:fs'
import { db } from '../db/client.js'
import { tokenEvents, analyticsWatermarks } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { redis } from '../lib/redis.js'
import { config } from '../config.js'

interface TokenUsage {
  input?: number
  output?: number
  cacheRead?: number
  cacheWrite?: number
  cost?: { total?: number }
}

interface MessagePayload {
  role?: string
  model?: string
  provider?: string
  usage?: TokenUsage
}

interface JsonlRecord {
  type?: string
  timestamp?: string
  message?: MessagePayload
}

function decodeProjectPath(encodedName: string): string {
  return encodedName.replace(/-/g, '/')
}

async function getWatermark(agentId: string, sessionId: string): Promise<number> {
  const [row] = await db.select().from(analyticsWatermarks)
    .where(and(eq(analyticsWatermarks.agentId, agentId), eq(analyticsWatermarks.sessionId, sessionId)))
  return row?.byteOffset ?? 0
}

async function setWatermark(agentId: string, sessionId: string, byteOffset: number): Promise<void> {
  await db.insert(analyticsWatermarks)
    .values({ agentId, sessionId, byteOffset, lastSeenAt: new Date() })
    .onConflictDoUpdate({
      target: [analyticsWatermarks.agentId, analyticsWatermarks.sessionId],
      set: { byteOffset, lastSeenAt: new Date() },
    })
}

async function processFile(projectId: string, sessionId: string, filePath: string): Promise<number> {
  const watermark = await getWatermark(projectId, sessionId)
  const stat = statSync(filePath)
  if (stat.size <= watermark) return 0

  let inserted = 0
  const events: typeof tokenEvents.$inferInsert[] = []

  const stream = createReadStream(filePath, { start: watermark, encoding: 'utf-8' })
  const rl = createInterface({ input: stream, crlfDelay: Infinity })

  for await (const line of rl) {
    if (!line.trim()) continue
    try {
      const record = JSON.parse(line) as JsonlRecord
      const msg = record.message
      if (record.type === 'message' && msg?.role === 'assistant' && msg.usage) {
        const u = msg.usage
        const costTotal = u.cost?.total ?? 0
        const ts = record.timestamp ? new Date(record.timestamp) : new Date()

        events.push({
          agentId: projectId,
          sessionId,
          provider: msg.provider ?? 'anthropic',
          modelId: msg.model ?? 'unknown',
          inputTokens: u.input ?? 0,
          outputTokens: u.output ?? 0,
          cacheReadTokens: u.cacheRead ?? 0,
          cacheWriteTokens: u.cacheWrite ?? 0,
          costUsd: costTotal.toFixed(8),
          turnTimestamp: ts,
        })
      }
    } catch {
      // skip malformed lines
    }
  }

  if (events.length > 0) {
    await db.insert(tokenEvents).values(events)
    inserted = events.length
  }

  await setWatermark(projectId, sessionId, stat.size)
  return inserted
}

async function runIngest(): Promise<void> {
  const projectsDir = join(config.CLAUDE_HOME, 'projects')
  let totalInserted = 0

  let projectDirs: string[] = []
  try {
    if (!existsSync(projectsDir)) return
    projectDirs = readdirSync(projectsDir)
  } catch (e) {
    console.error('[analytics] failed to read projects dir:', e)
    return
  }

  for (const projectDir of projectDirs) {
    const projPath = join(projectsDir, projectDir)
    let sessionFiles: string[] = []
    try {
      sessionFiles = readdirSync(projPath).filter((f) => f.endsWith('.jsonl'))
    } catch (e) {
      console.error(`[analytics] failed to read sessions for ${projectDir}:`, e)
      continue
    }

    for (const file of sessionFiles) {
      const sessionId = file.replace('.jsonl', '')
      const filePath = join(projPath, file)
      try {
        const n = await processFile(projectDir, sessionId, filePath)
        totalInserted += n
      } catch (e) {
        console.error(`[analytics] failed to process ${projectDir}/${file}:`, e)
      }
    }
  }

  if (totalInserted > 0) {
    await redis.publish('analytics.updated', JSON.stringify({ inserted: totalInserted }))
  }
}

export const analyticsIngestWorker = {
  run: runIngest,
}
