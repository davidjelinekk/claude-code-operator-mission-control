import { readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { createReadStream } from 'node:fs'
import { db } from '../db/client.js'
import { tokenEvents, analyticsWatermarks } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { redis } from '../lib/redis.js'
import { config } from '../config.js'

// Anthropic API pricing per 1M tokens (as of 2025)
const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-opus-4-6':   { input: 15,  output: 75,  cacheRead: 1.5,  cacheWrite: 18.75 },
  'claude-sonnet-4-6': { input: 3,   output: 15,  cacheRead: 0.3,  cacheWrite: 3.75 },
  'claude-haiku-4-5':  { input: 0.8, output: 4,   cacheRead: 0.08, cacheWrite: 1 },
}

function estimateCost(model: string, input: number, output: number, cacheRead: number, cacheWrite: number): number {
  // Try exact match, then prefix match
  const pricing = MODEL_PRICING[model]
    ?? Object.entries(MODEL_PRICING).find(([k]) => model.startsWith(k))?.[1]
    ?? MODEL_PRICING['claude-sonnet-4-6'] // fallback
  return (
    (input * pricing.input +
      output * pricing.output +
      cacheRead * pricing.cacheRead +
      cacheWrite * pricing.cacheWrite) / 1_000_000
  )
}

// Claude Code JSONL format — actual record shape
interface JsonlRecord {
  type?: string
  timestamp?: string
  message?: {
    role?: string
    model?: string
    usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_read_input_tokens?: number
      cache_creation_input_tokens?: number
    }
  }
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
      // Claude Code uses type:"assistant" (not "message")
      if (record.type === 'assistant' && msg?.role === 'assistant' && msg.usage) {
        const u = msg.usage
        const inputTokens = u.input_tokens ?? 0
        const outputTokens = u.output_tokens ?? 0
        const cacheReadTokens = u.cache_read_input_tokens ?? 0
        const cacheWriteTokens = u.cache_creation_input_tokens ?? 0
        const model = msg.model ?? 'unknown'
        const costUsd = estimateCost(model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens)
        const ts = record.timestamp ? new Date(record.timestamp) : new Date()

        events.push({
          agentId: projectId,
          sessionId,
          provider: 'anthropic',
          modelId: model,
          inputTokens,
          outputTokens,
          cacheReadTokens,
          cacheWriteTokens,
          costUsd: costUsd.toFixed(8),
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
