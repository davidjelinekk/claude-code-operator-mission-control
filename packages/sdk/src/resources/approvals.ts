import type { HttpClient } from '../http.js'
import type { Approval } from '../types.js'

interface CreateApprovalInput {
  boardId: string
  taskId?: string
  agentId: string
  actionType: string
  payload?: Record<string, unknown>
  confidence?: string
}

interface UpdateApprovalInput {
  status?: 'approved' | 'rejected' | 'pending'
  rubricScores?: Record<string, unknown>
}

interface ApprovalListParams {
  boardId?: string
  taskId?: string
  status?: string
  limit?: number
  offset?: number
}

export class ApprovalsResource {
  constructor(private http: HttpClient) {}

  list(params?: ApprovalListParams) {
    const qs = new URLSearchParams()
    if (params?.boardId) qs.set('boardId', params.boardId)
    if (params?.taskId) qs.set('taskId', params.taskId)
    if (params?.status) qs.set('status', params.status)
    if (params?.limit != null) qs.set('limit', String(params.limit))
    if (params?.offset != null) qs.set('offset', String(params.offset))
    const q = qs.toString()
    return this.http.get<Approval[]>(`/api/approvals${q ? `?${q}` : ''}`)
  }

  get(id: string) {
    return this.http.get<Approval>(`/api/approvals/${id}`)
  }

  create(data: CreateApprovalInput) {
    return this.http.post<Approval>('/api/approvals', data)
  }

  updateStatus(id: string, data: UpdateApprovalInput) {
    return this.http.patch<Approval>(`/api/approvals/${id}`, data)
  }

  delete(id: string) {
    return this.http.delete<{ ok: boolean }>(`/api/approvals/${id}`)
  }

  streamUrl(boardId: string) {
    return this.http.sseUrl(`/api/approvals/boards/${boardId}/stream`)
  }
}
