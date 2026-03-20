import pino from 'pino'
import { db } from '../db/client.js'
import { activityEvents, ctxExtractionWatermarks } from '../db/schema.js'
import { eq, and, gt, asc } from 'drizzle-orm'
import { extractFromText } from '../services/context-graph/extractor.js'
import { processExtractionResult } from '../services/context-graph/graph-store.js'
import { workerRegistry } from '../lib/workerRegistry.js'
import { config } from '../config.js'

const log = pino({ name: 'extraction-worker' })

const EXTRACTABLE_TYPES = ['task.completed', 'task.note', 'approval.resolved', 'board.chat']
const BATCH_SIZE = 10

async function getWatermark(eventType: string): Promise<Date | null> {
  const [row] = await db
    .select()
    .from(ctxExtractionWatermarks)
    .where(eq(ctxExtractionWatermarks.eventType, eventType))
  return row?.lastEventAt ?? null
}

async function setWatermark(eventType: string, lastEventAt: Date): Promise<void> {
  await db
    .insert(ctxExtractionWatermarks)
    .values({ eventType, lastEventAt, lastProcessedAt: new Date() })
    .onConflictDoUpdate({
      target: [ctxExtractionWatermarks.eventType],
      set: { lastEventAt, lastProcessedAt: new Date() },
    })
}

async function runExtraction(): Promise<void> {
  if (!config.ANTHROPIC_API_KEY) {
    log.debug('no ANTHROPIC_API_KEY, skipping extraction')
    workerRegistry.record('extraction', true)
    return
  }

  let totalProcessed = 0

  for (const eventType of EXTRACTABLE_TYPES) {
    const watermark = await getWatermark(eventType)

    let query = db
      .select()
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.eventType, eventType),
          ...(watermark ? [gt(activityEvents.createdAt, watermark)] : []),
        ),
      )
      .orderBy(asc(activityEvents.createdAt))
      .limit(BATCH_SIZE)

    const events = await query

    if (events.length === 0) continue

    for (const event of events) {
      if (!event.message || event.message.length < 20) continue

      try {
        const result = await extractFromText(event.message)
        if (result && (result.entities.length > 0 || result.observations.length > 0)) {
          const counts = await processExtractionResult(result, {
            boardId: event.boardId ?? undefined,
            sourceEventId: event.id,
            source: 'extraction',
            sourceId: event.id,
          })
          totalProcessed++
          log.debug(
            { eventId: event.id, eventType, ...counts },
            'extracted from event',
          )
        }
      } catch (err) {
        log.warn({ err, eventId: event.id }, 'extraction failed for event')
      }
    }

    // Update watermark to last processed event's timestamp
    const lastEvent = events[events.length - 1]
    await setWatermark(eventType, lastEvent.createdAt)
  }

  if (totalProcessed > 0) {
    log.info({ totalProcessed }, 'extraction run complete')
  }
  workerRegistry.record('extraction', true)
}

export const extractionWorker = { run: runExtraction }
