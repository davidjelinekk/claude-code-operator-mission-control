import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { config } from '../config.js'
import { getScript } from '../services/claude-code/script-discovery.js'

export const scriptFilesRouter = new Hono()

const VALID_ID = /^[a-z0-9][a-z0-9._-]*$/

// GET /:id/content — read SCRIPT.md
scriptFilesRouter.get('/:id/content', async (c) => {
  const id = c.req.param('id')
  if (!VALID_ID.test(id)) return c.json({ error: 'Invalid ID' }, 400)
  const filePath = join(config.CLAUDE_HOME, 'scripts', id, 'SCRIPT.md')
  if (!existsSync(filePath)) return c.json({ error: 'Not found' }, 404)
  const content = readFileSync(filePath, 'utf-8')
  return c.json({ id, content, filePath })
})

// PUT /:id/content — update SCRIPT.md
scriptFilesRouter.put('/:id/content', zValidator('json', z.object({
  content: z.string().min(1),
})), async (c) => {
  const id = c.req.param('id')
  if (!VALID_ID.test(id)) return c.json({ error: 'Invalid ID' }, 400)
  const filePath = join(config.CLAUDE_HOME, 'scripts', id, 'SCRIPT.md')
  if (!existsSync(filePath)) return c.json({ error: 'Not found' }, 404)
  const { content } = c.req.valid('json')
  writeFileSync(filePath, content)
  return c.json({ ok: true, id })
})

// GET /:id/entrypoint — read executable source
scriptFilesRouter.get('/:id/entrypoint', async (c) => {
  const id = c.req.param('id')
  if (!VALID_ID.test(id)) return c.json({ error: 'Invalid ID' }, 400)
  const script = getScript(id)
  if (!script) return c.json({ error: 'Not found' }, 404)
  const content = readFileSync(script.executablePath, 'utf-8')
  return c.json({ id, content, filePath: script.executablePath, entrypoint: script.entrypoint })
})

// PUT /:id/entrypoint — update executable source
scriptFilesRouter.put('/:id/entrypoint', zValidator('json', z.object({
  content: z.string().min(1),
})), async (c) => {
  const id = c.req.param('id')
  if (!VALID_ID.test(id)) return c.json({ error: 'Invalid ID' }, 400)
  const script = getScript(id)
  if (!script) return c.json({ error: 'Not found' }, 404)
  const { content } = c.req.valid('json')
  writeFileSync(script.executablePath, content, { mode: 0o755 })
  return c.json({ ok: true, id })
})

export default scriptFilesRouter
