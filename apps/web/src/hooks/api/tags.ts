import { useQuery, useMutation } from '@tanstack/react-query'
import { api, queryClient } from '@/lib/api'

export interface Tag {
  id: string
  name: string
  slug: string
  color: string
  description?: string
  createdAt: string
}

export function useTags() {
  return useQuery<Tag[]>({
    queryKey: ['tags'],
    queryFn: () => api.get('api/tags').json<Tag[]>(),
  })
}

export function useTaskTags(taskId: string) {
  return useQuery<Tag[]>({
    queryKey: ['tags', 'task', taskId],
    queryFn: () => api.get(`api/tags/tasks/${taskId}`).json<Tag[]>(),
    enabled: !!taskId,
  })
}

export function useCreateTag() {
  return useMutation({
    mutationFn: (data: { name: string; color: string; description?: string }) =>
      api.post('api/tags', { json: data }).json<Tag>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
  })
}

export function useUpdateTag() {
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; color?: string }) =>
      api.patch(`api/tags/${id}`, { json: data }).json<Tag>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tags'] }),
  })
}

export function useDeleteTag() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`api/tags/${id}`).json<void>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
  })
}

export function useAddTagToTask() {
  return useMutation({
    mutationFn: ({ taskId, tagId }: { taskId: string; tagId: string }) =>
      api.post(`api/tags/tasks/${taskId}/add`, { json: { tagId } }).json<void>(),
    onSuccess: (_data, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['tags', 'task', taskId] })
    },
  })
}

export function useRemoveTagFromTask() {
  return useMutation({
    mutationFn: ({ taskId, tagId }: { taskId: string; tagId: string }) =>
      api.delete(`api/tags/tasks/${taskId}/${tagId}`).json<void>(),
    onSuccess: (_data, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['tags', 'task', taskId] })
    },
  })
}
