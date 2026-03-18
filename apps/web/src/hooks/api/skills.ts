import { useQuery, useMutation } from '@tanstack/react-query'
import { api, queryClient } from '@/lib/api'

export interface SkillSnapshot {
  skillId: string
  displayName: string
  description?: string
  skillType: 'skill' | 'mcp_server'
  isInstalled: boolean
  configJson?: Record<string, unknown>
  requiredEnv?: string[]
  dependencies?: string[]
  scannedAt: string
  agents?: string[]
}

export function useSkills() {
  return useQuery<SkillSnapshot[]>({
    queryKey: ['skills'],
    queryFn: () => api.get('api/skills').json<SkillSnapshot[]>(),
  })
}

export function useRefreshSkills() {
  return useMutation({
    mutationFn: () => api.post('api/skills/refresh').json<{ ok: true }>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] })
    },
  })
}
