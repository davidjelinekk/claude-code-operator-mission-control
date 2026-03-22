import type { HttpClient } from '../http.js'
import type { Task, CreateTask, UpdateTask } from '../types.js'

type CreateTaskInput = Partial<CreateTask> & Pick<CreateTask, 'boardId' | 'title'>

interface TaskListParams {
  boardId?: string
  projectId?: string
  status?: string
  assignedAgentId?: string
  limit?: number
  offset?: number
}

export class TasksResource {
  constructor(private http: HttpClient) {}

  list(params?: TaskListParams) {
    const qs = new URLSearchParams()
    if (params?.boardId) qs.set('boardId', params.boardId)
    if (params?.projectId) qs.set('projectId', params.projectId)
    if (params?.status) qs.set('status', params.status)
    if (params?.assignedAgentId) qs.set('assignedAgentId', params.assignedAgentId)
    if (params?.limit != null) qs.set('limit', String(params.limit))
    if (params?.offset != null) qs.set('offset', String(params.offset))
    const q = qs.toString()
    return this.http.get<Task[]>(`/api/tasks${q ? `?${q}` : ''}`)
  }

  create(data: CreateTaskInput) {
    return this.http.post<Task>('/api/tasks', data)
  }

  get(id: string) {
    return this.http.get<Task>(`/api/tasks/${id}`)
  }

  update(id: string, data: UpdateTask) {
    return this.http.patch<Task>(`/api/tasks/${id}`, data)
  }

  delete(id: string) {
    return this.http.delete<{ ok: boolean }>(`/api/tasks/${id}`)
  }

  queue(params?: { boardId?: string; agentId?: string; limit?: number }) {
    const qs = new URLSearchParams()
    if (params?.boardId) qs.set('boardId', params.boardId)
    if (params?.agentId) qs.set('agentId', params.agentId)
    if (params?.limit != null) qs.set('limit', String(params.limit))
    const q = qs.toString()
    return this.http.get<Task[]>(`/api/tasks/queue${q ? `?${q}` : ''}`)
  }

  batch(tasks: CreateTaskInput[]) {
    return this.http.post<Task[]>('/api/tasks/batch', { tasks })
  }

  overdue() {
    return this.http.get<Task[]>('/api/tasks/overdue')
  }

  claim(id: string, agentId: string) {
    return this.http.post<Task>(`/api/tasks/${id}/claim`, { agentId })
  }

  cancel(id: string, reason?: string) {
    return this.http.post<Task>(`/api/tasks/${id}/cancel`, { reason })
  }

  notes(id: string) {
    return this.http.get<Array<Record<string, unknown>>>(`/api/tasks/${id}/notes`)
  }

  addNote(id: string, content: string) {
    return this.http.post<Record<string, unknown>>(`/api/tasks/${id}/notes`, { message: content })
  }

  deps(id: string) {
    return this.http.get<{ blockedBy: Array<{ taskId: string; dependsOnTaskId: string }>; blocking: Array<{ taskId: string; dependsOnTaskId: string }> }>(`/api/tasks/${id}/deps`)
  }

  addDep(id: string, dependsOnTaskId: string) {
    return this.http.post<{ ok: true }>(`/api/tasks/${id}/deps`, { dependsOnTaskId })
  }

  removeDep(id: string, depId: string) {
    return this.http.delete<{ ok: boolean }>(`/api/tasks/${id}/deps/${depId}`)
  }
}
