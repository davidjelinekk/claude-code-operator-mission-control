import { createHmac } from 'node:crypto'
import { db } from '../db/client.js'
import { webhooks } from '../db/schema.js'
import { eq, and, sql } from 'drizzle-orm'

interface WebhookEvent {
  type: string
  boardId?: string
  payload: unknown
}

export function dispatchWebhookEvent(event: WebhookEvent): void {
  // Fire-and-forget — do not await
  _dispatch(event).catch((err) => {
    console.error('[webhooks] dispatch error:', err)
  })
}

async function _dispatch(event: WebhookEvent): Promise<void> {
  const rows = await db
    .select()
    .from(webhooks)
    .where(
      and(
        eq(webhooks.active, true),
        sql`${webhooks.events} @> ${JSON.stringify([event.type])}::jsonb`,
        event.boardId
          ? sql`(${webhooks.boardId} IS NULL OR ${webhooks.boardId} = ${event.boardId})`
          : sql`${webhooks.boardId} IS NULL`,
      ),
    )

  if (rows.length === 0) return

  const body = JSON.stringify({
    event: event.type,
    timestamp: new Date().toISOString(),
    payload: event.payload,
  })

  const deliveries = rows.map(async (hook) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (hook.secret) {
      headers['X-Webhook-Signature'] = createHmac('sha256', hook.secret).update(body).digest('hex')
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    try {
      await fetch(hook.url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }
  })

  const results = await Promise.allSettled(deliveries)
  for (const r of results) {
    if (r.status === 'rejected') {
      console.error('[webhooks] delivery failed:', r.reason)
    }
  }
}
