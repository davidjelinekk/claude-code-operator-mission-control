import { useQuery, useMutation } from '@tanstack/react-query'
import { api, queryClient } from '@/lib/api'

export interface ActivityEvent {
  id: string
  boardId?: string
  taskId?: string
  agentId?: string
  eventType: string
  message: string
  metadata?: Record<string, unknown>
  createdAt: string
}

interface ActivityParams {
  boardId?: string
  taskId?: string
  eventType?: string
}

export function useActivity(params?: ActivityParams) {
  const searchParams = new URLSearchParams()
  if (params?.boardId) searchParams.set('boardId', params.boardId)
  if (params?.taskId) searchParams.set('taskId', params.taskId)
  if (params?.eventType) searchParams.set('eventType', params.eventType)
  const qs = searchParams.toString()

  return useQuery<ActivityEvent[]>({
    queryKey: ['activity', params],
    queryFn: async () => {
      const url = qs ? `api/activity?${qs}` : 'api/activity'
      const result = await api.get(url).json<ActivityEvent[] | { events: ActivityEvent[] } | { data: ActivityEvent[] }>()
      if (Array.isArray(result)) return result
      if ('events' in result) return result.events
      if ('data' in result) return result.data
      return []
    },
    refetchInterval: 10_000,
  })
}

export function useCreateActivity() {
  return useMutation({
    mutationFn: (data: {
      taskId?: string
      boardId?: string
      eventType: string
      message: string
    }) => api.post('api/activity', { json: data }).json<ActivityEvent>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}
