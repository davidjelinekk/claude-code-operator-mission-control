import { useQuery, useMutation } from '@tanstack/react-query'
import { useMemo } from 'react'
import { api, queryClient } from '@/lib/api'

export interface Agent {
  id: string
  name: string
  description?: string | null
  model?: string | null
  tools?: string[]
  maxTurns?: number | null
  permissionMode?: string | null
  status: 'available' | 'running' | 'offline' | 'error'
}

export function useAgents() {
  return useQuery<Agent[]>({
    queryKey: ['agents'],
    queryFn: () => api.get('api/agents').json<Agent[]>(),
    refetchInterval: 15_000,
  })
}

export function useCreateAgent() {
  return useMutation({
    mutationFn: (data: { name: string; description?: string; model?: string; tools?: string[]; maxTurns?: number; permissionMode?: string; prompt?: string }) =>
      api.post('api/agents', { json: data }).json<Agent>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  })
}

/** Maps agent IDs to display names. Falls back to the ID itself if unknown. */
export function useAgentNameMap() {
  const { data: agents } = useAgents()
  return useMemo(() => {
    const map = new Map<string, string>()
    for (const a of agents ?? []) {
      map.set(a.id, a.name)
    }
    return (id: string) => map.get(id) ?? id
  }, [agents])
}

export function useDeleteAgent() {
  return useMutation({
    mutationFn: (agentId: string) => api.delete(`api/agents/${agentId}`).json<{ ok: boolean }>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  })
}
