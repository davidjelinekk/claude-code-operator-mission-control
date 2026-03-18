import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/client.js'
import { webhooks } from '../db/schema.js'
import { eq, desc } from 'drizzle-orm'
import { createHmac } from 'node:crypto'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const VALID_EVENTS = [
  'task.created',
  'task.updated',
  'task.claimed',
  'task.cancelled',
  'task.deleted',
  'task.note',
  'task.mention',
  'board.chat',
]

const CreateWebhookSchema = z.object({
  url: z.string().url(),
  secret: z.string().optional(),
  events: z.array(z.enum(VALID_EVENTS as [string, ...string[]])).min(1),
  boardId: z.string().uuid().optional().nullable(),
  description: z.string().max(500).optional(),
  active: z.boolean().optional(),
})

const UpdateWebhookSchema = CreateWebhookSchema.partial()

const router = new Hono()

router.use('/:id/:rest{.*}?', async (c, next) => {
  const id = c.req.param('id')
  if (!id || id === 'test' || UUID_RE.test(id)) return next()
  return c.json({ error: 'Invalid webhook ID format' }, 400)
})

router.get('/', async (c) => {
  const boardId = c.req.query('boardId')
  let q = db.select().from(webhooks).orderBy(desc(webhooks.createdAt)).$dynamic()
  if (boardId) q = q.where(eq(webhooks.boardId, boardId))
  const result = await q
  return c.json(result)
})

router.post('/', zValidator('json', CreateWebhookSchema), async (c) => {
  const data = c.req.valid('json')
  const [webhook] = await db.insert(webhooks).values({
    url: data.url,
    secret: data.secret,
    events: data.events,
    boardId: data.boardId ?? null,
    description: data.description,
    active: data.active ?? true,
  }).returning()
  return c.json(webhook, 201)
})

router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [webhook] = await db.select().from(webhooks).where(eq(webhooks.id, id))
  if (!webhook) return c.json({ error: 'Not found' }, 404)
  return c.json(webhook)
})

router.patch('/:id', zValidator('json', UpdateWebhookSchema), async (c) => {
  const id = c.req.param('id')
  const data = c.req.valid('json')
  const updates: Record<string, unknown> = { ...data, updatedAt: new Date() }
  const [webhook] = await db.update(webhooks).set(updates).where(eq(webhooks.id, id)).returning()
  if (!webhook) return c.json({ error: 'Not found' }, 404)
  return c.json(webhook)
})

router.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await db.delete(webhooks).where(eq(webhooks.id, id))
  return c.json({ ok: true })
})

router.post('/:id/test', async (c) => {
  const id = c.req.param('id')
  const [webhook] = await db.select().from(webhooks).where(eq(webhooks.id, id))
  if (!webhook) return c.json({ error: 'Not found' }, 404)

  const body = JSON.stringify({
    event: 'webhook.test',
    timestamp: new Date().toISOString(),
    payload: { webhookId: webhook.id, message: 'Test ping from claude-code-operator' },
  })

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (webhook.secret) {
    headers['X-Webhook-Signature'] = createHmac('sha256', webhook.secret).update(body).digest('hex')
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const resp = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    })
    clearTimeout(timeout)
    return c.json({ ok: true, status: resp.status, statusText: resp.statusText })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ ok: false, error: message }, 502)
  }
})

export default router
