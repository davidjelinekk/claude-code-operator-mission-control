import type { HttpClient } from '../http.js'
import type { FlowEdge } from '../types.js'

interface FlowNode {
  id: string
  name: string
  emoji: string | null
  isOnline: boolean
  hasActiveSession: boolean
  activeSessionCount: number
  hasEdges: boolean
}

interface FlowGraph {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

interface CreateEdgeInput {
  fromAgentId: string
  toAgentId: string
  messageType: string
  sessionId?: string | null
  taskId?: string | null
  tokenCost?: string | number | null
}

export class FlowResource {
  constructor(private http: HttpClient) {}

  graph(params?: { window?: '1h' | '6h' | '24h' | '7d' }) {
    const qs = new URLSearchParams()
    if (params?.window) qs.set('window', params.window)
    const q = qs.toString()
    return this.http.get<FlowGraph>(`/api/flow/graph${q ? `?${q}` : ''}`)
  }

  listEdges(params?: { limit?: number }) {
    const qs = new URLSearchParams()
    if (params?.limit) qs.set('limit', String(params.limit))
    const q = qs.toString()
    return this.http.get<FlowEdge[]>(`/api/flow/edges${q ? `?${q}` : ''}`)
  }

  createEdge(data: CreateEdgeInput) {
    return this.http.post<FlowEdge>('/api/flow/edges', data)
  }
}
