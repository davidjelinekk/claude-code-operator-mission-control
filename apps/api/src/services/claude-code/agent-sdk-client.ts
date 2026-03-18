import { config } from '../../config.js'

export interface AgentSdkStatus {
  available: boolean
  apiKeyConfigured: boolean
  model: string | null
}

export function getAgentSdkStatus(): AgentSdkStatus {
  const apiKeyConfigured = !!config.ANTHROPIC_API_KEY
  return {
    available: apiKeyConfigured,
    apiKeyConfigured,
    model: apiKeyConfigured ? 'claude-sonnet-4-6' : null,
  }
}

export async function spawnAgentSession(params: {
  prompt: string
  model?: string
  maxTurns?: number
  permissionMode?: string
}): Promise<{ sessionId: string; status: string }> {
  if (!config.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured — orchestration mode unavailable')
  }

  // Placeholder: Agent SDK integration will be implemented
  // when @anthropic-ai/claude-agent-sdk is available
  return {
    sessionId: crypto.randomUUID(),
    status: 'pending',
  }
}
