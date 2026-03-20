import { db } from '../../db/client.js'
import { ctxEntities, ctxRelations, ctxObservations } from '../../db/schema.js'
import { eq, and, sql } from 'drizzle-orm'
import { embedAndStore } from '../embedding/embed.js'
import { embedText, isEmbeddingAvailable } from '../embedding/client.js'
import pino from 'pino'

const log = pino({ name: 'graph-store' })

export async function upsertEntity(entity: {
  name: string
  entityType: string
  description?: string
  abstract?: string
  properties?: Record<string, unknown>
  boardId?: string
  confidence?: number
  sourceType?: string
}): Promise<string> {
  // INSERT-first to avoid TOCTOU race. If conflict, fall back to update.
  try {
    const [row] = await db
      .insert(ctxEntities)
      .values({
        name: entity.name.toLowerCase(),
        entityType: entity.entityType,
        description: entity.description,
        abstract: entity.abstract ?? entity.description?.slice(0, 100),
        properties: entity.properties,
        boardId: entity.boardId ?? null,
        confidence: entity.confidence ?? 1.0,
        sourceType: entity.sourceType ?? 'extraction',
      })
      .returning({ id: ctxEntities.id })

    // Embed new entity
    const textToEmbed = `${entity.name}: ${entity.description ?? entity.entityType}`
    embedAndStore('ctx_entities', row.id, textToEmbed, {
      entityType: entity.entityType,
      boardId: entity.boardId,
    }).catch(() => {})

    return row.id
  } catch (err: any) {
    // Unique constraint violation → entity already exists, update it
    if (err?.code === '23505') {
      const [existing] = await db
        .select({ id: ctxEntities.id })
        .from(ctxEntities)
        .where(
          and(
            eq(ctxEntities.name, entity.name.toLowerCase()),
            eq(ctxEntities.entityType, entity.entityType),
            entity.boardId
              ? eq(ctxEntities.boardId, entity.boardId)
              : sql`${ctxEntities.boardId} IS NULL`,
          ),
        )
        .limit(1)

      if (existing) {
        await db.update(ctxEntities).set({
          description: entity.description ?? undefined,
          abstract: entity.abstract ?? entity.description?.slice(0, 100) ?? undefined,
          properties: entity.properties ?? undefined,
          confidence: entity.confidence ?? undefined,
          updatedAt: new Date(),
        }).where(eq(ctxEntities.id, existing.id))

        if (entity.description) {
          embedAndStore('ctx_entities', existing.id, `${entity.name}: ${entity.description}`, {
            entityType: entity.entityType, boardId: entity.boardId,
          }).catch(() => {})
        }
        return existing.id
      }
    }
    throw err
  }
}

export async function upsertRelation(relation: {
  fromEntityId: string
  toEntityId: string
  relationType: string
  properties?: Record<string, unknown>
  sourceEventId?: string
}): Promise<string> {
  const [row] = await db
    .insert(ctxRelations)
    .values({
      fromEntityId: relation.fromEntityId,
      toEntityId: relation.toEntityId,
      relationType: relation.relationType,
      properties: relation.properties,
      sourceEventId: relation.sourceEventId ?? null,
    })
    .onConflictDoUpdate({
      target: [ctxRelations.fromEntityId, ctxRelations.toEntityId, ctxRelations.relationType],
      set: {
        properties: relation.properties ?? undefined,
        sourceEventId: relation.sourceEventId ?? undefined,
      },
    })
    .returning({ id: ctxRelations.id })

  return row.id
}

