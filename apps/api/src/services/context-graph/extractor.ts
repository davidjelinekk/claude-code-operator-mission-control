import pino from 'pino'
import { config } from '../../config.js'
import type { ContextBlock } from './context-retriever.js'

const log = pino({ name: 'ctx-extractor' })

// Strip markdown code fences that LLMs sometimes wrap around JSON
function stripMarkdown(text: string): string {
  return text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim()
}

export interface ExtractedEntity {
  name: string
  type: string
  description?: string
  abstract?: string
}

export interface ExtractedRelation {
  from: string
  to: string
  type: string
  context?: string
}

export interface ExtractedObservation {
  entity: string
  content: string
  abstract?: string
  type: 'fact' | 'preference' | 'behavior' | 'outcome' | 'error'
}

export interface ExtractionResult {
  entities: ExtractedEntity[]
  relations: ExtractedRelation[]
  observations: ExtractedObservation[]
}

// Enhancement 2: Session compression types
export interface SessionSummary {
  summary: string
  keyDecisions: string[]
  keyOutcomes: string[]
  errorPatterns: string[]
}

// Enhancement 1: Updated extraction prompt with abstracts
const SYSTEM_PROMPT = `Extract entities and relationships from this operational context.

Entity types: agent, board, task, project, person, skill, concept, decision, error_pattern, workflow
Relation types: assigned_to, depends_on, resolved_by, uses_skill, part_of, related_to, succeeded_at, failed_at, led_to, mentions

Return ONLY valid JSON with no markdown formatting:
{
  "entities": [{ "name": "...", "type": "...", "description": "...", "abstract": "one-line summary, max 100 chars" }],
  "relations": [{ "from": "name", "to": "name", "type": "...", "context": "..." }],
  "observations": [{ "entity": "name", "content": "...", "abstract": "one-line summary, max 100 chars", "type": "fact|preference|behavior|outcome|error" }]
}

Rules:
- Entity names should be lowercase, concise identifiers (e.g., "jwt", "auth-middleware", "planner")
- Only extract clearly mentioned entities and relationships
- Keep observations factual and specific
- The "abstract" field is a short one-line summary (max 100 chars) used for quick scanning
- If nothing meaningful can be extracted, return empty arrays`

export async function extractFromText(text: string): Promise<ExtractionResult | null> {
  if (!config.ANTHROPIC_API_KEY) {
    log.debug('no ANTHROPIC_API_KEY, skipping extraction')
    return null
  }

  const truncated = text.slice(0, 4000)

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: truncated }],
      }),
      signal: AbortSignal.timeout(30000),
    })

    if (!res.ok) {
      log.warn({ status: res.status }, 'extraction API call failed')
      return null
    }

    const data = (await res.json()) as {
      content: Array<{ type: string; text?: string }>
    }

    const textBlock = data.content.find((b) => b.type === 'text')
    if (!textBlock?.text) return null

    const parsed = JSON.parse(stripMarkdown(textBlock.text)) as ExtractionResult
    return {
      entities: Array.isArray(parsed.entities) ? parsed.entities : [],
      relations: Array.isArray(parsed.relations) ? parsed.relations : [],
      observations: Array.isArray(parsed.observations) ? parsed.observations : [],
    }
  } catch (err) {
    log.warn({ err }, 'extraction failed')
    return null
  }
}

// Enhancement 2: Compress a completed session into a structured summary
export async function compressSession(textContent: string): Promise<SessionSummary | null> {
  if (!config.ANTHROPIC_API_KEY) return null

  const truncated = textContent.slice(0, 6000)

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: `Compress this agent session into a structured summary. Return ONLY valid JSON:
{
  "summary": "One-line overview of what the session accomplished",
  "keyDecisions": ["decision 1", "decision 2"],
  "keyOutcomes": ["outcome 1", "outcome 2"],
  "errorPatterns": ["error pattern 1"]
}

Rules:
- summary: single sentence, max 200 chars
- keyDecisions: important choices made (max 5)
- keyOutcomes: what was accomplished or changed (max 5)
- errorPatterns: errors encountered and how they were resolved (max 3)
- If a category has nothing, use an empty array`,
        messages: [{ role: 'user', content: truncated }],
      }),
      signal: AbortSignal.timeout(30000),
    })

    if (!res.ok) return null

    const data = (await res.json()) as {
      content: Array<{ type: string; text?: string }>
    }

    const textBlock = data.content.find((b) => b.type === 'text')
    if (!textBlock?.text) return null

    const parsed = JSON.parse(stripMarkdown(textBlock.text)) as SessionSummary
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      keyDecisions: Array.isArray(parsed.keyDecisions) ? parsed.keyDecisions : [],
      keyOutcomes: Array.isArray(parsed.keyOutcomes) ? parsed.keyOutcomes : [],
      errorPatterns: Array.isArray(parsed.errorPatterns) ? parsed.errorPatterns : [],
    }
  } catch (err) {
    log.warn({ err }, 'session compression failed')
    return null
  }
}

// Enhancement 5: Rerank context blocks using Haiku
export async function rerankBlocks(
  prompt: string,
  blocks: ContextBlock[],
): Promise<Array<{ index: number; score: number }>> {
  if (!config.ANTHROPIC_API_KEY || blocks.length === 0) {
    return blocks.map((_, i) => ({ index: i, score: 1 - i * 0.1 }))
  }

  const candidateList = blocks
    .map((b, i) => `[${i}] ${b.content.slice(0, 200)}`)
    .join('\n')

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        system: `You are a relevance ranker. Given a query and candidate context blocks, rate each block's relevance to the query on a scale of 0-10. Return ONLY a JSON array of {index, score} objects, sorted by score descending. No markdown.`,
        messages: [{
          role: 'user',
          content: `Query: ${prompt.slice(0, 500)}\n\nCandidates:\n${candidateList}`,
        }],
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) return blocks.map((_, i) => ({ index: i, score: 1 - i * 0.1 }))

    const data = (await res.json()) as {
      content: Array<{ type: string; text?: string }>
    }

    const textBlock = data.content.find((b) => b.type === 'text')
    if (!textBlock?.text) return blocks.map((_, i) => ({ index: i, score: 1 - i * 0.1 }))

    const rankings = JSON.parse(stripMarkdown(textBlock.text)) as Array<{ index: number; score: number }>
    if (!Array.isArray(rankings)) return blocks.map((_, i) => ({ index: i, score: 1 - i * 0.1 }))

    return rankings
  } catch (err) {
    log.debug({ err }, 'reranking failed, using original order')
    return blocks.map((_, i) => ({ index: i, score: 1 - i * 0.1 }))
  }
}
