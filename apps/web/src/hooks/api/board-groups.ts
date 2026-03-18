import { useQuery, useMutation } from '@tanstack/react-query'
import { api, queryClient } from '@/lib/api'

export interface BoardGroup {
  id: string
  name: string
  slug: string
  description?: string
  boardCount?: number
  boards?: Array<{ id: string; name: string; slug: string }>
  createdAt: string
}

export function useBoardGroups() {
  return useQuery<BoardGroup[]>({
    queryKey: ['board-groups'],
    queryFn: async () => {
      const result = await api.get('api/board-groups').json<BoardGroup[] | { groups: BoardGroup[] }>()
      if (Array.isArray(result)) return result
      if ('groups' in result) return result.groups
      return []
    },
  })
}

export function useCreateBoardGroup() {
  return useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      api.post('api/board-groups', { json: data }).json<BoardGroup>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board-groups'] })
    },
  })
}

export function useDeleteBoardGroup() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`api/board-groups/${id}`).json<void>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board-groups'] })
    },
  })
}
