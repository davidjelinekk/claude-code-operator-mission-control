import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { config } from '../config.js'

export const skillFilesRouter = new Hono()

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/

skillFilesRouter.get('/:id/content', async (c) => {
  const id = c.req.param('id')
  if (!SAFE_ID.test(id)) return c.json({ error: 'Invalid ID' }, 400)
  const filePath = join(config.CLAUDE_HOME, 'skills', id, 'SKILL.md')
  if (!existsSync(filePath)) return c.json({ error: 'Not found' }, 404)
  const content = readFileSync(filePath, 'utf-8')
  return c.json({ id, content, filePath })
})

skillFilesRouter.put('/:id/content', zValidator('json', z.object({
  content: z.string().min(1),
})), async (c) => {
  const id = c.req.param('id')
  if (!SAFE_ID.test(id)) return c.json({ error: 'Invalid ID' }, 400)
  const filePath = join(config.CLAUDE_HOME, 'skills', id, 'SKILL.md')
  if (!existsSync(filePath)) return c.json({ error: 'Not found' }, 404)
  const { content } = c.req.valid('json')
  writeFileSync(filePath, content)
  return c.json({ ok: true, id })
})

skillFilesRouter.post('/', zValidator('json', z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/),
  content: z.string().min(1),
})), async (c) => {
  const { id, content } = c.req.valid('json')
  const skillDir = join(config.CLAUDE_HOME, 'skills', id)
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(join(skillDir, 'SKILL.md'), content)
  return c.json({ ok: true, id }, 201)
})

export default skillFilesRouter
