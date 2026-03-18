import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { config } from '../config.js'
import { discoverAgents, getAgent } from '../services/claude-code/agent-discovery.js'

export const agentsRouter = new Hono()

function buildAgentMd(params: {
  name: string
  description?: string
  model?: string
  tools?: string[]
  maxTurns?: number
  permissionMode?: string
  prompt?: string
}): string {
  const lines = ['---']
  lines.push(`name: ${params.name}`)
  if (params.description) lines.push(`description: ${params.description}`)
  if (params.model) lines.push(`model: ${params.model}`)
  if (params.tools?.length) lines.push(`tools: [${params.tools.join(', ')}]`)
  if (params.maxTurns) lines.push(`maxTurns: ${params.maxTurns}`)
  if (params.permissionMode) lines.push(`permissionMode: ${params.permissionMode}`)
  lines.push('---')
  lines.push('')
  if (params.prompt) lines.push(params.prompt)
  return lines.join('\n')
}

agentsRouter.get('/', async (c) => {
  const agents = discoverAgents()
  return c.json(agents.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    model: a.model,
    tools: a.tools,
    maxTurns: a.maxTurns,
    permissionMode: a.permissionMode,
    status: 'available',
  })))
})

agentsRouter.get('/:id', async (c) => {
  const agent = getAgent(c.req.param('id'))
  if (!agent) return c.json({ error: 'Not found' }, 404)
  return c.json(agent)
})

agentsRouter.post('/', zValidator('json', z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  model: z.string().optional(),
  tools: z.array(z.string()).optional(),
  maxTurns: z.number().optional(),
  permissionMode: z.string().optional(),
  prompt: z.string().optional(),
})), async (c) => {
  const body = c.req.valid('json')
  const id = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')
  const agentsDir = join(config.CLAUDE_HOME, 'agents')
  mkdirSync(agentsDir, { recursive: true })
  const content = buildAgentMd(body)
  writeFileSync(join(agentsDir, `${id}.md`), content)
  const agent = getAgent(id)
  return c.json(agent, 201)
})

agentsRouter.patch('/:id', zValidator('json', z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  model: z.string().optional(),
  tools: z.array(z.string()).optional(),
  maxTurns: z.number().optional(),
  permissionMode: z.string().optional(),
  prompt: z.string().optional(),
})), async (c) => {
  const id = c.req.param('id')
  const existing = getAgent(id)
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const body = c.req.valid('json')
  const content = buildAgentMd({
    name: body.name ?? existing.name,
    description: body.description ?? existing.description ?? undefined,
    model: body.model ?? existing.model ?? undefined,
    tools: body.tools ?? existing.tools,
    maxTurns: body.maxTurns ?? existing.maxTurns ?? undefined,
    permissionMode: body.permissionMode ?? existing.permissionMode ?? undefined,
    prompt: body.prompt ?? existing.promptContent,
  })
  writeFileSync(existing.filePath, content)
  return c.json(getAgent(id))
})

agentsRouter.delete('/:id', async (c) => {
  const agent = getAgent(c.req.param('id'))
  if (!agent) return c.json({ error: 'Not found' }, 404)
  unlinkSync(agent.filePath)
  return c.json({ ok: true })
})

export default agentsRouter
