import type { Provider, NormalizedMessage, ProviderStatus } from '@claude-code-operator/shared-types'

export interface ProviderSession {
  /** Async iterator yielding normalized messages */
  messages: AsyncGenerator<NormalizedMessage, void>
  /** Abort the running session (forceful) */
  abort(): void
  /** Graceful close */
  close(): void
  /** Provider-specific handle (Claude SDK query object; null for child_process providers) */
  queryHandle: unknown | null
}

export interface ProviderSpawnParams {
  prompt: string
  model?: string
  maxTurns?: number
  cwd?: string
  systemPrompt?: string | { type: 'preset'; preset: string; append?: string }
  env?: Record<string, string | undefined>
  sandbox?: boolean | { enabled: boolean; failIfUnavailable?: boolean; autoAllowBashIfSandboxed?: boolean; network?: { allowLocalBinding?: boolean; allowUnixSockets?: string[] } }
  abortController: AbortController
  /** Full original SpawnParams — providers can read provider-specific fields */
  raw: Record<string, unknown>
}

export interface SessionProvider {
  readonly name: Provider
  /** Check if the CLI/SDK is available on this machine */
  checkAvailable(): boolean
  /** Spawn a session, returning a normalized message stream */
  spawn(params: ProviderSpawnParams): Promise<ProviderSession>
  /** Provider availability status */
  getStatus(): ProviderStatus
}
