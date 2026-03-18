import { useQuery, useMutation } from '@tanstack/react-query'
import { api, queryClient } from '@/lib/api'

export interface Project {
  id: string
  name: string
  description?: string
  status: 'planning' | 'active' | 'paused' | 'complete'
  progressPct: number
  targetDate?: string
  orchestratorAgentId?: string
  workspacePath?: string | null
  createdAt: string
  updatedAt: string
}

export interface ProjectTask {
  projectId: string
  taskId: string
  position: number
  executionMode: 'sequential' | 'parallel'
}

export interface Task {
  id: string
  title: string
  status: 'inbox' | 'in_progress' | 'review' | 'done'
  priority: 'low' | 'medium' | 'high'
  assignedAgentId?: string
  boardId?: string
}

export interface ProjectDetail {
  project: Project
  tasks: Array<{ pt: ProjectTask; task: Task | null }>
}

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => api.get('api/projects').json<Project[]>(),
  })
}

export function useProject(id: string) {
  return useQuery<ProjectDetail>({
    queryKey: ['projects', id],
    queryFn: () => api.get(`api/projects/${id}`).json<ProjectDetail>(),
    enabled: Boolean(id),
  })
}

export function useCreateProject() {
  return useMutation({
    mutationFn: (data: {
      name: string
      description?: string
      orchestratorAgentId?: string
      targetDate?: string
    }) => api.post('api/projects', { json: data }).json<Project>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useUpdateProject(id: string) {
  return useMutation({
    mutationFn: (data: Partial<Pick<Project, 'name' | 'description' | 'status' | 'targetDate' | 'orchestratorAgentId'>>) =>
      api.patch(`api/projects/${id}`, { json: data }).json<Project>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', id] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useKickoffProject(id: string) {
  return useMutation({
    mutationFn: () => api.post(`api/projects/${id}/kickoff`).json<{ ok: boolean }>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', id] })
    },
  })
}

export function useAddProjectTask(projectId: string) {
  return useMutation({
    mutationFn: (data: { taskId: string; executionMode: 'sequential' | 'parallel' }) =>
      api.post(`api/projects/${projectId}/tasks`, { json: data }).json<ProjectTask>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
    },
  })
}

export function useRemoveProjectTask(projectId: string) {
  return useMutation({
    mutationFn: (taskId: string) =>
      api.delete(`api/projects/${projectId}/tasks/${taskId}`).json<{ ok: boolean }>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
    },
  })
}

export function useUpdateProjectTask(projectId: string) {
  return useMutation({
    mutationFn: ({ taskId, executionMode }: { taskId: string; executionMode: 'sequential' | 'parallel' }) =>
      api.patch(`api/projects/${projectId}/tasks/${taskId}`, { json: { executionMode } }).json<ProjectTask>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
    },
  })
}

export function useInitProjectWorkspace(projectId: string) {
  return useMutation({
    mutationFn: () =>
      api.post(`api/projects/${projectId}/workspace`).json<{ ok: boolean; workspacePath: string }>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}
