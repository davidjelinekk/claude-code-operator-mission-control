import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { getAgentSdkStatus, spawnAgentSession } from '../services/claude-code/agent-sdk-client.js'
import { listSessions } from '../services/claude-code/session-parser.js'

export const agentSdkRouter = new Hono()

agentSdkRouter.get('/status', async (c) => {
  const status = getAgentSdkStatus()
  return c.json(status)
})

agentSdkRouter.post('/spawn', zValidator('json', z.object({
  prompt: z.string().min(1),
  model: z.string().optional(),
  maxTurns: z.number().optional(),
  permissionMode: z.string().optional(),
})), async (c) => {
  const body = c.req.valid('json')
  try {
    const result = await spawnAgentSession(body)
    return c.json(result, 201)
  } catch (err) {
    return c.json({ error: String(err) }, 503)
  }
})

agentSdkRouter.get('/sessions', async (c) => {
  const sessions = listSessions().slice(0, 50)
  return c.json(sessions)
})

export default agentSdkRouter
