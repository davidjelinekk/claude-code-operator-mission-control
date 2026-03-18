import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { api, queryClient } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { usePageActive } from '@/hooks/usePageActive'

async function streamApprovals(
  url: string,
  token: string,
  signal: AbortSignal,
  onMessage: (data: Approval) => void,
): Promise<void> {
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  })
  const reader = resp.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try { onMessage(JSON.parse(line.slice(6))) } catch { /* malformed SSE frame */ }
      }
    }
  }
}

export interface Approval {
  id: string
  boardId: string
  taskId?: string | null
  agentId: string
  actionType: string
  payload?: Record<string, unknown> | null
  confidence?: string | null
  rubricScores?: Record<string, unknown> | null
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  updatedAt: string
}

export function useApprovals(boardId: string) {
  const qc = useQueryClient()
  const token = useAuthStore((s) => s.token)
  const isActive = usePageActive()
  const abortRef = useRef<AbortController | null>(null)

  const query = useQuery<Approval[]>({
    queryKey: ['approvals', boardId],
    queryFn: () => api.get(`api/approvals?boardId=${boardId}&limit=100`).json<Approval[]>(),
    enabled: Boolean(boardId),
  })

  useEffect(() => {
    if (!boardId || !token || !isActive) {
      abortRef.current?.abort()
      abortRef.current = null
      return
    }

    const ac = new AbortController()
    abortRef.current = ac

    const apiBase = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001').replace(/\/$/, '')
    const url = `${apiBase}/api/approvals/boards/${boardId}/stream`

    streamApprovals(url, token, ac.signal, (incoming) => {
      qc.setQueryData<Approval[]>(['approvals', boardId], (prev = []) => {
        const idx = prev.findIndex((a) => a.id === incoming.id)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = incoming
          return next
        }
        return [incoming, ...prev]
      })
    }).catch(() => {})

    return () => {
      ac.abort()
      abortRef.current = null
    }
  }, [boardId, token, isActive, qc])

  return query
}

export function useUpdateApproval(boardId: string) {
  return useMutation({
    mutationFn: ({ id, status, rubricScores }: { id: string; status?: 'approved' | 'rejected'; rubricScores?: Record<string, unknown> }) =>
      api
        .patch(`api/approvals/${id}`, {
          json: {
            ...(status !== undefined && { status }),
            ...(rubricScores !== undefined && { rubricScores }),
          },
        })
        .json<Approval>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals', boardId] })
      queryClient.invalidateQueries({ queryKey: ['board', boardId, 'snapshot'] })
    },
  })
}

export function useAllPendingApprovals() {
  return useQuery<Approval[]>({
    queryKey: ['approvals', 'all-pending'],
    queryFn: () => api.get('api/approvals?status=pending&limit=200').json<Approval[]>(),
    refetchInterval: 30_000,
  })
}
