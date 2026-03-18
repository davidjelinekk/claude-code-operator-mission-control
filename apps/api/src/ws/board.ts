import type { IncomingMessage } from 'node:http'
import type { WebSocket as WsType } from 'ws'
import { WebSocketServer } from 'ws'
import { db } from '../db/client.js'
import { boards, tasks, approvals } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { redis, redisSub } from '../lib/redis.js'
import { validateWsToken } from '../lib/auth.js'

const boardSockets = new Map<string, Set<WsType>>()
const subInitialized = new Set<string>()

async function ensureSubscribed(boardId: string): Promise<void> {
  if (subInitialized.has(boardId)) return
  subInitialized.add(boardId)
  await redisSub.subscribe(`board:${boardId}`)
}

redisSub.on('message', (channel: string, message: string) => {
  const boardId = channel.replace('board:', '')
  const sockets = boardSockets.get(boardId)
  if (!sockets) return
  for (const ws of sockets) {
    if (ws.readyState === 1) ws.send(message)
  }
})

export function createBoardWsHandler(): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true })

  wss.on('connection', async (ws: WsType, req: IncomingMessage, boardId: string) => {
    if (!boardSockets.has(boardId)) boardSockets.set(boardId, new Set())
    boardSockets.get(boardId)!.add(ws)
    await ensureSubscribed(boardId)

    // Send initial snapshot
    const [board] = await db.select().from(boards).where(eq(boards.id, boardId))
    const boardTasks = board ? await db.select().from(tasks).where(eq(tasks.boardId, boardId)) : []
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'snapshot', board, tasks: boardTasks }))

    const ping = setInterval(() => {
      if (ws.readyState === 1) ws.ping()
    }, 30_000)

    ws.on('message', async (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'task.move' && msg.taskId && msg.status) {
          const [existingTask] = await db.select().from(tasks).where(eq(tasks.id, msg.taskId))
          if (!existingTask) return

          const statusChanging = msg.status !== existingTask.status
          if (statusChanging) {
            const [board] = await db.select().from(boards).where(eq(boards.id, boardId))
            if (board) {
              // 1. blockStatusChangesWithPendingApproval
              if (board.blockStatusChangesWithPendingApproval) {
                const [pendingApproval] = await db.select().from(approvals)
                  .where(and(eq(approvals.taskId, msg.taskId), eq(approvals.status, 'pending')))
                if (pendingApproval) {
                  ws.send(JSON.stringify({ type: 'task.move.blocked', taskId: msg.taskId, reason: 'Status change blocked: this task has a pending approval.' }))
                  return
                }
              }

              // 2. requireReviewBeforeDone
              if (board.requireReviewBeforeDone && msg.status === 'done' && existingTask.status !== 'review') {
                ws.send(JSON.stringify({ type: 'task.move.blocked', taskId: msg.taskId, reason: 'Task must pass through Review before being marked Done.' }))
                return
              }

              // 3. requireApprovalForDone
              if (board.requireApprovalForDone && msg.status === 'done') {
                const [approvedApproval] = await db.select().from(approvals)
                  .where(and(eq(approvals.taskId, msg.taskId), eq(approvals.status, 'approved')))
                if (!approvedApproval) {
                  ws.send(JSON.stringify({ type: 'task.move.blocked', taskId: msg.taskId, reason: 'An approved approval is required before marking Done.' }))
                  return
                }
              }

              // 4. onlyLeadCanChangeStatus
              if (board.onlyLeadCanChangeStatus) {
                const agentId = msg.agentId
                if (!agentId || agentId !== board.gatewayAgentId) {
                  ws.send(JSON.stringify({ type: 'task.move.blocked', taskId: msg.taskId, reason: 'Only the lead agent can change task status.' }))
                  return
                }
              }
            }
          }

          await db.update(tasks).set({ status: msg.status, updatedAt: new Date() }).where(eq(tasks.id, msg.taskId))
          const [updated] = await db.select().from(tasks).where(eq(tasks.id, msg.taskId))
          if (updated) {
            await redis.publish(`board:${boardId}`, JSON.stringify({ type: 'task.status', taskId: msg.taskId, status: msg.status }))
          }
        }
      } catch {
        // ignore malformed
      }
    })

    ws.on('close', () => {
      clearInterval(ping)
      boardSockets.get(boardId)?.delete(ws)
    })
  })

  return wss
}
