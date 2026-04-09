import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serveStatic } from '@hono/node-server/serve-static'
import { config } from './config.js'
import { authMiddleware, validateWsToken, seedAdmin } from './lib/auth.js'
import { redis, redisSub } from './lib/redis.js'
import boardsRouter from './routes/boards.js'
import tasksRouter from './routes/tasks.js'
import projectsRouter from './routes/projects.js'
import analyticsRouter from './routes/analytics.js'
import agentsRouter from './routes/agents.js'
import agentSdkRouter from './routes/agent-sdk.js'
import hooksRouter from './routes/hooks.js'
import mcpServersRouter from './routes/mcp-servers.js'
import agentFilesRouter from './routes/agent-files.js'
import skillFilesRouter from './routes/skill-files.js'
import scriptsRouter from './routes/scripts.js'
import scriptFilesRouter from './routes/script-files.js'
import sessionsRouter from './routes/sessions.js'
import skillsRouter from './routes/skills.js'
import cronRouter from './routes/cron.js'
import flowRouter from './routes/flow.js'
import peopleRouter from './routes/people.js'
import approvalsRouter from './routes/approvals.js'
import tagsRouter from './routes/tags.js'
import activityRouter from './routes/activity.js'
import boardChatRouter from './routes/board-chat.js'
import boardMemoryRouter from './routes/board-memory.js'
import boardGroupsRouter from './routes/board-groups.js'
import customFieldsRouter from './routes/custom-fields.js'
import taskPlanningRouter, { taskPlanningCallbackRouter } from './routes/task-planning.js'
import skillPacksRouter from './routes/skill-packs.js'
import authRouter from './routes/auth.js'
import agentBusRouter from './routes/agent-bus.js'
import searchRouter from './routes/search.js'
import webhooksRouter from './routes/webhooks.js'
import systemRouter from './routes/system.js'
import taskTemplatesRouter from './routes/task-templates.js'
import { createBoardWsHandler } from './ws/board.js'
import { createFlowWsHandler } from './ws/flow.js'
import { analyticsIngestWorker } from './workers/analytics.js'
import { skillsRefreshWorker } from './workers/skills.js'
import { flowTailWorker } from './workers/flow.js'
import { embeddingWorker } from './workers/embedding.js'
import { extractionWorker } from './workers/extraction.js'
import { claudeMemSyncWorker } from './workers/claude-mem-sync.js'
import { sessionManager } from './services/claude-code/agent-sdk-client.js'
import { registerProvider } from './services/providers/registry.js'
import { ClaudeProvider } from './services/providers/claude-provider.js'
import { CodexProvider } from './services/providers/codex-provider.js'
import { GeminiProvider } from './services/providers/gemini-provider.js'
import semanticSearchRouter from './routes/semantic-search.js'
import contextGraphRouter from './routes/context-graph.js'

const app = new Hono()

app.onError((err, c) => {
  const statusCode = err instanceof Error && 'status' in err ? (err as { status: number }).status : 500
  console.error(`[error] ${c.req.method} ${c.req.path}:`, err.message)
  return c.json(
    { error: statusCode === 500 ? 'Internal server error' : err.message },
    statusCode as 400 | 401 | 403 | 404 | 409 | 500,
  )
})

app.use('*', logger())
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map(s => s.trim())
app.use('/api/*', cors({
  origin: (origin) => ALLOWED_ORIGINS.includes(origin) ? origin : null,
}))

// Agent callback route — no OPERATOR_TOKEN required; auth is the session ID
// passed as ?sid= in the URL, which is validated against the DB.
app.route('/plan', taskPlanningCallbackRouter)

// Auth routes are public (login) or self-validating (logout/me)
app.route('/api/auth', authRouter)

app.use('/api/*', authMiddleware)

app.route('/api/boards', boardsRouter)
app.route('/api/tasks', tasksRouter)
app.route('/api/projects', projectsRouter)
app.route('/api/analytics', analyticsRouter)
app.route('/api/agents', agentsRouter)
app.route('/api/agent-sdk', agentSdkRouter)
app.route('/api/hooks', hooksRouter)
app.route('/api/mcp-servers', mcpServersRouter)
app.route('/api/agent-files', agentFilesRouter)
app.route('/api/skill-files', skillFilesRouter)
app.route('/api/scripts', scriptsRouter)
app.route('/api/script-files', scriptFilesRouter)
app.route('/api/sessions', sessionsRouter)
app.route('/api/skills', skillsRouter)
app.route('/api/cron', cronRouter)
app.route('/api/flow', flowRouter)
app.route('/api/people', peopleRouter)
app.route('/api/approvals', approvalsRouter)
app.route('/api/tags', tagsRouter)
app.route('/api/activity', activityRouter)
app.route('/api', boardChatRouter)
app.route('/api', boardMemoryRouter)
app.route('/api/board-groups', boardGroupsRouter)
app.route('/api/custom-fields', customFieldsRouter)
app.route('/api', taskPlanningRouter)
app.route('/api/skill-packs', skillPacksRouter)
app.route('/api/agent-bus', agentBusRouter)
app.route('/api/search', searchRouter)
app.route('/api/search', semanticSearchRouter)
app.route('/api/context-graph', contextGraphRouter)
app.route('/api/webhooks', webhooksRouter)
app.route('/api/system', systemRouter)
app.route('/api/task-templates', taskTemplatesRouter)

