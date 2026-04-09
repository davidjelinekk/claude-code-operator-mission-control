import type { HttpClient } from '../http.js'
import { parseSSEStream } from '../sse.js'
import { CCOperatorError } from '../types.js'
import type { SpawnParams, SessionSummary, SessionDetail, SSEEvent } from '../types.js'

export class SessionsResource {
  constructor(private http: HttpClient) {}

  spawn(params: SpawnParams) {
    return this.http.post<{ sessionId: string; status: string }>('/api/agent-sdk/spawn', params)
  }

  list() {
    return this.http.get<{ active: SessionSummary[]; historical: Array<Record<string, unknown>> }>('/api/agent-sdk/sessions')
  }

  get(id: string) {
    return this.http.get<SessionDetail>(`/api/agent-sdk/sessions/${id}`)
  }

  abort(id: string) {
    return this.http.post<{ ok: boolean; sessionId: string }>(`/api/agent-sdk/sessions/${id}/abort`)
  }

  async *stream(id: string): AsyncGenerator<SSEEvent> {
    const url = this.http.sseUrl(`/api/agent-sdk/sessions/${id}/stream`)
    const headers: Record<string, string> = { Accept: 'text/event-stream' }
    const token = this.http.getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`

    const res = await fetch(url, { headers })
    if (!res.ok) {
      const body = await res.text()
      throw new CCOperatorError(res.status, `SSE stream failed: ${res.status} ${body}`)
    }

    yield* parseSSEStream(res)
  }

  status() {
    return this.http.get<Record<string, unknown>>('/api/agent-sdk/status')
  }

  providers() {
    return this.http.get<Array<{ provider: string; available: boolean; cliInstalled: boolean; defaultModel: string | null }>>('/api/agent-sdk/providers')
  }

  interrupt(id: string) {
    return this.http.post<{ ok: boolean }>(`/api/agent-sdk/sessions/${id}/interrupt`)
  }

  rename(id: string, title: string) {
    return this.http.post<{ ok: boolean }>(`/api/agent-sdk/sessions/${id}/rename`, { title })
  }

  tag(id: string, tag: string | null) {
    return this.http.post<{ ok: boolean }>(`/api/agent-sdk/sessions/${id}/tag`, { tag })
  }

  fork(id: string, params?: { upToMessageId?: string; title?: string }) {
    return this.http.post<Record<string, unknown>>(`/api/agent-sdk/sessions/${id}/fork`, params ?? {})
  }

  mcpStatus(id: string) {
    return this.http.get<Record<string, unknown>>(`/api/agent-sdk/sessions/${id}/mcp-status`)
  }

  accountInfo(id: string) {
    return this.http.get<Record<string, unknown>>(`/api/agent-sdk/sessions/${id}/account-info`)
  }

  /** SDK 0.2.86+: Live context window usage breakdown (running Claude sessions only) */
  contextUsage(id: string) {
    return this.http.get<{ categories: Array<{ name: string; tokens: number; color?: string; isDeferred?: boolean }>; totalTokens: number }>(
      `/api/agent-sdk/sessions/${id}/context-usage`,
    )
  }

  /** SDK 0.2.89+: List subagent IDs from a Claude session transcript */
  subagents(id: string) {
    return this.http.get<string[]>(`/api/agent-sdk/sessions/${id}/subagents`)
  }

  /** SDK 0.2.89+: Get messages for a specific subagent within a session */
  subagentMessages(id: string, agentId: string, params?: { limit?: number; offset?: number }) {
    const qs = new URLSearchParams()
    if (params?.limit != null) qs.set('limit', String(params.limit))
    if (params?.offset != null) qs.set('offset', String(params.offset))
    const q = qs.toString()
    return this.http.get<Array<Record<string, unknown>>>(
      `/api/agent-sdk/sessions/${id}/subagents/${encodeURIComponent(agentId)}/messages${q ? `?${q}` : ''}`,
    )
  }

  mcpServers(projectDir?: string) {
    const qs = projectDir ? `?projectDir=${encodeURIComponent(projectDir)}` : ''
    return this.http.get<Record<string, unknown>>(`/api/agent-sdk/mcp-servers${qs}`)
  }

  setModel(id: string, model?: string) {
    return this.http.post<{ ok: boolean }>(`/api/agent-sdk/sessions/${id}/set-model`, { model })
  }

  setPermissionMode(id: string, mode: string) {
    return this.http.post<{ ok: boolean }>(`/api/agent-sdk/sessions/${id}/set-permission-mode`, { mode })
  }

  applySettings(id: string, settings: Record<string, unknown>) {
    return this.http.post<{ ok: boolean }>(`/api/agent-sdk/sessions/${id}/apply-settings`, { settings })
  }

  stopTask(id: string, taskId: string) {
    return this.http.post<{ ok: boolean }>(`/api/agent-sdk/sessions/${id}/stop-task`, { taskId })
  }

  setMcpServers(id: string, servers: Record<string, unknown>) {
    return this.http.post<Record<string, unknown>>(`/api/agent-sdk/sessions/${id}/set-mcp-servers`, { servers })
  }

  rewindFiles(id: string, userMessageId: string, dryRun?: boolean) {
    return this.http.post<{ canRewind: boolean; error?: string; filesChanged?: string[]; insertions?: number; deletions?: number }>(`/api/agent-sdk/sessions/${id}/rewind-files`, { userMessageId, dryRun })
  }

  agents(id: string) {
    return this.http.get<Array<{ name: string; description: string; model?: string }>>(`/api/agent-sdk/sessions/${id}/agents`)
  }

  commands(id: string) {
    return this.http.get<Array<{ name: string; description: string }>>(`/api/agent-sdk/sessions/${id}/commands`)
  }

  /** List historical sessions from the file-based session parser */
  historical(params?: { limit?: number; offset?: number; dir?: string }) {
    const qs = new URLSearchParams()
    if (params?.limit != null) qs.set('limit', String(params.limit))
    if (params?.offset != null) qs.set('offset', String(params.offset))
    if (params?.dir) qs.set('dir', params.dir)
    const q = qs.toString()
    return this.http.get<Array<Record<string, unknown>>>(`/api/sessions${q ? `?${q}` : ''}`)
  }
}
