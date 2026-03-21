import type { HttpClient } from '../http.js'
import type { AnalyticsQuery, TimeseriesQuery } from '../types.js'

export class AnalyticsResource {
  constructor(private http: HttpClient) {}

  private qs(params?: AnalyticsQuery): string {
    if (!params) return ''
    const qs = new URLSearchParams()
    if (params.from) qs.set('from', params.from)
    if (params.to) qs.set('to', params.to)
    const q = qs.toString()
    return q ? `?${q}` : ''
  }

  summary(params?: AnalyticsQuery) {
    return this.http.get<Record<string, unknown>>(`/api/analytics/summary${this.qs(params)}`)
  }

  byAgent(params?: AnalyticsQuery) {
    return this.http.get<Array<Record<string, unknown>>>(`/api/analytics/by-agent${this.qs(params)}`)
  }

  byModel(params?: AnalyticsQuery) {
    return this.http.get<Array<Record<string, unknown>>>(`/api/analytics/by-model${this.qs(params)}`)
  }

  timeseries(params?: TimeseriesQuery) {
    const qs = new URLSearchParams()
    if (params?.from) qs.set('from', params.from)
    if (params?.to) qs.set('to', params.to)
    if (params?.bucket) qs.set('bucket', params.bucket)
    const q = qs.toString()
    return this.http.get<Array<Record<string, unknown>>>(`/api/analytics/timeseries${q ? `?${q}` : ''}`)
  }

  byProject(params?: AnalyticsQuery) {
    return this.http.get<Array<Record<string, unknown>>>(`/api/analytics/by-project${this.qs(params)}`)
  }

  taskVelocity(params?: { start?: string; end?: string; boardId?: string }) {
    const qs = new URLSearchParams()
    if (params?.start) qs.set('start', params.start)
    if (params?.end) qs.set('end', params.end)
    if (params?.boardId) qs.set('boardId', params.boardId)
    const q = qs.toString()
    return this.http.get<Array<{ date: string; count: number }>>(`/api/analytics/task-velocity${q ? `?${q}` : ''}`)
  }

  taskOutcomes(params?: { start?: string; end?: string; boardId?: string }) {
    const qs = new URLSearchParams()
    if (params?.start) qs.set('start', params.start)
    if (params?.end) qs.set('end', params.end)
    if (params?.boardId) qs.set('boardId', params.boardId)
    const q = qs.toString()
    return this.http.get<Array<{ outcome: string; count: number }>>(`/api/analytics/task-outcomes${q ? `?${q}` : ''}`)
  }
}