app.get('/health', (c) => c.json({ ok: true, version: '1.0.0' }))

// Serve web statics (must be last, only if dist exists)
app.use('/*', serveStatic({ root: './web-dist' }))
app.use('/*', serveStatic({ root: '../../apps/web/dist' }))

// SPA fallback — serve index.html for any unmatched non-API route
app.get('/*', async (c) => {
  const { readFileSync, existsSync } = await import('node:fs')
  const { join } = await import('node:path')
  for (const root of ['./web-dist', '../../apps/web/dist']) {
    const indexPath = join(root, 'index.html')
    if (existsSync(indexPath)) {
      return c.html(readFileSync(indexPath, 'utf-8'))
    }
  }
  return c.notFound()
})

const boardWss = createBoardWsHandler()
const flowWss = createFlowWsHandler()

async function start(): Promise<void> {
  // Register CLI providers
  registerProvider(new ClaudeProvider())
  registerProvider(new CodexProvider())
  registerProvider(new GeminiProvider())

  await redis.connect()
  await redisSub.connect()
  await seedAdmin()

  // Startup workers (non-blocking)
  skillsRefreshWorker.run().catch((err) => console.error('[worker] skills refresh failed:', err.message))
  analyticsIngestWorker.run().catch((err) => console.error('[worker] analytics ingest failed:', err.message))
  setTimeout(() => flowTailWorker.run().catch((err) => console.error('[worker] flow tail failed:', err.message)), 5000)
  embeddingWorker.run().catch((err) => console.error('[worker] embedding failed:', err.message))
  extractionWorker.run().catch((err) => console.error('[worker] extraction failed:', err.message))
  claudeMemSyncWorker.run().catch((err) => console.error('[worker] claude-mem sync failed:', err.message))

  // Periodic workers
  setInterval(() => analyticsIngestWorker.run().catch((err) => console.error('[worker] analytics ingest:', err.message)), 5 * 60 * 1000)
  setInterval(() => flowTailWorker.run().catch((err) => console.error('[worker] flow tail:', err.message)), 2 * 60 * 1000)
  setInterval(() => embeddingWorker.run().catch((err) => console.error('[worker] embedding:', err.message)), 60 * 1000)
  setInterval(() => extractionWorker.run().catch((err) => console.error('[worker] extraction:', err.message)), 3 * 60 * 1000)
  setInterval(() => claudeMemSyncWorker.run().catch((err) => console.error('[worker] claude-mem sync:', err.message)), 5 * 60 * 1000)

  const server = serve({ fetch: app.fetch, port: config.PORT }) as unknown as import('node:http').Server

  // Attach WebSocket upgrade handler
  server.on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url ?? '', `http://localhost:${config.PORT}`)
    const pathname = url.pathname
    const token = url.searchParams.get('token')
      ?? req.headers['authorization']?.replace('Bearer ', '')

    const isValid = await validateWsToken(token ?? null)
    if (!isValid) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }

    const boardMatch = pathname?.match(/^\/ws\/board\/([^/]+)$/)
    if (boardMatch) {
      boardWss.handleUpgrade(req, socket, head, (ws) => {
        boardWss.emit('connection', ws, req, boardMatch[1])
      })
      return
    }

    if (pathname === '/ws/flow') {
      flowWss.handleUpgrade(req, socket, head, (ws) => {
        flowWss.emit('connection', ws, req)
      })
      return
    }

    socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
    socket.destroy()
  })

  // Graceful shutdown: clean up sessions and connections
  const shutdown = () => {
    console.info('[claude-code-operator] shutting down...')
    sessionManager.destroy()
    server.close()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  console.info(`[claude-code-operator] API running on http://localhost:${config.PORT}`)
}

start().catch((err) => {
  console.error('[claude-code-operator] startup failed:', err)
  process.exit(1)
})
