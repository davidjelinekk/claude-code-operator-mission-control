import type { HttpClient } from '../http.js'
import type { Board, CreateBoard, UpdateBoard } from '../types.js'

type CreateBoardInput = Partial<CreateBoard> & Pick<CreateBoard, 'name'>

export class BoardsResource {
  constructor(private http: HttpClient) {}

  list() {
    return this.http.get<Board[]>('/api/boards')
  }

  create(data: CreateBoardInput) {
    return this.http.post<Board>('/api/boards', data)
  }

  get(id: string) {
    return this.http.get<Board>(`/api/boards/${id}`)
  }

  update(id: string, data: UpdateBoard) {
    return this.http.patch<Board>(`/api/boards/${id}`, data)
  }

  delete(id: string) {
    return this.http.delete<{ ok: boolean }>(`/api/boards/${id}`)
  }

  summary(id: string) {
    return this.http.get<Record<string, unknown>>(`/api/boards/${id}/summary`)
  }

  snapshot(id: string) {
    return this.http.get<Record<string, unknown>>(`/api/boards/${id}/snapshot`)
  }
}
