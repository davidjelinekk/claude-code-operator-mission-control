import { Hono } from 'hono'
import { sessionManager } from '../services/claude-code/agent-sdk-client.js'
import { listSessions, parseSessionMessages } from '../services/claude-code/session-parser.js'

export const sessionsRouter = new Hono()

sessionsRouter.get('/', async (c) => {
  const limit = parseInt(c.req.query('limit') ?? '50', 10)
  const offset = parseInt(c.req.query('offset') ?? '0', 10)
  const dir = c.req.query('dir') || undefined

  // Prefer SDK's richer session listing, fall back to custom parser
  try {
    const sessions = await sessionManager.listSdkSessions({ dir, limit, offset })
    return c.json(sessions.map((s) => ({
      sessionId: s.sessionId,
      summary: s.summary,
      customTitle: s.customTitle,
      firstPrompt: s.firstPrompt,
      gitBranch: s.gitBranch,
      cwd: s.cwd,
      fileSize: s.fileSize,
      modifiedAt: new Date(s.lastModified).toISOString(),
    })))
  } catch {
    // Fall back to custom parser
    const sessions = listSessions().slice(offset, offset + limit)
    return c.json(sessions.map((s) => ({
      sessionId: s.sessionId,
      projectName: s.projectName,
      sizeBytes: s.sizeBytes,
      modifiedAt: s.modifiedAt.toISOString(),
    })))
  }
})

sessionsRouter.get('/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId')
  const limit = parseInt(c.req.query('limit') ?? '200', 10)

  // Try SDK first
  const info = await sessionManager.getSdkSessionInfo(sessionId)
  if (info) {
    const messages = await sessionManager.getSdkSessionMessages(sessionId, { limit })
    return c.json({
      sessionId: info.sessionId,
      summary: info.summary,
      customTitle: info.customTitle,
      firstPrompt: info.firstPrompt,
      gitBranch: info.gitBranch,
      cwd: info.cwd,
      lastModified: new Date(info.lastModified).toISOString(),
      messageCount: messages.length,
      messages: messages.map((m) => ({ type: m.type, uuid: m.uuid, session_id: m.session_id })),
    })
  }

  // Fall back to custom parser for legacy /:projectPath/:sessionId pattern
  return c.json({ error: 'Not found' }, 404)
})

// Legacy route pattern preserved for backward compatibility
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
