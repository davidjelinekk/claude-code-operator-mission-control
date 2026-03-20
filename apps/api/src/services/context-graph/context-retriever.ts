import { db } from '../../db/client.js'
import { boardMemory, ctxEntities, sessionArchives, activityEvents } from '../../db/schema.js'
import { eq, and, desc, sql } from 'drizzle-orm'
import { embedText, isEmbeddingAvailable } from '../embedding/client.js'
import { getEntityNeighbors, getRecentObservations } from './graph-query.js'
import { rerankBlocks } from './extractor.js'
import { config } from '../../config.js'
import pino from 'pino'

const log = pino({ name: 'ctx-retriever' })

// Enhancement 6: Intent classification types
export type Intent = 'planning' | 'execution' | 'debugging' | 'review' | 'question'

interface IntentWeights {
  vector: number
  graph: number
  boardMemory: number
  errorPatterns: number
  sessionArchive: number
}

const INTENT_WEIGHTS: Record<Intent, IntentWeights> = {
  planning:  { vector: 0.3, graph: 0.5, boardMemory: 0.8, errorPatterns: 0.2, sessionArchive: 0.5 },
  execution: { vector: 0.5, graph: 0.8, boardMemory: 0.3, errorPatterns: 0.5, sessionArchive: 0.3 },
  debugging: { vector: 0.3, graph: 0.5, boardMemory: 0.2, errorPatterns: 1.0, sessionArchive: 0.8 },
  review:    { vector: 0.5, graph: 0.3, boardMemory: 0.5, errorPatterns: 0.3, sessionArchive: 0.4 },
  question:  { vector: 0.8, graph: 0.3, boardMemory: 0.5, errorPatterns: 0.2, sessionArchive: 0.3 },
}

// Enhancement 6: Keyword-based intent classification
// Uses word-boundary regex to avoid false positives (e.g. "do" in "document")
export function classifyIntent(prompt: string): Intent {
  const lower = prompt.toLowerCase()

  const debugKeywords = ['fix', 'error', 'bug', 'fail', 'crash', 'broken', 'issue', 'debug', 'stack trace', 'exception', 'not working']
  const planKeywords = ['plan', 'design', 'approach', 'architecture', 'strategy', 'how should', 'proposal', 'roadmap']
  const reviewKeywords = ['review', 'check', 'audit', 'evaluate', 'assess', 'feedback', 'look at', 'inspect']
  const execKeywords = ['implement', 'build', 'create', 'deploy', 'run', 'execute', 'make', 'write', 'add']
  const questionKeywords = ['what', 'why', 'how', 'when', 'where', 'which', 'explain', 'describe', 'tell me', '?']

  const score = (keywords: string[]) =>
    keywords.filter((k) => {
      // Multi-word phrases and punctuation: use simple includes
      if (k.includes(' ') || k === '?') return lower.includes(k)
      // Single words: use word boundary regex to avoid substring false positives
      return new RegExp(`\\b${k}\\b`).test(lower)
    }).length

  const scores: Array<[Intent, number]> = [
    ['debugging', score(debugKeywords)],
    ['planning', score(planKeywords)],
    ['review', score(reviewKeywords)],
    ['execution', score(execKeywords)],
    ['question', score(questionKeywords)],
  ]

  scores.sort((a, b) => b[1] - a[1])
  return scores[0][1] > 0 ? scores[0][0] : 'execution'
}

export interface RetrievalParams {
  boardId?: string
  taskId?: string
  agentId?: string
  prompt: string
  maxChars?: number
  rerank?: boolean
}

export interface ContextBlock {
  source: string
  content: string
  relevance: number
}

// Enhancement 4: Retrieval trace for observability
export interface RetrievalTrace {
  intent: Intent
  weights: IntentWeights
  sources: Array<{
    source: string
    candidateCount: number
    selectedCount: number
    avgRelevance: number
  }>
  reranked: boolean
  totalCandidates: number
  selectedBlocks: number
  totalChars: number
  durationMs: number
}

