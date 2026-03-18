import { useQuery, useMutation } from '@tanstack/react-query'
import { api, queryClient } from '@/lib/api'

export interface SkillPack {
  id: string
  name: string
  slug?: string
  description?: string
  version?: string
  skills: string[]
  mcpServers?: Record<string, unknown>
  installStatus?: 'installed' | 'not_installed' | 'installing'
}

export function useSkillPacks() {
  return useQuery<SkillPack[]>({
    queryKey: ['skill-packs'],
    queryFn: async () => {
      const result = await api.get('api/skill-packs').json<SkillPack[] | { packs: SkillPack[] }>()
      if (Array.isArray(result)) return result
      if ('packs' in result) return result.packs
      return []
    },
  })
}

export function useCreateSkillPack() {
  return useMutation({
    mutationFn: (data: {
      name: string
      description?: string
      skills: string[]
      mcpServers?: Record<string, unknown>
    }) => api.post('api/skill-packs', { json: data }).json<SkillPack>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skill-packs'] })
    },
  })
}

export function useInstallSkillPack() {
  return useMutation({
    mutationFn: (id: string) =>
      api.post(`api/skill-packs/${id}/install`).json<{ status: string }>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skill-packs'] })
    },
  })
}

export function useDeleteSkillPack() {
  return useMutation({
    mutationFn: (id: string) => api.delete(`api/skill-packs/${id}`).json<void>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skill-packs'] })
    },
  })
}
