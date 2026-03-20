import { db } from '../../db/client.js'
import { embeddings } from '../../db/schema.js'
import { embedText } from './client.js'
import { eq, and } from 'drizzle-orm'
import pino from 'pino'

const log = pino({ name: 'embed' })

export async function embedAndStore(
  sourceTable: string,
  sourceId: string,
  content: string,
  metadata?: Record<string, unknown>,
  precomputedVec?: number[],
): Promise<boolean> {
  const vec = precomputedVec ?? await embedText(content.slice(0, 8000))
  if (!vec) return false

  const vecStr = `[${vec.join(',')}]`

  try {
    await db
      .insert(embeddings)
      .values({
        sourceTable,
        sourceId,
        content: content.slice(0, 10000),
        embedding: vecStr,
        metadata: metadata ?? {},
      })
      .onConflictDoUpdate({
        target: [embeddings.sourceTable, embeddings.sourceId],
        set: {
          content: content.slice(0, 10000),
          embedding: vecStr,
          metadata: metadata ?? {},
        },
      })

    return true
  } catch (err) {
    log.warn({ err, sourceTable, sourceId }, 'failed to store embedding')
    return false
  }
}

export async function hasEmbedding(sourceTable: string, sourceId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: embeddings.id })
    .from(embeddings)
    .where(and(eq(embeddings.sourceTable, sourceTable), eq(embeddings.sourceId, sourceId)))
    .limit(1)
  return !!row
}
