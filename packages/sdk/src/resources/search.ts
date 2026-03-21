import type { HttpClient } from '../http.js'

export class SearchResource {
  constructor(private http: HttpClient) {}

  query(q: string) {
    return this.http.get<{ tasks: unknown[]; boards: unknown[] }>(`/api/search?q=${encodeURIComponent(q)}`)
  }

  semantic(q: string, params?: { boardId?: string; sourceTable?: string; limit?: number }) {
    const qs = new URLSearchParams({ q })
    if (params?.boardId) qs.set('boardId', params.boardId)
    if (params?.sourceTable) qs.set('sourceTable', params.sourceTable)
    if (params?.limit) qs.set('limit', String(params.limit))
    return this.http.get<{ results: unknown[] }>(`/api/search/semantic?${qs}`)
  }
}
