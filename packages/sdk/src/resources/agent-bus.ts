import type { HttpClient } from '../http.js'
import type { AgentBusMessage } from '../types.js'

export class AgentBusResource {
  constructor(private http: HttpClient) {}

  send(message: AgentBusMessage) {
    return this.http.post<Record<string, unknown>>('/api/agent-bus/send', message)
  }

  inbox(params: { boardId: string; agentId: string; since?: string; from?: string; limit?: number }) {
    const qs = new URLSearchParams({ boardId: params.boardId, agentId: params.agentId })
    if (params.since) qs.set('since', params.since)
    if (params.from) qs.set('from', params.from)
    if (params.limit) qs.set('limit', String(params.limit))
    return this.http.get<Array<Record<string, unknown>>>(`/api/agent-bus/inbox?${qs}`)
  }

  agents(boardId: string) {
    return this.http.get<Array<{ sessionId: string; agentId: string; status: string; createdAt: string }>>(`/api/agent-bus/agents?boardId=${boardId}`)
  }
}
