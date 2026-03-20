import pino from 'pino'
import { config } from '../../config.js'

const log = pino({ name: 'embedding-client' })

let ollamaAvailable: boolean | null = null

async function checkOllama(): Promise<boolean> {
  try {
    const res = await fetch(`${config.EMBEDDING_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    })
    ollamaAvailable = res.ok
    return ollamaAvailable
  } catch {
    ollamaAvailable = false
    return false
  }
}

export async function isEmbeddingAvailable(): Promise<boolean> {
  if (ollamaAvailable !== null) return ollamaAvailable
  return checkOllama()
}

export function resetAvailabilityCache(): void {
  ollamaAvailable = null
}

export async function embedText(text: string): Promise<number[] | null> {
  if (!(await isEmbeddingAvailable())) return null

  try {
    const res = await fetch(`${config.EMBEDDING_BASE_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.EMBEDDING_MODEL,
        prompt: text,
      }),
      signal: AbortSignal.timeout(30000),
    })

    if (!res.ok) {
      log.warn({ status: res.status }, 'Ollama embedding request failed')
      return null
    }

    const data = (await res.json()) as { embedding?: number[] }
    return data.embedding ?? null
  } catch (err) {
    log.warn({ err }, 'embedding request error')
    ollamaAvailable = null
    return null
  }
}

export async function embedBatch(texts: string[], concurrency = 5): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = new Array(texts.length).fill(null)
  const queue = texts.map((t, i) => ({ text: t, index: i }))

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()
      if (!item) break
      results[item.index] = await embedText(item.text)
    }
  })

  await Promise.all(workers)
  return results
}
