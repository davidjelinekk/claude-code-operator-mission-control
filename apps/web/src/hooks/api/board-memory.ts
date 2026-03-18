import { useQuery, useMutation } from '@tanstack/react-query'
import { api, queryClient } from '@/lib/api'

export interface BoardMemoryEntry {
  id: string
  boardId: string
  content: string
  tags: string[]
  isChat: boolean
  source: string | null
  createdAt: string
}

export function useBoardMemory(boardId: string) {
  return useQuery<BoardMemoryEntry[]>({
    queryKey: ['board-memory', boardId],
    queryFn: () => api.get(`api/boards/${boardId}/memory`).json<BoardMemoryEntry[]>(),
    enabled: Boolean(boardId),
  })
}

export function useCreateBoardMemory(boardId: string) {
  return useMutation({
    mutationFn: (data: { content: string; tags?: string[]; isChat?: boolean; source?: string }) =>
      api.post(`api/boards/${boardId}/memory`, { json: data }).json<BoardMemoryEntry>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board-memory', boardId] })
    },
  })
}

export function useDeleteBoardMemory(boardId: string) {
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`api/boards/${boardId}/memory/${id}`).json<{ ok: boolean }>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board-memory', boardId] })
    },
  })
}
