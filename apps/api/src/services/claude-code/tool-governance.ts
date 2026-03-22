import type { CanUseTool, Options } from '@anthropic-ai/claude-agent-sdk'
import { db } from '../../db/client.js'
import { boards, approvals, activityEvents } from '../../db/schema.js'
import { eq } from 'drizzle-orm'
import pino from 'pino'

const log = pino({ name: 'tool-governance' })

// High-risk patterns that should be flagged for approval
const HIGH_RISK_PATTERNS = [
  { tool: 'Bash', pattern: /\b(rm\s+-rf|rm\s+-r|rmdir|mkfs|dd\s+if|>\s*\/dev\/)/i },
  { tool: 'Bash', pattern: /\b(curl|wget).*\|\s*(bash|sh|zsh)/i },
  { tool: 'Bash', pattern: /\bgit\s+(push\s+--force|reset\s+--hard|clean\s+-f)/i },
  { tool: 'Write', pattern: /\.(env|pem|key|cert|credentials)$/i },
]

function summarizeInput(input: Record<string, unknown>): string {
  const str = JSON.stringify(input)
  return str.length > 500 ? str.slice(0, 500) + '...' : str
}

/**
 * Creates a CanUseTool handler that enforces board governance policies.
 * Blocks high-risk operations and creates approval records for review.
 * NOTE: canUseTool is NOT called for tools in the `allowedTools` list.
 * Use createToolLoggingHooks() for universal tool logging.
 */
export function createToolGovernanceHandler(boardId: string, agentId?: string): CanUseTool {
  const handler: CanUseTool = async (toolName, input, _options) => {
    // Log tool use (also logged by hooks, but this catches non-allowed tools)
    db.insert(activityEvents).values({
      boardId,
      agentId: agentId ?? null,
      eventType: 'tool.used',
      message: `Tool: ${toolName}`,
      metadata: { toolName, inputSummary: summarizeInput(input) },
    }).catch((err) => log.warn({ err }, 'failed to log tool use'))

    // Check board governance settings
    let board
    try {
      const [b] = await db.select().from(boards).where(eq(boards.id, boardId))
      board = b
    } catch {
      return { behavior: 'allow' as const }
    }

    if (!board) return { behavior: 'allow' as const }

    // Check for high-risk patterns when board has approval requirements
    if (board.requireApprovalForDone || board.blockStatusChangesWithPendingApproval) {
      const inputStr = JSON.stringify(input)
      for (const { tool, pattern } of HIGH_RISK_PATTERNS) {
        if (toolName === tool && pattern.test(inputStr)) {
          try {
            await db.insert(approvals).values({
              boardId,
              agentId: agentId ?? 'unknown',
              actionType: 'tool.high_risk',
              payload: { toolName, input: summarizeInput(input) },
              confidence: 'low',
              status: 'pending',
            })
          } catch (err) {
            log.warn({ err }, 'failed to create tool approval')
          }

          log.info({ toolName, boardId, agentId }, 'high-risk tool use blocked, approval created')
          return {
            behavior: 'deny' as const,
            message: `High-risk operation blocked by board governance policy. An approval has been created for review. Tool: ${toolName}`,
          }
        }
      }
    }

    return { behavior: 'allow' as const }
  }

  return handler
}

/**
 * Creates PostToolUse hooks that log ALL tool executions (including allowedTools).
 * This fires for every tool call regardless of permission mode.
 */
export function createToolLoggingHooks(boardId: string, agentId?: string): Options['hooks'] {
  return {
    PostToolUse: [{
      hooks: [async (input) => {
        const toolName = (input as Record<string, unknown>).tool_name as string ?? 'unknown'
        const toolInput = (input as Record<string, unknown>).tool_input as Record<string, unknown> ?? {}

        db.insert(activityEvents).values({
          boardId,
          agentId: agentId ?? null,
          eventType: 'tool.used',
          message: `Tool: ${toolName}`,
          metadata: { toolName, inputSummary: summarizeInput(toolInput) },
        }).catch((err) => log.warn({ err }, 'failed to log tool use via hook'))

        return {}
      }],
    }],
  }
}
