import type { IncomingMessage } from 'node:http'
import type { WebSocket as WsType } from 'ws'
import { WebSocketServer } from 'ws'
import { db } from '../db/client.js'
import { agentFlowEdges } from '../db/schema.js'
import { desc } from 'drizzle-orm'
import { redisSub } from '../lib/redis.js'

const flowSockets = new Set<WsType>()
let flowSubInitialized = false

async function ensureSubscribed(): Promise<void> {
  if (flowSubInitialized) return
  flowSubInitialized = true
  await redisSub.subscribe('flow:edges')
}

redisSub.on('message', (channel: string, message: string) => {
  if (channel !== 'flow:edges') return
  for (const ws of flowSockets) {
    if (ws.readyState === 1) ws.send(message)
  }
})

export function createFlowWsHandler(): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true })

  wss.on('connection', async (ws: WsType, req: IncomingMessage) => {
    flowSockets.add(ws)
    await ensureSubscribed()

    // Replay last 100 edges
    const recent = await db.select().from(agentFlowEdges).orderBy(desc(agentFlowEdges.occurredAt)).limit(100)
    ws.send(JSON.stringify({ type: 'edge.batch', edges: recent }))

    const ping = setInterval(() => {
      if (ws.readyState === 1) ws.ping()
    }, 30_000)

    ws.on('close', () => {
      clearInterval(ping)
      flowSockets.delete(ws)
    })
  })

  return wss
}