// Enhancement 3: Observation dedup via vector similarity
export async function addObservation(observation: {
  entityId: string
  content: string
  abstract?: string
  observationType?: string
  source?: string
  sourceId?: string
}): Promise<string | null> {
  // Check for near-duplicate observations on the same entity via vector similarity
  // Save vec from dedup check to reuse in embedAndStore (avoids double embedding)
  let dedupVec: number[] | null = null
  const available = await isEmbeddingAvailable()
  if (available) {
    dedupVec = await embedText(observation.content.slice(0, 2000))
    if (dedupVec) {
      const vecStr = `[${dedupVec.join(',')}]`
      const similar = await db.execute(sql`
        SELECT
          e.source_id,
          e.content,
          1 - (e.embedding <=> ${vecStr}::vector) as similarity
        FROM embeddings e
        WHERE e.source_table = 'ctx_observations'
          AND e.embedding IS NOT NULL
          AND e.metadata->>'entityId' = ${observation.entityId}
        ORDER BY e.embedding <=> ${vecStr}::vector
        LIMIT 1
      `)

      const topMatch = (similar as any[])[0]
      if (topMatch) {
        const sim = parseFloat(topMatch.similarity)
        // > 0.85: skip (near-duplicate)
        if (sim > 0.85) {
          log.debug(
            { entityId: observation.entityId, similarity: sim },
            'skipping near-duplicate observation',
          )
          return null
        }
        // 0.7-0.85: keep the more detailed one (replace if new is longer)
        if (sim > 0.7 && observation.content.length > topMatch.content.length) {
          const sourceId = topMatch.source_id
          await db.update(ctxObservations).set({
            content: observation.content,
            abstract: observation.abstract ?? observation.content.slice(0, 100),
            observationType: observation.observationType ?? undefined,
            source: observation.source ?? undefined,
            sourceId: observation.sourceId ?? undefined,
          }).where(eq(ctxObservations.id, sourceId))
          embedAndStore('ctx_observations', sourceId, observation.content, {
            entityId: observation.entityId,
            source: observation.source,
          }, dedupVec).catch(() => {})
          log.debug({ entityId: observation.entityId, similarity: sim }, 'merged observation (replaced shorter)')
          return sourceId
        }
        // 0.7-0.85 but existing is more detailed: skip
        if (sim > 0.7) {
          log.debug({ entityId: observation.entityId, similarity: sim }, 'skipping less-detailed duplicate')
          return null
        }
      }
    }
  }

  const [row] = await db
    .insert(ctxObservations)
    .values({
      entityId: observation.entityId,
      content: observation.content,
      abstract: observation.abstract ?? observation.content.slice(0, 100),
      observationType: observation.observationType ?? 'fact',
      source: observation.source ?? 'session',
      sourceId: observation.sourceId,
    })
    .returning({ id: ctxObservations.id })

  // Embed observation — reuse dedup vector if available
  embedAndStore('ctx_observations', row.id, observation.content, {
    entityId: observation.entityId,
    source: observation.source,
  }, dedupVec ?? undefined).catch(() => {})

  return row.id
}

export async function processExtractionResult(
  result: {
    entities: Array<{ name: string; type: string; description?: string; abstract?: string }>
    relations: Array<{ from: string; to: string; type: string; context?: string }>
    observations: Array<{ entity: string; content: string; abstract?: string; type: string }>
  },
  opts?: { boardId?: string; sourceEventId?: string; source?: string; sourceId?: string },
): Promise<{ entities: number; relations: number; observations: number }> {
  const entityIds = new Map<string, string>()
  let entityCount = 0
  let relationCount = 0
  let observationCount = 0

  // Create entities
  for (const e of result.entities) {
    try {
      const id = await upsertEntity({
        name: e.name,
        entityType: e.type,
        description: e.description,
        abstract: e.abstract,
        boardId: opts?.boardId,
        sourceType: 'extraction',
      })
      entityIds.set(e.name.toLowerCase(), id)
      entityCount++
    } catch (err) {
      log.debug({ err, entity: e.name }, 'failed to upsert entity')
    }
  }

  // Create relations
  for (const r of result.relations) {
    const fromId = entityIds.get(r.from.toLowerCase())
    const toId = entityIds.get(r.to.toLowerCase())
    if (fromId && toId) {
      try {
        await upsertRelation({
          fromEntityId: fromId,
          toEntityId: toId,
          relationType: r.type,
          properties: r.context ? { context: r.context } : undefined,
          sourceEventId: opts?.sourceEventId,
        })
        relationCount++
      } catch (err) {
        log.debug({ err, from: r.from, to: r.to }, 'failed to upsert relation')
      }
    }
  }

  // Create observations (with dedup)
  for (const o of result.observations) {
    const entityId = entityIds.get(o.entity.toLowerCase())
    if (entityId) {
      try {
        const obsId = await addObservation({
          entityId,
          content: o.content,
          abstract: o.abstract,
          observationType: o.type as any,
          source: opts?.source ?? 'extraction',
          sourceId: opts?.sourceId,
        })
        if (obsId) observationCount++
      } catch (err) {
        log.debug({ err, entity: o.entity }, 'failed to add observation')
      }
    }
  }

  return { entities: entityCount, relations: relationCount, observations: observationCount }
}
