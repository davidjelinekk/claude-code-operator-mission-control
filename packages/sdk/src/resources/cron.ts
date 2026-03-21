import type { HttpClient } from '../http.js'

interface CronJob {
  id: string
  name: string
  schedule: string
  agentId: string
  command: string
  enabled: boolean
  lastRunAt?: string | null
  createdAt: string
  status?: string
}

interface CreateCronJobInput {
  name: string
  schedule: string
  agentId: string
  command: string
}

export class CronResource {
  constructor(private http: HttpClient) {}

  list() {
    return this.http.get<CronJob[]>('/api/cron')
  }

  create(data: CreateCronJobInput) {
    return this.http.post<CronJob>('/api/cron', data)
  }

  delete(id: string) {
    return this.http.delete<{ ok: boolean }>(`/api/cron/${id}`)
  }

  run(id: string) {
    return this.http.post<{ ok: boolean; job: CronJob }>(`/api/cron/${id}/run`)
  }

  runs(id: string) {
    return this.http.get<Array<Record<string, unknown>>>(`/api/cron/${id}/runs`)
  }
}
