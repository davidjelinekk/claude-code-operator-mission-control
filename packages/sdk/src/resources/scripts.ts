import type { HttpClient } from '../http.js'

interface Script {
  id: string
  name: string
  description?: string
  interpreter?: string
  entrypoint?: string
  agents?: string[]
}

interface CreateScriptParams {
  id: string
  name: string
  description?: string
  interpreter?: string
  entrypoint?: string
}

export class ScriptsResource {
  constructor(private http: HttpClient) {}

  list() {
    return this.http.get<Script[]>('/api/scripts')
  }

  get(id: string) {
    return this.http.get<Script>(`/api/scripts/${id}`)
  }

  create(data: CreateScriptParams) {
    return this.http.post<{ ok: boolean; id: string }>('/api/scripts', data)
  }

  delete(id: string) {
    return this.http.delete<{ ok: boolean }>(`/api/scripts/${id}`)
  }

  test(id: string, args?: Record<string, unknown>) {
    return this.http.post<Record<string, unknown>>(`/api/scripts/${id}/test`, { args })
  }

  refresh() {
    return this.http.post<{ ok: boolean }>('/api/scripts/refresh')
  }
}
