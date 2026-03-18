import { Hono } from 'hono'
import { listSessions, parseSessionMessages } from '../services/claude-code/session-parser.js'

export const sessionsRouter = new Hono()

sessionsRouter.get('/', async (c) => {
  const limit = parseInt(c.req.query('limit') ?? '50', 10)
  const sessions = listSessions().slice(0, limit)
  return c.json(sessions.map((s) => ({
    sessionId: s.sessionId,
    projectName: s.projectName,
    sizeBytes: s.sizeBytes,
    modifiedAt: s.modifiedAt.toISOString(),
  })))
})

sessionsRouter.get('/:projectPath/:sessionId', async (c) => {
  const projectPath = c.req.param('projectPath')
  const sessionId = c.req.param('sessionId')
  const sessions = listSessions()
  const session = sessions.find((s) => s.projectPath === projectPath && s.sessionId === sessionId)
  if (!session) return c.json({ error: 'Not found' }, 404)

  const { messages } = await parseSessionMessages(session.filePath)
  return c.json({
    ...session,
    modifiedAt: session.modifiedAt.toISOString(),
    messageCount: messages.length,
    messages: messages.slice(0, 200),
  })
})

export default sessionsRouter
