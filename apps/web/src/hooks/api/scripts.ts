import { useQuery, useMutation } from '@tanstack/react-query'
import { api, queryClient } from '@/lib/api'

export interface ScriptDefinition {
  id: string
  name: string
  description: string | null
  entrypoint: string
  interpreter: string | null
  inputMode: 'args' | 'stdin' | 'env'
  outputMode: 'stdout' | 'json'
  timeout: number
  requiredEnv: string[]
  argsSchema: Record<string, unknown> | null
  tags: string[]
  filePath: string
  executablePath: string
  agents: string[]
}

export interface ScriptTestResult {
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
}

export function useScripts() {
  return useQuery<ScriptDefinition[]>({
    queryKey: ['scripts'],
    queryFn: () => api.get('api/scripts').json<ScriptDefinition[]>(),
  })
}

export function useScript(id: string | null) {
  return useQuery<ScriptDefinition>({
    queryKey: ['scripts', id],
    queryFn: () => api.get(`api/scripts/${id}`).json<ScriptDefinition>(),
    enabled: !!id,
  })
}

export function useCreateScript() {
  return useMutation({
    mutationFn: (params: {
      id: string
      name: string
      description?: string
      interpreter?: string
      entrypoint?: string
    }) => api.post('api/scripts', { json: params }).json<{ ok: boolean; id: string }>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scripts'] })
    },
  })
}

export function useDeleteScript() {
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`api/scripts/${id}`).json<{ ok: boolean }>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scripts'] })
    },
  })
}

export function useTestScript() {
  return useMutation({
    mutationFn: ({ id, args }: { id: string; args: Record<string, unknown> }) =>
      api.post(`api/scripts/${id}/test`, { json: { args } }).json<ScriptTestResult>(),
  })
}

export function useRefreshScripts() {
  return useMutation({
    mutationFn: () => api.post('api/scripts/refresh').json<{ ok: boolean }>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scripts'] })
    },
  })
}
