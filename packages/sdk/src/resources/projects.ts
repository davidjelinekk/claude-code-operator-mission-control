import type { HttpClient } from '../http.js'
import type { Project, CreateProject, UpdateProject } from '../types.js'

type CreateProjectInput = Partial<CreateProject> & Pick<CreateProject, 'name'>

interface AddTaskInput {
  taskId: string
  position?: number
  executionMode?: 'sequential' | 'parallel'
}

interface UpdateTaskExecutionInput {
  executionMode?: 'sequential' | 'parallel'
  order?: number
}

interface ProjectProgress {
  total: number
  done: number
  progressPct: number
}

export class ProjectsResource {
  constructor(private http: HttpClient) {}

  list() {
    return this.http.get<Project[]>('/api/projects')
  }

  create(data: CreateProjectInput) {
    return this.http.post<Project>('/api/projects', data)
  }

  get(id: string) {
    return this.http.get<{ project: Project; tasks: Array<Record<string, unknown>> }>(`/api/projects/${id}`)
  }

  update(id: string, data: UpdateProject) {
    return this.http.patch<Project>(`/api/projects/${id}`, data)
  }

  delete(id: string) {
    return this.http.delete<{ ok: boolean }>(`/api/projects/${id}`)
  }

  addTask(id: string, data: AddTaskInput) {
    return this.http.post<{ ok: boolean }>(`/api/projects/${id}/tasks`, data)
  }

  removeTask(id: string, taskId: string) {
    return this.http.delete<{ ok: boolean }>(`/api/projects/${id}/tasks/${taskId}`)
  }

  kickoff(id: string) {
    return this.http.post<{ project: Project; tasks: Array<Record<string, unknown>> }>(`/api/projects/${id}/kickoff`)
  }

  progress(id: string) {
    return this.http.get<ProjectProgress>(`/api/projects/${id}/progress`)
  }

  updateTaskExecution(id: string, taskId: string, data: UpdateTaskExecutionInput) {
    return this.http.patch<Record<string, unknown>>(`/api/projects/${id}/tasks/${taskId}`, data)
  }

  initWorkspace(id: string) {
    return this.http.post<{ ok: boolean; workspacePath: string }>(`/api/projects/${id}/workspace`)
  }
}
