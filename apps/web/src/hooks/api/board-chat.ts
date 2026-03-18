import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ActivityEvent } from './activity'

export function useBoardChatHistory(boardId: string) {
  return useQuery<ActivityEvent[]>({
    queryKey: ['board-chat', boardId],
    queryFn: () => api.get(`api/boards/${boardId}/chat`).json<ActivityEvent[]>(),
    enabled: !!boardId,
  })
}
