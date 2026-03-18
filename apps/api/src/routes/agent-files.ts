import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { config } from '../config.js'

export const agentFilesRouter = new Hono()

agentFilesRouter.get('/:id/content', async (c) => {
  const id = c.req.param('id')
  const filePath = join(config.CLAUDE_HOME, 'agents', `${id}.md`)
  if (!existsSync(filePath)) return c.json({ error: 'Not found' }, 404)
  const content = readFileSync(filePath, 'utf-8')
  return c.json({ id, content, filePath })
})

agentFilesRouter.put('/:id/content', zValidator('json', z.object({
  content: z.string().min(1),
})), async (c) => {
  const id = c.req.param('id')
  const filePath = join(config.CLAUDE_HOME, 'agents', `${id}.md`)
  if (!existsSync(filePath)) return c.json({ error: 'Not found' }, 404)
  const { content } = c.req.valid('json')
  writeFileSync(filePath, content)
  return c.json({ ok: true, id })
})

export default agentFilesRouter
