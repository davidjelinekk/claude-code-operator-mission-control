import type { HttpClient } from '../http.js'
import type { ContextGraphEntity, ContextGraphObservation } from '../types.js'

export class ContextGraphResource {
  constructor(private http: HttpClient) {}

  entities(params?: { type?: string; boardId?: string; q?: string; limit?: number }) {
    const qs = new URLSearchParams()
    if (params?.type) qs.set('type', params.type)
    if (params?.boardId) qs.set('boardId', params.boardId)
    if (params?.q) qs.set('q', params.q)
    if (params?.limit != null) qs.set('limit', String(params.limit))
    const q = qs.toString()
    return this.http.get<Array<Record<string, unknown>>>(`/api/context-graph/entities${q ? `?${q}` : ''}`)
  }

  getEntity(id: string) {
    return this.http.get<{ entity: Record<string, unknown>; neighbors: unknown[]; observations: unknown[] }>(`/api/context-graph/entities/${id}`)
  }

  subgraph(id: string, depth?: number) {
    const qs = depth ? `?depth=${depth}` : ''
    return this.http.get<Record<string, unknown>>(`/api/context-graph/entities/${id}/subgraph${qs}`)
  }

  createEntity(data: ContextGraphEntity) {
    return this.http.post<{ id: string }>('/api/context-graph/entities', data)
  }

  addObservation(data: ContextGraphObservation) {
    return this.http.post<{ id: string | null; skipped: boolean }>('/api/context-graph/observations', data)
  }

  search(q: string, params?: { boardId?: string; limit?: number }) {
    const qs = new URLSearchParams({ q })
    if (params?.boardId) qs.set('boardId', params.boardId)
    if (params?.limit != null) qs.set('limit', String(params.limit))
    return this.http.get<{ results: unknown[]; method: string }>(`/api/context-graph/search?${qs}`)
  }

  stats() {
    return this.http.get<Record<string, unknown>>('/api/context-graph/stats')
  }
}
