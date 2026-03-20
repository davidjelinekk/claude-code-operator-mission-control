import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import {
  searchEntities,
  getEntity,
  getEntityNeighbors,
  getEntitySubgraph,
  getRecentObservations,
  getGraphStats,
} from '../services/context-graph/graph-query.js'
import { upsertEntity, addObservation } from '../services/context-graph/graph-store.js'
import { retrieveContextWithTrace } from '../services/context-graph/context-retriever.js'
import { buildContextPrompt } from '../services/context-graph/prompt-builder.js'
import { db } from '../db/client.js'
import { sql } from 'drizzle-orm'
import { embedText, isEmbeddingAvailable } from '../services/embedding/client.js'
import pino from 'pino'

const log = pino({ name: 'context-graph-routes' })
const router = new Hono()

// List/search entities
router.get('/entities', async (c) => {
  const type = c.req.query('type')
  const boardId = c.req.query('boardId')
  const q = c.req.query('q')
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50'), 200)

  const entities = await searchEntities({ query: q, entityType: type, boardId, limit })
  return c.json(entities)
})

// Entity detail with neighbors + observations
router.get('/entities/:id', async (c) => {
  const id = c.req.param('id')
  const entity = await getEntity(id)
  if (!entity) return c.json({ error: 'Not found' }, 404)

  const [neighbors, observations] = await Promise.all([
    getEntityNeighbors(id, 1),
    getRecentObservations(id, 20),
  ])

  return c.json({ entity, neighbors, observations })
})

// N-hop subgraph
router.get('/entities/:id/subgraph', async (c) => {
  const id = c.req.param('id')
  const depth = Math.min(parseInt(c.req.query('depth') ?? '2'), 3)

  const subgraph = await getEntitySubgraph(id, depth)
  return c.json(subgraph)
})

// Manual entity creation
router.post(
  '/entities',
  zValidator(
    'json',
    z.object({
      name: z.string().min(1),
      entityType: z.string().min(1),
      description: z.string().optional(),
      properties: z.record(z.unknown()).optional(),
      boardId: z.string().uuid().optional(),
    }),
  ),
  async (c) => {
    const body = c.req.valid('json')
    const id = await upsertEntity({ ...body, sourceType: 'manual' })
    return c.json({ id }, 201)
  },
)

// Manual observation
router.post(
  '/observations',
  zValidator(
    'json',
    z.object({
      entityId: z.string().uuid(),
      content: z.string().min(1),
      observationType: z.enum(['fact', 'preference', 'behavior', 'outcome', 'error']).optional(),
      source: z.string().optional(),
      sourceId: z.string().optional(),
    }),
  ),
  async (c) => {
    const body = c.req.valid('json')
    const id = await addObservation({ ...body, source: body.source ?? 'manual' })
    if (!id) return c.json({ id: null, skipped: true, reason: 'near-duplicate observation' }, 200)
    return c.json({ id, skipped: false }, 201)
  },
)

// Hybrid search (text + vector)
router.get('/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim()
  if (!q) return c.json({ results: [] })

  const boardId = c.req.query('boardId')
  const limit = Math.min(parseInt(c.req.query('limit') ?? '10'), 50)

  // Try vector search first
  try {
    const available = await isEmbeddingAvailable()
    if (available) {
      const vec = await embedText(q)
      if (vec) {
        const vecStr = `[${vec.join(',')}]`
        const results = await db.execute(sql`
          SELECT
            e.source_table,
            e.source_id,
            e.content,
            e.metadata,
            1 - (e.embedding <=> ${vecStr}::vector) as similarity
          FROM embeddings e
          WHERE e.embedding IS NOT NULL
            AND e.source_table IN ('ctx_entities', 'ctx_observations')
            ${boardId ? sql`AND e.metadata->>'boardId' = ${boardId}` : sql``}
          ORDER BY e.embedding <=> ${vecStr}::vector
          LIMIT ${limit}
        `)
        return c.json({ results, method: 'vector' })
      }
    }
  } catch (err) {
    log.warn({ err, query: q }, 'Vector search failed, falling back to text search')
  }

  // Fallback to text search on entities
  const entities = await searchEntities({ query: q, boardId, limit })
  return c.json({ results: entities, method: 'text' })
})

// Enhancement 4: Retrieval preview — shows what context WOULD be injected
router.get('/retrieval-preview', async (c) => {
  const prompt = (c.req.query('prompt') ?? '').trim()
  if (!prompt) return c.json({ error: 'prompt query param required' }, 400)
  if (prompt.length > 5000) return c.json({ error: 'prompt too long (max 5000 chars)' }, 400)

  const boardId = c.req.query('boardId')
  const agentId = c.req.query('agentId')
  const taskId = c.req.query('taskId')

  const { blocks, trace } = await retrieveContextWithTrace({
    prompt,
    boardId: boardId ?? undefined,
    agentId: agentId ?? undefined,
    taskId: taskId ?? undefined,
    rerank: c.req.query('rerank') !== 'false',
  })

  const contextPrompt = buildContextPrompt(blocks)

  return c.json({
    intent: trace.intent,
    blocks,
    trace,
    renderedPrompt: contextPrompt,
  })
})

// Graph stats
router.get('/stats', async (c) => {
  const stats = await getGraphStats()
  return c.json(stats)
})

export default router
