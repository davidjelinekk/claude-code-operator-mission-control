import type { HttpClient } from '../http.js'
import type { Agent } from '../types.js'

interface CreateAgentParams {
  name: string
  description?: string
  provider?: 'claude' | 'codex' | 'gemini'
  model?: string
  tools?: string[]
  maxTurns?: number
  permissionMode?: string
  prompt?: string
}

export class AgentsResource {
  constructor(private http: HttpClient) {}

  list() {
    return this.http.get<Agent[]>('/api/agents')
  }

  get(id: string) {
    return this.http.get<Agent>(`/api/agents/${id}`)
  }

  create(data: CreateAgentParams) {
    return this.http.post<Agent>('/api/agents', data)
  }

  update(id: string, data: Partial<CreateAgentParams>) {
    return this.http.patch<Agent>(`/api/agents/${id}`, data)
  }

  delete(id: string) {
    return this.http.delete<{ ok: boolean }>(`/api/agents/${id}`)
  }
}
