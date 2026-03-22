import type { HttpClient } from '../http.js'

interface ActivityEvent {
  id: string
  boardId: string | null
  taskId: string | null
  agentId: string | null
  eventType: string
  message: string
  metadata: Record<string, unknown> | null
  createdAt: string
}

interface CreateActivityInput {
  boardId?: string
  taskId?: string
  agentId?: string
  eventType: string
  message: string
  metadata?: Record<string, unknown>
}

interface ActivityListParams {
  boardId?: string
  taskId?: string
  eventType?: string
  limit?: number
  offset?: number
}

export class ActivityResource {
  constructor(private http: HttpClient) {}

  list(params?: ActivityListParams) {
    const qs = new URLSearchParams()
    if (params?.boardId) qs.set('boardId', params.boardId)
    if (params?.taskId) qs.set('taskId', params.taskId)
    if (params?.eventType) qs.set('eventType', params.eventType)
    if (params?.limit != null) qs.set('limit', String(params.limit))
    if (params?.offset != null) qs.set('offset', String(params.offset))
    const q = qs.toString()
    return this.http.get<ActivityEvent[]>(`/api/activity${q ? `?${q}` : ''}`)
  }

  create(data: CreateActivityInput) {
    return this.http.post<ActivityEvent>('/api/activity', data)
  }

  streamUrl(params?: { boardId?: string }) {
    const qs = new URLSearchParams()
    if (params?.boardId) qs.set('boardId', params.boardId)
    const q = qs.toString()
    return this.http.sseUrl(`/api/activity/stream${q ? `?${q}` : ''}`)
  }
}
