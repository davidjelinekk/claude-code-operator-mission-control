import type { SSEEvent } from './types.js'

export async function* parseSSEStream(response: Response): AsyncGenerator<SSEEvent> {
  const reader = response.body?.getReader()
  if (!reader) return

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      let currentEvent = ''
      let currentData = ''

      for (const line of lines) {
        if (line.startsWith(':')) continue // SSE comment / ping keepalive
        if (line === '') {
          if (currentData) {
            yield { event: currentEvent || 'message', data: currentData }
            currentEvent = ''
            currentData = ''
          }
          continue
        }
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7)
        } else if (line.startsWith('data: ')) {
          currentData += (currentData ? '\n' : '') + line.slice(6)
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