export async function retrieveContext(
  params: RetrievalParams,
): Promise<ContextBlock[]> {
  const { blocks } = await retrieveContextWithTrace(params)
  return blocks
}

export async function retrieveContextWithTrace(
  params: RetrievalParams,
): Promise<{ blocks: ContextBlock[]; trace: RetrievalTrace }> {
  const startTime = Date.now()
  const maxChars = params.maxChars ?? 3000
  const shouldRerank = params.rerank !== false && !!config.ANTHROPIC_API_KEY

  // Enhancement 6: Classify intent
  const intent = classifyIntent(params.prompt)
  const weights = INTENT_WEIGHTS[intent]

  const sourceTasks: Array<{ name: string; task: Promise<ContextBlock[]> }> = []

  // 1. Vector similarity search
  sourceTasks.push({ name: 'vector', task: vectorSearch(params) })

  // 2. Graph neighborhood
  sourceTasks.push({ name: 'graph', task: graphNeighborhood(params) })

  // 3. Recent board context
  if (params.boardId) {
    sourceTasks.push({ name: 'board-memory', task: boardContext(params.boardId) })
  }

  // Enhancement 2: Session archives
  if (params.boardId || params.agentId) {
    sourceTasks.push({ name: 'session-archive', task: sessionArchiveContext(params) })
  }

  const results = await Promise.allSettled(sourceTasks.map((s) => s.task))

  const allBlocks: ContextBlock[] = []
  const sourceStats: RetrievalTrace['sources'] = []

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    const sourceName = sourceTasks[i].name

    if (result.status === 'fulfilled' && result.value) {
      const blocks = result.value

      // Apply intent weights to relevance scores
      const weightKey = sourceName === 'vector' ? 'vector'
        : sourceName === 'graph' ? 'graph'
        : sourceName === 'board-memory' ? 'boardMemory'
        : sourceName === 'session-archive' ? 'sessionArchive'
        : 'vector'

      const weight = weights[weightKey as keyof IntentWeights] ?? 0.5

      // Boost error-pattern observations for debugging intent
      const weighted = blocks.map((b) => {
        let w = weight
        if (intent === 'debugging' && (b.source.includes('error') || b.content.toLowerCase().includes('error'))) {
          w = weights.errorPatterns
        }
        return { ...b, relevance: b.relevance * w }
      })

      const avgRel = weighted.length > 0
        ? weighted.reduce((s, b) => s + b.relevance, 0) / weighted.length
        : 0

      sourceStats.push({
        source: sourceName,
        candidateCount: blocks.length,
        selectedCount: weighted.length,
        avgRelevance: Math.round(avgRel * 1000) / 1000,
      })

      allBlocks.push(...weighted)
    } else {
      sourceStats.push({ source: sourceName, candidateCount: 0, selectedCount: 0, avgRelevance: 0 })
    }
  }

  // Deduplicate by content similarity (simple hash)
  const seen = new Set<string>()
  const deduped = allBlocks.filter((b) => {
    const key = b.content.slice(0, 100)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Sort by relevance
  deduped.sort((a, b) => b.relevance - a.relevance)

  // Take top candidates
  let candidates = deduped.slice(0, 10)

  // Enhancement 5: Rerank top candidates
  let reranked = false
  if (shouldRerank && candidates.length > 2) {
    try {
      const rankings = await rerankBlocks(params.prompt, candidates)
      if (rankings.length > 0) {
        const reorderedBlocks = rankings
          .filter((r) => r.index >= 0 && r.index < candidates.length)
          .sort((a, b) => b.score - a.score)
          .map((r) => ({ ...candidates[r.index], relevance: Math.max(0, Math.min(r.score / 10, 1.0)) }))

        if (reorderedBlocks.length > 0) {
          candidates = reorderedBlocks
          reranked = true
        }
      }
    } catch (err) {
      log.debug({ err }, 'reranking failed, using original order')
    }
  }

  // Truncate to maxChars
  let charCount = 0
  const truncated: ContextBlock[] = []
  for (const block of candidates) {
    if (charCount + block.content.length > maxChars) {
      if (truncated.length === 0) {
        truncated.push({ ...block, content: block.content.slice(0, maxChars) })
        charCount = maxChars
      }
      break
    }
    truncated.push(block)
    charCount += block.content.length
  }

  const durationMs = Date.now() - startTime

  const trace: RetrievalTrace = {
    intent,
    weights,
    sources: sourceStats,
    reranked,
    totalCandidates: allBlocks.length,
    selectedBlocks: truncated.length,
    totalChars: charCount,
    durationMs,
  }

  // Enhancement 4: Log retrieval to activity events (non-blocking)
  if (params.boardId) {
    logRetrievalEvent(params, trace).catch(() => {})
  }

  return { blocks: truncated, trace }
}

async function vectorSearch(params: RetrievalParams): Promise<ContextBlock[]> {
  const available = await isEmbeddingAvailable()
  if (!available) return []

  const vec = await embedText(params.prompt.slice(0, 2000))
  if (!vec) return []

  const vecStr = `[${vec.join(',')}]`

  // Enhancement 1: Use abstracts (L1) instead of full content for context injection
  const results = await db.execute(sql`
    SELECT
      e.content,
      e.source_table,
      e.source_id,
      e.metadata,
      1 - (e.embedding <=> ${vecStr}::vector) as similarity
    FROM embeddings e
    WHERE e.embedding IS NOT NULL
      ${params.boardId ? sql`AND (e.metadata->>'boardId' = ${params.boardId} OR e.metadata->>'boardId' IS NULL)` : sql``}
    ORDER BY e.embedding <=> ${vecStr}::vector
    LIMIT 5
  `)

  const blocks: ContextBlock[] = []
  for (const r of results as any[]) {
    if (parseFloat(r.similarity) <= 0.3) continue

    // Try to get abstract (L1) for ctx_entities and ctx_observations
    let displayContent = r.content
    if (r.source_table === 'ctx_entities') {
      const [row] = await db.select({ abstract: ctxEntities.abstract }).from(ctxEntities).where(eq(ctxEntities.id, r.source_id)).limit(1)
      if (row?.abstract) displayContent = row.abstract
    } else if (r.source_table === 'ctx_observations') {
      const [row] = await db.execute(sql`SELECT abstract FROM ctx_observations WHERE id = ${r.source_id}::uuid LIMIT 1`)
      if ((row as any)?.abstract) displayContent = (row as any).abstract
    }

    blocks.push({
      source: `vector/${r.source_table}`,
      content: displayContent,
      relevance: parseFloat(r.similarity),
    })
  }

  return blocks
}

async function graphNeighborhood(params: RetrievalParams): Promise<ContextBlock[]> {
  const blocks: ContextBlock[] = []

  const entityFilters = []
  if (params.agentId) {
    entityFilters.push(
      db
        .select()
        .from(ctxEntities)
        .where(and(eq(ctxEntities.name, params.agentId.toLowerCase()), eq(ctxEntities.entityType, 'agent')))
        .limit(1),
    )
  }
  if (params.taskId) {
    entityFilters.push(
      db
        .select()
        .from(ctxEntities)
        .where(
          and(
            sql`${ctxEntities.properties}->>'taskId' = ${params.taskId}`,
            eq(ctxEntities.entityType, 'task'),
          ),
        )
        .limit(1),
    )
  }

  for (const query of entityFilters) {
    const [entity] = await query
    if (!entity) continue

    const neighbors = await getEntityNeighbors(entity.id, 1)
    const observations = await getRecentObservations(entity.id, 5)

    // Enhancement 1: Use abstract (L1) if available, otherwise fall back to description
    const entityDisplay = entity.abstract ?? entity.description
    if (entityDisplay) {
      blocks.push({
        source: `graph/${entity.entityType}`,
        content: `[${entity.entityType}/${entity.name}] ${entityDisplay}`,
        relevance: 0.8,
      })
    }

    // Use observation abstracts (L1)
    for (const obs of observations) {
      const obsDisplay = obs.abstract ?? obs.content
      blocks.push({
        source: `observation/${obs.observationType ?? 'fact'}`,
        content: `[${entity.name}] ${obsDisplay}`,
        relevance: 0.7,
      })
    }

    for (const n of neighbors.slice(0, 5)) {
      const neighborDisplay = n.entity.abstract ?? n.entity.description ?? n.relationType
      blocks.push({
        source: `graph/${n.relationType}`,
        content: `[${n.entity.entityType}/${n.entity.name}] ${neighborDisplay}`,
        relevance: 0.6,
      })
    }
  }

  return blocks
}

async function boardContext(boardId: string): Promise<ContextBlock[]> {
  const memories = await db
    .select()
    .from(boardMemory)
    .where(and(eq(boardMemory.boardId, boardId), eq(boardMemory.isChat, false)))
    .orderBy(desc(boardMemory.createdAt))
    .limit(5)

  return memories.map((m, i) => ({
    source: 'board-memory',
    content: m.content,
    relevance: 0.5 - i * 0.05,
  }))
}

// Enhancement 2: Query session archives as a 4th retrieval source
async function sessionArchiveContext(params: RetrievalParams): Promise<ContextBlock[]> {
  const conditions = []
  if (params.boardId) {
    conditions.push(eq(sessionArchives.boardId, params.boardId))
  }
  if (params.agentId) {
    conditions.push(eq(sessionArchives.agentId, params.agentId))
  }

  if (conditions.length === 0) return []

  const archives = await db
    .select()
    .from(sessionArchives)
    .where(conditions.length === 1 ? conditions[0] : and(...conditions))
    .orderBy(desc(sessionArchives.createdAt))
    .limit(3)

  const blocks: ContextBlock[] = []

  for (const archive of archives) {
    // Summary block
    blocks.push({
      source: 'session-archive/summary',
      content: `[session:${archive.sessionId.slice(0, 8)}] ${archive.summary}`,
      relevance: 0.6,
    })

    // Error patterns (high value for debugging)
    const errors = archive.errorPatterns as string[] | null
    if (errors && errors.length > 0) {
      blocks.push({
        source: 'session-archive/error',
        content: `[session:${archive.sessionId.slice(0, 8)}] Errors: ${errors.join('; ')}`,
        relevance: 0.5,
      })
    }

    // Key decisions
    const decisions = archive.keyDecisions as string[] | null
    if (decisions && decisions.length > 0) {
      blocks.push({
        source: 'session-archive/decision',
        content: `[session:${archive.sessionId.slice(0, 8)}] Decisions: ${decisions.join('; ')}`,
        relevance: 0.45,
      })
    }
  }

  return blocks
}

// Enhancement 4: Log retrieval event for observability
async function logRetrievalEvent(params: RetrievalParams, trace: RetrievalTrace): Promise<void> {
  try {
    await db.insert(activityEvents).values({
      boardId: params.boardId ?? null,
      agentId: params.agentId ?? null,
      eventType: 'context.retrieval',
      message: `Context retrieval: ${trace.selectedBlocks} blocks, ${trace.totalChars} chars, intent=${trace.intent}, ${trace.durationMs}ms`,
      metadata: {
        intent: trace.intent,
        reranked: trace.reranked,
        totalCandidates: trace.totalCandidates,
        selectedBlocks: trace.selectedBlocks,
        totalChars: trace.totalChars,
        durationMs: trace.durationMs,
        sources: trace.sources,
      },
    })
  } catch (err) {
    log.debug({ err }, 'failed to log retrieval event')
  }
}
