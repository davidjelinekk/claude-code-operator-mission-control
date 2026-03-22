import type { CanUseTool } from '@anthropic-ai/claude-agent-sdk'
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
 *
 * - Logs all tool executions as activity events
 * - For high-risk tools (destructive Bash commands, writes to sensitive paths),
 *   checks if the board requires approval and blocks with a pending approval record
 */
export function createToolGovernanceHandler(boardId: string, agentId?: string): CanUseTool {
  const handler: CanUseTool = async (toolName, input, _options) => {
    // Log all tool usage as activity events (non-blocking)
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
      // If we can't read the board, allow by default
      return { behavior: 'allow' as const }
    }

    if (!board) return { behavior: 'allow' as const }

    // Check for high-risk patterns when board has approval requirements
    if (board.requireApprovalForDone || board.blockStatusChangesWithPendingApproval) {
      const inputStr = JSON.stringify(input)
      for (const { tool, pattern } of HIGH_RISK_PATTERNS) {
        if (toolName === tool && pattern.test(inputStr)) {
          // Create a pending approval
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
