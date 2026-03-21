import type { HttpClient } from '../http.js'

interface Webhook {
  id: string
  url: string
  secret: string | null
  events: string[]
  boardId: string | null
  description: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

interface CreateWebhookInput {
  url: string
  secret?: string
  events: string[]
  boardId?: string | null
  description?: string
  active?: boolean
}

type UpdateWebhookInput = Partial<CreateWebhookInput>

interface WebhookTestResult {
  ok: boolean
  status?: number
  statusText?: string
  error?: string
}

export class WebhooksResource {
  constructor(private http: HttpClient) {}

  list(params?: { boardId?: string }) {
    const qs = new URLSearchParams()
    if (params?.boardId) qs.set('boardId', params.boardId)
    const q = qs.toString()
    return this.http.get<Webhook[]>(`/api/webhooks${q ? `?${q}` : ''}`)
  }

  create(data: CreateWebhookInput) {
    return this.http.post<Webhook>('/api/webhooks', data)
  }

  get(id: string) {
    return this.http.get<Webhook>(`/api/webhooks/${id}`)
  }

  update(id: string, data: UpdateWebhookInput) {
    return this.http.patch<Webhook>(`/api/webhooks/${id}`, data)
  }

  delete(id: string) {
    return this.http.delete<{ ok: boolean }>(`/api/webhooks/${id}`)
  }

  test(id: string) {
    return this.http.post<WebhookTestResult>(`/api/webhooks/${id}/test`)
  }
}
