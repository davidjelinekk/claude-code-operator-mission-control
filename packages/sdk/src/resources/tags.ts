import type { HttpClient } from '../http.js'

interface Tag {
  id: string
  name: string
  slug: string
  color: string | null
  description: string | null
  createdAt: string
  updatedAt: string
}

interface CreateTagInput {
  name: string
  color?: string
  description?: string
}

type UpdateTagInput = Partial<CreateTagInput>

export class TagsResource {
  constructor(private http: HttpClient) {}

  list() {
    return this.http.get<Tag[]>('/api/tags')
  }

  create(data: CreateTagInput) {
    return this.http.post<Tag>('/api/tags', data)
  }

  get(id: string) {
    return this.http.get<Tag>(`/api/tags/${id}`)
  }

  update(id: string, data: UpdateTagInput) {
    return this.http.patch<Tag>(`/api/tags/${id}`, data)
  }

  delete(id: string) {
    return this.http.delete<{ ok: boolean }>(`/api/tags/${id}`)
  }

  taskTags(taskId: string) {
    return this.http.get<Tag[]>(`/api/tags/tasks/${taskId}`)
  }

  addTagToTask(taskId: string, tagId: string) {
    return this.http.post<{ ok: boolean }>(`/api/tags/tasks/${taskId}/add`, { tagId })
  }

  removeTagFromTask(taskId: string, tagId: string) {
    return this.http.delete<{ ok: boolean }>(`/api/tags/tasks/${taskId}/${tagId}`)
  }
}
