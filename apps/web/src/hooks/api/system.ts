import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface SystemStatus {
  db: { ok: boolean; latencyMs?: number }
  redis: { ok: boolean; latencyMs?: number }
  gateway: { ok: boolean; connected: boolean }
  workers: Record<string, { lastRunAt: string | null; ok: boolean }>
  env: { nodeEnv: string; port: number; operatorTokenPrefix: string; operatorTokenFull: string }
}

export function useSystemStatus() {
  return useQuery<SystemStatus>({
    queryKey: ['system', 'status'],
    queryFn: () => api.get('api/system/status').json<SystemStatus>(),
    refetchInterval: 30_000,
  })
}
