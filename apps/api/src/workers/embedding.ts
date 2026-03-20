import pino from 'pino'
import { db } from '../db/client.js'
import { sql } from 'drizzle-orm'
import { embedAndStore } from '../services/embedding/embed.js'
import { isEmbeddingAvailable, resetAvailabilityCache } from '../services/embedding/client.js'
import { workerRegistry } from '../lib/workerRegistry.js'

const log = pino({ name: 'embedding-worker' })
const BATCH_SIZE = 20
const MAX_PER_RUN = 200 // cap total records per invocation to avoid runaway

async function findUnembeddedRecords(
  table: 'board_memory' | 'activity_events' | 'tasks',
  limit: number,
): Promise<{ id: string; content: string; metadata: Record<string, unknown> }[]> {
  if (table === 'board_memory') {
    const rows = await db.execute(sql`
      SELECT bm.id, bm.content, bm.board_id, bm.tags
      FROM board_memory bm
      LEFT JOIN embeddings e ON e.source_table = 'board_memory' AND e.source_id = bm.id::text
      WHERE e.id IS NULL AND bm.content IS NOT NULL AND length(bm.content) > 10
      LIMIT ${limit}
    `)
    return (rows as any[]).map((r) => ({
      id: String(r.id),
      content: r.content,
      metadata: { boardId: r.board_id, tags: r.tags },
    }))
  }

  if (table === 'activity_events') {
    const rows = await db.execute(sql`
      SELECT ae.id, ae.message, ae.board_id, ae.event_type, ae.agent_id
      FROM activity_events ae
      LEFT JOIN embeddings e ON e.source_table = 'activity_events' AND e.source_id = ae.id::text
      WHERE e.id IS NULL AND ae.message IS NOT NULL AND length(ae.message) > 20
        AND ae.event_type IN ('task.completed', 'task.note', 'approval.resolved', 'board.chat', 'board.memory')
      LIMIT ${limit}
    `)
    return (rows as any[]).map((r) => ({
      id: String(r.id),
      content: r.message,
      metadata: { boardId: r.board_id, eventType: r.event_type, agentId: r.agent_id },
    }))
  }

  // tasks
  const rows = await db.execute(sql`
    SELECT t.id, t.title, t.description, t.board_id, t.status, t.assigned_agent_id
    FROM tasks t
    LEFT JOIN embeddings e ON e.source_table = 'tasks' AND e.source_id = t.id::text
    WHERE e.id IS NULL AND t.title IS NOT NULL
    LIMIT ${limit}
  `)
  return (rows as any[]).map((r) => ({
    id: String(r.id),
    content: `${r.title}${r.description ? ': ' + r.description : ''}`,
    metadata: { boardId: r.board_id, status: r.status, agentId: r.assigned_agent_id },
  }))
}

async function runEmbedding(): Promise<void> {
  resetAvailabilityCache()
  const available = await isEmbeddingAvailable()
  if (!available) {
    log.warn('Ollama not available, skipping embedding run')
    workerRegistry.record('embedding', true)
    return
  }

  let totalEmbedded = 0

  for (const table of ['board_memory', 'activity_events', 'tasks'] as const) {
    let batchCount = 0
    while (totalEmbedded < MAX_PER_RUN) {
      const records = await findUnembeddedRecords(table, BATCH_SIZE)
      if (records.length === 0) break

      for (const record of records) {
        try {
          const ok = await embedAndStore(table, record.id, record.content, record.metadata)
          if (ok) totalEmbedded++
        } catch (err) {
          log.warn({ err, table, id: record.id }, 'failed to embed record')
        }
      }

      batchCount++
      if (records.length < BATCH_SIZE) break // no more records
      if (batchCount >= 10) break // safety: max 10 batches per table per run
    }
  }

  if (totalEmbedded > 0) {
    log.info({ totalEmbedded }, 'embedding run complete')
  }
  workerRegistry.record('embedding', true)
}

export const embeddingWorker = { run: runEmbedding }
