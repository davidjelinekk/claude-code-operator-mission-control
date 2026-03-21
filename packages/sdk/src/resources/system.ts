import type { HttpClient } from '../http.js'

export class SystemResource {
  constructor(private http: HttpClient) {}

  health() {
    return this.http.get<{
      db: { ok: boolean; latencyMs?: number }
      redis: { ok: boolean; latencyMs?: number }
      agentSdk: { available: boolean; status?: string }
      workers: Record<string, { lastRunAt: string | null; ok: boolean }>
      env: { nodeEnv: string; port: number; operatorTokenPrefix: string }
    }>('/api/system/status')
  }
}
