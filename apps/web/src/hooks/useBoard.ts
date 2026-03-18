import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, queryClient } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { useToastStore } from '@/store/toast'
import type { BoardSnapshot, Task } from './api/boards'

function getBoardWsUrl(boardId: string, token: string | null): string {
  const base = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
  const wsBase = base.replace(/^http/, 'ws')
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : ''
  return `${wsBase}/ws/board/${boardId}${tokenParam}`
}

function patchSnapshot(boardId: string, event: { type: string; task?: Task; taskId?: string }) {
  queryClient.setQueryData<BoardSnapshot>(['board', boardId, 'snapshot'], (old) => {
    if (!old) return old
    switch (event.type) {
      case 'task.created':
        if (!event.task) return old
        return { ...old, tasks: [...old.tasks.filter((t) => t.id !== event.task!.id), event.task] }
      case 'task.updated':
        if (!event.task) return old
        return { ...old, tasks: old.tasks.map((t) => (t.id === event.task!.id ? { ...t, ...event.task } : t)) }
      case 'task.status':
        if (!event.task) return old
        return {
          ...old,
          tasks: old.tasks.map((t) =>
            t.id === event.task!.id ? { ...t, status: event.task!.status } : t,
          ),
        }
      case 'task.deleted':
        return { ...old, tasks: old.tasks.filter((t) => t.id !== event.taskId) }
      default:
        return old
    }
  })
}

export function useBoard(boardId: string) {
  const token = useAuthStore((s) => s.token)
  const wsRef = useRef<WebSocket | null>(null)

  const query = useQuery<BoardSnapshot>({
    queryKey: ['board', boardId, 'snapshot'],
    queryFn: () => api.get(`api/boards/${boardId}/snapshot`).json<BoardSnapshot>(),
  })

  useEffect(() => {
    let ws: WebSocket
    let destroyed = false

    function connect() {
      if (destroyed) return
      const url = getBoardWsUrl(boardId, token)
      ws = new WebSocket(url)
      wsRef.current = ws

      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as { type: string; task?: Task; taskId?: string; reason?: string }
          patchSnapshot(boardId, event)

          const { addToast } = useToastStore.getState()
          if (event.type === 'task.move.blocked' && event.reason) {
            addToast(`Status change blocked: ${event.reason}`, 'error')
          } else if (event.type === 'task.updated' && event.task?.outcome === 'failed') {
            addToast(`Task failed: ${event.task.title}`, 'warning')
          } else if (event.type === 'task.cancelled' && event.task) {
            addToast(`Task cancelled: ${event.task.title}`, 'warning')
          }
        } catch {
          // ignore malformed messages
        }
      }

      ws.onclose = () => {
        if (!destroyed) {
          setTimeout(connect, 3000)
        }
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      destroyed = true
      wsRef.current?.close()
    }
  }, [boardId, token])

  return query
}
