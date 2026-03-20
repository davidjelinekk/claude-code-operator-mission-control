import { db } from '../../db/client.js'
import { ctxEntities, ctxRelations, ctxObservations } from '../../db/schema.js'
import { eq, and, ilike, or, desc, sql, inArray } from 'drizzle-orm'

export interface EntityWithDetails {
  id: string
  name: string
  entityType: string
  description: string | null
  abstract: string | null
  properties: Record<string, unknown> | null
  boardId: string | null
  confidence: number | null
  sourceType: string
  createdAt: Date
  updatedAt: Date
}

export interface Neighbor {
  entity: EntityWithDetails
  relationType: string
  direction: 'outgoing' | 'incoming'
}

export async function getEntity(id: string): Promise<EntityWithDetails | null> {
  const [row] = await db.select().from(ctxEntities).where(eq(ctxEntities.id, id))
  return (row as EntityWithDetails) ?? null
}

export async function searchEntities(opts: {
  query?: string
  entityType?: string
  boardId?: string
  limit?: number
}): Promise<EntityWithDetails[]> {
  const conditions = []

  if (opts.entityType) {
    conditions.push(eq(ctxEntities.entityType, opts.entityType))
  }
  if (opts.boardId) {
    conditions.push(
      or(eq(ctxEntities.boardId, opts.boardId), sql`${ctxEntities.boardId} IS NULL`),
    )
  }
  if (opts.query) {
    const pattern = `%${opts.query}%`
    conditions.push(
      or(ilike(ctxEntities.name, pattern), ilike(ctxEntities.description, pattern)),
    )
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined

  return db
    .select()
    .from(ctxEntities)
    .where(where)
    .orderBy(desc(ctxEntities.updatedAt))
    .limit(opts.limit ?? 50) as unknown as Promise<EntityWithDetails[]>
}

export async function getEntityNeighbors(
  entityId: string,
  depth = 1,
): Promise<Neighbor[]> {
  if (depth < 1) return []

  const maxDepth = Math.min(depth, 3)

  const rows = await db.execute(sql`
    WITH RECURSIVE traversal AS (
      -- Non-recursive seed: outgoing from start entity
      SELECT
        r.to_entity_id AS neighbor_id,
        r.relation_type,
        'outgoing'::text AS direction,
        1 AS depth,
        ARRAY[${entityId}::uuid, r.to_entity_id] AS path
      FROM ctx_relations r
      WHERE r.from_entity_id = ${entityId}

      UNION ALL

      -- Non-recursive seed: incoming to start entity
      SELECT
        r.from_entity_id AS neighbor_id,
        r.relation_type,
        'incoming'::text AS direction,
        1 AS depth,
        ARRAY[${entityId}::uuid, r.from_entity_id] AS path
      FROM ctx_relations r
      WHERE r.to_entity_id = ${entityId}

      UNION ALL

      -- Recursive: expand frontier in both directions
      SELECT
        CASE WHEN r.from_entity_id = t.neighbor_id
             THEN r.to_entity_id
             ELSE r.from_entity_id
        END AS neighbor_id,
        r.relation_type,
        CASE WHEN r.from_entity_id = t.neighbor_id
             THEN 'outgoing'::text
             ELSE 'incoming'::text
        END AS direction,
        t.depth + 1,
        t.path || CASE WHEN r.from_entity_id = t.neighbor_id
                       THEN r.to_entity_id
                       ELSE r.from_entity_id
                  END
      FROM traversal t
      JOIN ctx_relations r
        ON r.from_entity_id = t.neighbor_id
        OR r.to_entity_id = t.neighbor_id
      WHERE t.depth < ${maxDepth}
        AND NOT (
          CASE WHEN r.from_entity_id = t.neighbor_id
               THEN r.to_entity_id
               ELSE r.from_entity_id
          END = ANY(t.path)
        )
    ),
    -- Deduplicate: keep the first (shallowest) occurrence of each neighbor
    deduped AS (
      SELECT DISTINCT ON (neighbor_id)
        neighbor_id, relation_type, direction
      FROM traversal
      WHERE neighbor_id != ${entityId}
      ORDER BY neighbor_id, depth
    )
    SELECT
      d.relation_type,
      d.direction,
      e.id,
      e.name,
      e.entity_type,
      e.description,
      e.abstract,
      e.properties,
      e.board_id,
      e.confidence,
      e.source_type,
      e.created_at,
      e.updated_at
    FROM deduped d
    JOIN ctx_entities e ON e.id = d.neighbor_id
  `)

  return (rows as any[]).map((r) => ({
    entity: {
      id: r.id,
      name: r.name,
      entityType: r.entity_type,
      description: r.description,
      abstract: r.abstract,
      properties: r.properties,
      boardId: r.board_id,
      confidence: r.confidence,
      sourceType: r.source_type,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    } as EntityWithDetails,
    relationType: r.relation_type,
    direction: r.direction as 'outgoing' | 'incoming',
  }))
}

export async function getEntitySubgraph(
  entityId: string,
  depth = 2,
): Promise<{
  entities: EntityWithDetails[]
  relations: Array<{ id: string; from: string; to: string; type: string }>
}> {
  const entity = await getEntity(entityId)
  if (!entity) return { entities: [], relations: [] }

  const entities = [entity]
  const entityIds = new Set([entityId])
  const allRelations: Array<{ id: string; from: string; to: string; type: string }> = []

  let frontier = [entityId]

  for (let d = 0; d < depth && frontier.length > 0; d++) {
    const nextFrontier: string[] = []

    // Batch: get all neighbors of entire frontier in 2 queries (not 2*N)
    const [outgoing, incoming] = await Promise.all([
      db
        .select({ relationType: ctxRelations.relationType, entity: ctxEntities })
        .from(ctxRelations)
        .innerJoin(ctxEntities, eq(ctxRelations.toEntityId, ctxEntities.id))
        .where(inArray(ctxRelations.fromEntityId, frontier)),
      db
        .select({ relationType: ctxRelations.relationType, entity: ctxEntities })
        .from(ctxRelations)
        .innerJoin(ctxEntities, eq(ctxRelations.fromEntityId, ctxEntities.id))
        .where(inArray(ctxRelations.toEntityId, frontier)),
    ])

    for (const r of [...outgoing, ...incoming]) {
      const e = r.entity as unknown as EntityWithDetails
      if (!entityIds.has(e.id)) {
        entityIds.add(e.id)
        entities.push(e)
        nextFrontier.push(e.id)
      }
    }

    frontier = nextFrontier
  }

  // Fetch all relations between collected entities
  if (entityIds.size > 1) {
    const idArray = [...entityIds]
    const rels = await db
      .select({
        id: ctxRelations.id,
        from_entity_id: ctxRelations.fromEntityId,
        to_entity_id: ctxRelations.toEntityId,
        relation_type: ctxRelations.relationType,
      })
      .from(ctxRelations)
      .where(and(inArray(ctxRelations.fromEntityId, idArray), inArray(ctxRelations.toEntityId, idArray)))
    for (const r of rels) {
      allRelations.push({
        id: r.id,
        from: r.from_entity_id,
        to: r.to_entity_id,
        type: r.relation_type,
      })
    }
  }

  return { entities, relations: allRelations }
}

export async function getRecentObservations(
  entityId: string,
  limit = 10,
): Promise<Array<{ id: string; content: string; abstract: string | null; observationType: string | null; source: string | null; createdAt: Date }>> {
  return db
    .select({
      id: ctxObservations.id,
      content: ctxObservations.content,
      abstract: ctxObservations.abstract,
      observationType: ctxObservations.observationType,
      source: ctxObservations.source,
      createdAt: ctxObservations.createdAt,
    })
    .from(ctxObservations)
    .where(eq(ctxObservations.entityId, entityId))
    .orderBy(desc(ctxObservations.createdAt))
    .limit(limit)
}

export async function getGraphStats(): Promise<Record<string, number>> {
  const entityCounts = await db.execute(sql`
    SELECT entity_type, count(*)::int as count FROM ctx_entities GROUP BY entity_type ORDER BY count DESC
  `)
  const relationCounts = await db.execute(sql`
    SELECT relation_type, count(*)::int as count FROM ctx_relations GROUP BY relation_type ORDER BY count DESC
  `)
  const [obsCount] = await db.execute(sql`SELECT count(*)::int as count FROM ctx_observations`)
  const [embCount] = await db.execute(sql`SELECT count(*)::int as count FROM embeddings`)

  const stats: Record<string, number> = {
    total_observations: (obsCount as any)?.count ?? 0,
    total_embeddings: (embCount as any)?.count ?? 0,
  }

  for (const r of entityCounts as any[]) {
    stats[`entity_${r.entity_type}`] = r.count
  }
  for (const r of relationCounts as any[]) {
    stats[`relation_${r.relation_type}`] = r.count
  }

  return stats
}
