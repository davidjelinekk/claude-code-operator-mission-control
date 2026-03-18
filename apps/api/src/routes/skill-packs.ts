import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/client.js'
import { skillPacks, skillSnapshots } from '../db/schema.js'
import { eq, desc } from 'drizzle-orm'
import { slugify } from '../lib/slugify.js'

const router = new Hono()

const CreatePackSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  version: z.string().optional(),
  skills: z.array(z.string()).optional(),
  mcpServers: z.record(z.unknown()).optional(),
})

const UpdatePackSchema = CreatePackSchema.partial()

router.get('/', async (c) => {
  const result = await db.select().from(skillPacks).orderBy(desc(skillPacks.createdAt))
  return c.json(result)
})

router.post('/', zValidator('json', CreatePackSchema), async (c) => {
  const data = c.req.valid('json')
  const slug = slugify(data.name)
  const [pack] = await db.insert(skillPacks).values({ ...data, slug }).returning()
  return c.json(pack, 201)
})

router.get('/:id', async (c) => {
  const id = c.req.param('id')
  const [pack] = await db.select().from(skillPacks).where(eq(skillPacks.id, id))
  if (!pack) return c.json({ error: 'Not found' }, 404)
  return c.json(pack)
})

router.patch('/:id', zValidator('json', UpdatePackSchema), async (c) => {
  const id = c.req.param('id')
  const data = c.req.valid('json')
  const updates: Record<string, unknown> = { ...data, updatedAt: new Date() }
  if (data.name) updates['slug'] = slugify(data.name)
  const [pack] = await db.update(skillPacks).set(updates).where(eq(skillPacks.id, id)).returning()
  if (!pack) return c.json({ error: 'Not found' }, 404)
  return c.json(pack)
})

router.delete('/:id', async (c) => {
  const id = c.req.param('id')
  await db.delete(skillPacks).where(eq(skillPacks.id, id))
  return c.json({ ok: true })
})

router.post('/:id/install', async (c) => {
  const id = c.req.param('id')
  const [pack] = await db.select().from(skillPacks).where(eq(skillPacks.id, id))
  if (!pack) return c.json({ error: 'Not found' }, 404)

  await db.update(skillPacks).set({ installStatus: 'installing', updatedAt: new Date() }).where(eq(skillPacks.id, id))

  try {
    const skills = (pack.skills ?? []) as string[]
    const mcpServers = (pack.mcpServers ?? {}) as Record<string, unknown>

    let count = 0

    for (const skillId of skills) {
      await db
        .insert(skillSnapshots)
        .values({
          skillId,
          displayName: skillId,
          skillType: 'skill',
          isInstalled: true,
        })
        .onConflictDoNothing()
      count++
    }

    for (const [serverId, serverConfig] of Object.entries(mcpServers)) {
      await db
        .insert(skillSnapshots)
        .values({
          skillId: serverId,
          displayName: serverId,
          skillType: 'mcp_server',
          isInstalled: true,
          configJson: serverConfig,
        })
        .onConflictDoNothing()
      count++
    }

    await db
      .update(skillPacks)
      .set({ installStatus: 'installed', installError: null, updatedAt: new Date() })
      .where(eq(skillPacks.id, id))

    return c.json({ ok: true, installed: count })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db
      .update(skillPacks)
      .set({ installStatus: 'error', installError: message, updatedAt: new Date() })
      .where(eq(skillPacks.id, id))
    return c.json({ error: message }, 500)
  }
})

export default router
