import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface OrchestrationStatus {
  available: boolean
  apiKeyConfigured: boolean
  model: string | null
}

export interface SessionInfo {
  sessionId: string
  projectName: string
  sizeBytes: number
  modifiedAt: string
}

export function useOrchestrationStatus() {
  return useQuery<OrchestrationStatus>({
    queryKey: ['orchestration', 'status'],
    queryFn: () => api.get('api/agent-sdk/status').json<OrchestrationStatus>(),
    refetchInterval: 10_000,
  })
}

export function useOrchestrationSessions() {
  return useQuery<SessionInfo[]>({
    queryKey: ['orchestration', 'sessions'],
    queryFn: () => api.get('api/agent-sdk/sessions').json<SessionInfo[]>(),
    refetchInterval: 10_000,
  })
}
