import type { HttpClient } from '../http.js'

interface Person {
  id: string
  name: string
  email: string | null
  phone: string | null
  source: string | null
  role: string | null
  relationship: string | null
  priorities: string[]
  context: string | null
  channelHandles: Record<string, string>
  externalId: string | null
  avatarUrl: string | null
  notes: string | null
  tags: string[]
  createdAt: string
  updatedAt: string
  threadCount?: number
  lastActiveAt?: string | null
}

interface CreatePersonInput {
  name: string
  email?: string
  phone?: string
  source?: 'telegram' | 'teams' | 'email' | 'manual' | 'form'
  role?: string
  relationship?: string
  priorities?: string[]
  context?: string
  channelHandles?: Record<string, string>
  externalId?: string
  avatarUrl?: string
  notes?: string
  tags?: string[]
}

type UpdatePersonInput = Partial<CreatePersonInput>

interface PersonThread {
  id: string
  personId: string
  agentId: string
  channel: string
  threadId: string | null
  summary: string | null
  lastMessageAt: string | null
  createdAt: string
}

interface CreateThreadInput {
  agentId: string
  channel: 'telegram' | 'teams' | 'email' | 'other'
  threadId?: string
  summary?: string
  lastMessageAt?: string
}

interface UpdateThreadInput {
  summary?: string
  lastMessageAt?: string
}

interface PersonDetail {
  person: Person
  threads: PersonThread[]
  tasks: Array<Record<string, unknown>>
  projects: Array<Record<string, unknown>>
}

export class PeopleResource {
  constructor(private http: HttpClient) {}

  list() {
    return this.http.get<Person[]>('/api/people')
  }

  create(data: CreatePersonInput) {
    return this.http.post<Person>('/api/people', data)
  }

  get(id: string) {
    return this.http.get<PersonDetail>(`/api/people/${id}`)
  }

  update(id: string, data: UpdatePersonInput) {
    return this.http.patch<Person>(`/api/people/${id}`, data)
  }

  delete(id: string) {
    return this.http.delete<{ ok: boolean }>(`/api/people/${id}`)
  }

  addThread(id: string, data: CreateThreadInput) {
    return this.http.post<PersonThread>(`/api/people/${id}/threads`, data)
  }

  updateThread(id: string, threadId: string, data: UpdateThreadInput) {
    return this.http.patch<PersonThread>(`/api/people/${id}/threads/${threadId}`, data)
  }

  deleteThread(id: string, threadId: string) {
    return this.http.delete<{ ok: boolean }>(`/api/people/${id}/threads/${threadId}`)
  }

  listTasks(id: string) {
    return this.http.get<Array<Record<string, unknown>>>(`/api/people/${id}/tasks`)
  }

  linkTask(id: string, taskId: string) {
    return this.http.post<{ ok: boolean }>(`/api/people/${id}/tasks`, { taskId })
  }

  unlinkTask(id: string, taskId: string) {
    return this.http.delete<{ ok: boolean }>(`/api/people/${id}/tasks/${taskId}`)
  }

  linkProject(id: string, projectId: string) {
    return this.http.post<{ ok: boolean }>(`/api/people/${id}/projects`, { projectId })
  }

  unlinkProject(id: string, projectId: string) {
    return this.http.delete<{ ok: boolean }>(`/api/people/${id}/projects/${projectId}`)
  }
}
