import { useQuery, useMutation } from '@tanstack/react-query'
import { api, queryClient } from '@/lib/api'
import type { Task, BoardSnapshot } from './boards'

export interface TaskDep {
  id: string
  taskId: string
  dependsOnTaskId: string
  dependsOn?: Task
}

export interface TaskDeps {
  blockedBy: TaskDep[]
  blocking: TaskDep[]
}

export interface TaskNote {
  id: string
  taskId: string
  boardId: string
  agentId?: string | null
  eventType: string
  message: string
  metadata?: Record<string, unknown> | null
  createdAt: string
}

export function useTaskNotes(taskId: string) {
  return useQuery<TaskNote[]>({
    queryKey: ['task', taskId, 'notes'],
    queryFn: () => api.get(`api/tasks/${taskId}/notes`).json<TaskNote[]>(),
  })
}

export function useCreateTaskNote(taskId: string) {
  return useMutation({
    mutationFn: (data: { message: string; agentId?: string; metadata?: Record<string, unknown> }) =>
      api.post(`api/tasks/${taskId}/notes`, { json: data }).json<TaskNote>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId, 'notes'] })
    },
  })
}

export function useBoardTasks(boardId: string) {
  return useQuery<Task[]>({
    queryKey: ['tasks', 'board', boardId],
    queryFn: () => api.get('api/tasks', { searchParams: { boardId } }).json<Task[]>(),
    enabled: !!boardId,
  })
}

export function useTasksInProgress(boardId?: string) {
  const searchParams: Record<string, string> = { status: 'in_progress' }
  if (boardId) searchParams.boardId = boardId
  return useQuery<Task[]>({
    queryKey: ['tasks', 'in_progress', boardId],
    queryFn: () => api.get('api/tasks', { searchParams }).json<Task[]>(),
    refetchInterval: 15_000,
  })
}

export function useInboxQueue(boardId?: string, limit?: number) {
  const searchParams: Record<string, string> = {}
  if (boardId) searchParams.boardId = boardId
  if (limit != null) searchParams.limit = String(limit)
  return useQuery<Task[]>({
    queryKey: ['tasks', 'queue', boardId, limit],
    queryFn: () => api.get('api/tasks/queue', { searchParams }).json<Task[]>(),
    refetchInterval: 15_000,
  })
}

export function useCreateTask(boardId: string) {
  return useMutation({
    mutationFn: (data: { title: string; status: Task['status']; priority?: Task['priority'] }) =>
      api.post('api/tasks', { json: { boardId, ...data } }).json<Task>(),
    onSuccess: (task) => {
      queryClient.setQueryData<BoardSnapshot>(['board', boardId, 'snapshot'], (old) => {
        if (!old) return old
        return { ...old, tasks: [...old.tasks, task] }
      })
    },
  })
}

export function useUpdateTask() {
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Task> & { id: string }) =>
      api.patch(`api/tasks/${id}`, { json: data }).json<Task>(),
    onSuccess: (task) => {
      queryClient.setQueryData<BoardSnapshot>(['board', task.boardId, 'snapshot'], (old) => {
        if (!old) return old
        return { ...old, tasks: old.tasks.map((t) => (t.id === task.id ? task : t)) }
      })
    },
  })
}

export function useDeleteTask() {
  return useMutation({
    mutationFn: ({ id }: { id: string; boardId: string }) =>
      api.delete(`api/tasks/${id}`).json<void>(),
    onSuccess: (_, { id, boardId }) => {
      queryClient.setQueryData<BoardSnapshot>(['board', boardId, 'snapshot'], (old) => {
        if (!old) return old
        return { ...old, tasks: old.tasks.filter((t) => t.id !== id) }
      })
    },
  })
}

export interface TaskPlanningSession {
  id: string
  taskId: string
  boardId: string
  status: string
  sessionKey: string | null
  messages: Array<{ role: string; content: string; timestamp: string }> | null
  planningSpec: Record<string, unknown> | null
  suggestedAgents: Array<{ name: string; role?: string; avatar_emoji?: string }> | null
  createdAt: string
  updatedAt: string
}

export function useStartTaskPlanning(taskId: string) {
  return useMutation({
    mutationFn: () =>
      api.post(`api/tasks/${taskId}/planning/start`).json<TaskPlanningSession>(),
  })
}

