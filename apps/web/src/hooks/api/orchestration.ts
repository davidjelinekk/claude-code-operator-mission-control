import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useAuthStore } from '@/store/auth'

export interface OrchestrationStatus {
  available: boolean
  cliInstalled: boolean
  apiKeyConfigured: boolean
  model: string | null
  activeSessions: number
}

export interface SessionInfo {
  sessionId: string
  projectName?: string
  summary?: string
  sizeBytes?: number
  modifiedAt?: string
  lastModified?: number
  customTitle?: string
  firstPrompt?: string
  gitBranch?: string
  cwd?: string
}

export interface ActiveSession {
  sessionId: string
  status: 'running' | 'completed' | 'error' | 'aborted'
  createdAt: string
  completedAt: string | null
  meta: { boardId?: string; taskId?: string; callerContext?: string }
  messageCount: number
}

export interface SessionsResponse {
  active: ActiveSession[]
  historical: SessionInfo[]
}

export interface SpawnParams {
  prompt: string
  model?: string
  maxTurns?: number
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk'
  tools?: string[]
  disallowedTools?: string[]
  cwd?: string
  systemPrompt?: string | { type: 'preset'; preset: 'claude_code'; append?: string }
  agent?: string
  agents?: Record<string, { description: string; prompt: string; tools?: string[]; model?: string }>
  maxBudgetUsd?: number
  persistSession?: boolean
  includePartialMessages?: boolean
  agentProgressSummaries?: boolean
  effort?: 'low' | 'medium' | 'high' | 'max'
  promptSuggestions?: boolean
  scripts?: string[]
  sandbox?: boolean | { enabled: boolean; autoAllowBashIfSandboxed?: boolean }
  settings?: Record<string, unknown>
  betas?: string[]
  allowedTools?: string[]
  thinking?: { type: 'adaptive' } | { type: 'enabled'; budgetTokens: number } | { type: 'disabled' }
  resumeSessionAt?: string
  forkSession?: boolean
  debug?: boolean
  debugFile?: string
  plugins?: Array<{ type: 'local'; path: string }>
  resume?: string
  boardId?: string
  taskId?: string
}

export interface SpawnResult {
  sessionId: string
  status: string
}

export function useOrchestrationStatus() {
  return useQuery<OrchestrationStatus>({
    queryKey: ['orchestration', 'status'],
    queryFn: () => api.get('api/agent-sdk/status').json<OrchestrationStatus>(),
    refetchInterval: 10_000,
  })
}

export function useOrchestrationSessions() {
  return useQuery<SessionsResponse>({
    queryKey: ['orchestration', 'sessions'],
    queryFn: () => api.get('api/agent-sdk/sessions').json<SessionsResponse>(),
    refetchInterval: 5_000,
  })
}

export function useSpawnSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: SpawnParams) =>
      api.post('api/agent-sdk/spawn', { json: params }).json<SpawnResult>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orchestration', 'sessions'] })
      queryClient.invalidateQueries({ queryKey: ['orchestration', 'status'] })
    },
  })
}

export function useAbortSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) =>
      api.post(`api/agent-sdk/sessions/${sessionId}/abort`).json<{ ok: boolean }>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orchestration', 'sessions'] })
      queryClient.invalidateQueries({ queryKey: ['orchestration', 'status'] })
    },
  })
}

export function useSetSessionModel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, model }: { sessionId: string; model?: string }) =>
      api.post(`api/agent-sdk/sessions/${sessionId}/set-model`, { json: { model } }).json<{ ok: boolean }>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orchestration', 'sessions'] })
    },
  })
}

export function useSetSessionPermissionMode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, mode }: { sessionId: string; mode: string }) =>
      api.post(`api/agent-sdk/sessions/${sessionId}/set-permission-mode`, { json: { mode } }).json<{ ok: boolean }>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orchestration', 'sessions'] })
    },
  })
}

export function useApplySessionSettings() {
  return useMutation({
    mutationFn: ({ sessionId, settings }: { sessionId: string; settings: Record<string, unknown> }) =>
      api.post(`api/agent-sdk/sessions/${sessionId}/apply-settings`, { json: { settings } }).json<{ ok: boolean }>(),
  })
}

export function useStopSessionTask() {
  return useMutation({
    mutationFn: ({ sessionId, taskId }: { sessionId: string; taskId: string }) =>
      api.post(`api/agent-sdk/sessions/${sessionId}/stop-task`, { json: { taskId } }).json<{ ok: boolean }>(),
  })
}

export function useSetSessionMcpServers() {
  return useMutation({
    mutationFn: ({ sessionId, servers }: { sessionId: string; servers: Record<string, unknown> }) =>
      api.post(`api/agent-sdk/sessions/${sessionId}/set-mcp-servers`, { json: { servers } }).json(),
  })
}

export function useRewindSessionFiles() {
  return useMutation({
    mutationFn: ({ sessionId, userMessageId, dryRun }: { sessionId: string; userMessageId: string; dryRun?: boolean }) =>
      api.post(`api/agent-sdk/sessions/${sessionId}/rewind-files`, { json: { userMessageId, dryRun } }).json<{ canRewind: boolean; error?: string; filesChanged?: string[] }>(),
  })
}

export interface StreamEvent {
  type: string
  session_id?: string
  uuid?: string
  content?: string
  subtype?: string
  is_error?: boolean
  total_cost_usd?: number
  num_turns?: number
  result?: string
  errors?: string[]
  status?: string
}

export function useSessionStream(sessionId: string | null) {
  const [events, setEvents] = useState<StreamEvent[]>([])
  const [connected, setConnected] = useState(false)
  const [done, setDone] = useState(false)
  const sourceRef = useRef<EventSource | null>(null)

  const close = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close()
      sourceRef.current = null
      setConnected(false)
    }
  }, [])

  useEffect(() => {
    if (!sessionId) return
    setEvents([])
    setDone(false)

    const token = useAuthStore.getState().token ?? ''
    const apiBase = import.meta.env.VITE_API_URL || window.location.origin
    const url = `${apiBase}/api/agent-sdk/sessions/${sessionId}/stream?token=${encodeURIComponent(token)}`
    const es = new EventSource(url)
    sourceRef.current = es

    es.onopen = () => setConnected(true)

    es.addEventListener('message', (e) => {
      try {
        const data = JSON.parse(e.data) as StreamEvent
        setEvents((prev) => [...prev, data])
      } catch {
        /* skip malformed */
      }
    })

    es.addEventListener('done', (e) => {
      try {
        const data = JSON.parse(e.data) as StreamEvent
        setEvents((prev) => [...prev, { ...data, type: 'done' }])
      } catch {
        /* skip */
      }
      setDone(true)
      es.close()
      setConnected(false)
    })

    es.onerror = () => {
      setConnected(false)
    }

    return () => {
      es.close()
      sourceRef.current = null
    }
  }, [sessionId])

  return { events, connected, done, close }
}

export function useMcpServers(projectDir?: string) {
  const params = projectDir ? `?projectDir=${encodeURIComponent(projectDir)}` : ''
  return useQuery<Record<string, unknown>>({
    queryKey: ['orchestration', 'mcp-servers', projectDir],
    queryFn: () => api.get(`api/agent-sdk/mcp-servers${params}`).json(),
    staleTime: 60_000,
  })
}
