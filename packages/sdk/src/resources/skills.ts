import type { HttpClient } from '../http.js'
import type { SkillSnapshot } from '../types.js'

export class SkillsResource {
  constructor(private http: HttpClient) {}

  list() {
    return this.http.get<SkillSnapshot[]>('/api/skills')
  }

  get(id: string) {
    return this.http.get<SkillSnapshot>(`/api/skills/${id}`)
  }

  refresh() {
    return this.http.post<{ ok: boolean }>('/api/skills/refresh')
  }
}