export function useAddDep() {
  return useMutation({
    mutationFn: ({ taskId, dependsOnTaskId }: { taskId: string; dependsOnTaskId: string }) =>
      api.post(`api/tasks/${taskId}/deps`, { json: { dependsOnTaskId } }).json<TaskDep>(),
  })
}

export function useRemoveDep() {
  return useMutation({
    mutationFn: ({ taskId, depId }: { taskId: string; depId: string }) =>
      api.delete(`api/tasks/${taskId}/deps/${depId}`).json<void>(),
  })
}

export function useTaskDeps(taskId: string) {
  return useQuery({
    queryKey: ['task-deps', taskId],
    queryFn: () => api.get(`api/tasks/${taskId}/deps`).json<TaskDeps>(),
    enabled: !!taskId,
  })
}

export function useAddTaskDep(taskId: string) {
  return useMutation({
    mutationFn: (dependsOnTaskId: string) =>
      api.post(`api/tasks/${taskId}/deps`, { json: { dependsOnTaskId } }).json<TaskDep>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['task-deps', taskId] }),
  })
}

export function useRemoveTaskDep(taskId: string) {
  return useMutation({
    mutationFn: (depId: string) => api.delete(`api/tasks/${taskId}/deps/${depId}`).json<void>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['task-deps', taskId] }),
  })
}

export function useTaskPlanning(taskId: string) {
  return useQuery({
    queryKey: ['task-planning', taskId],
    queryFn: () => api.get(`api/tasks/${taskId}/planning`).json<TaskPlanningSession>(),
    enabled: !!taskId,
    refetchInterval: 5000,
    retry: false,
  })
}

export function useSubmitPlanningAnswer(taskId: string) {
  return useMutation({
    mutationFn: (answer: string) =>
      api.post(`api/tasks/${taskId}/planning/answer`, { json: { answer } }).json<TaskPlanningSession>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['task-planning', taskId] }),
  })
}

export function useClaimTask() {
  return useMutation({
    mutationFn: ({ taskId, agentId }: { taskId: string; agentId: string }) =>
      api.post(`api/tasks/${taskId}/claim`, { json: { agentId } }).json<Task>(),
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', task.boardId] })
      queryClient.invalidateQueries({ queryKey: ['tasks', 'queue'] })
    },
  })
}

export function useCancelTask() {
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.post(`api/tasks/${id}/cancel`, { json: { reason } }).json<Task>(),
    onSuccess: (task) => {
      queryClient.setQueryData<BoardSnapshot>(['board', task.boardId, 'snapshot'], (old) => {
        if (!old) return old
        return { ...old, tasks: old.tasks.map((t) => (t.id === task.id ? task : t)) }
      })
    },
  })
}

export function useOverdueTasks(boardId?: string) {
  const searchParams: Record<string, string> = { limit: '20' }
  if (boardId) searchParams.boardId = boardId
  return useQuery<Task[]>({
    queryKey: ['tasks', 'overdue', boardId],
    queryFn: () => api.get('api/tasks/overdue', { searchParams }).json<Task[]>(),
    refetchInterval: 60_000,
  })
}

export function useFailedTasksAnalytics(start: string, end: string, boardId?: string) {
  const searchParams: Record<string, string> = { start, end }
  if (boardId) searchParams.boardId = boardId
  return useQuery<{ count: number; tasks: Array<{ taskId: string; title: string; boardId: string; completedAt: string | null; assignedAgentId: string | null }> }>({
    queryKey: ['analytics', 'failed-tasks', start, end, boardId],
    queryFn: () => api.get('api/analytics/failed-tasks', { searchParams }).json(),
    refetchInterval: 60_000,
  })
}

export function useAgentTasks(agentId: string) {
  return useQuery<Task[]>({
    queryKey: ['tasks', 'agent', agentId],
    queryFn: () => api.get('api/tasks', { searchParams: { assignedAgentId: agentId, limit: '100' } }).json<Task[]>(),
    enabled: !!agentId,
    refetchInterval: 30_000,
  })
}

export function useAgentInProgressCount(agentId: string) {
  return useQuery<Task[]>({
    queryKey: ['tasks', 'agent-inprogress', agentId],
    queryFn: () => api.get('api/tasks', { searchParams: { assignedAgentId: agentId, status: 'in_progress', limit: '50' } }).json<Task[]>(),
    refetchInterval: 30_000,
  })
}
