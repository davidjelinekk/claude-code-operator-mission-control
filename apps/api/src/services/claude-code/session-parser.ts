import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { createReadStream } from 'node:fs'
import { config } from '../../config.js'

export interface SessionInfo {
  projectPath: string
  projectName: string
  sessionId: string
  filePath: string
  sizeBytes: number
  modifiedAt: Date
}

export interface TokenUsage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export interface SessionMessage {
  role: string
  model?: string
  usage?: TokenUsage
  timestamp?: string
  toolCalls?: string[]
}

function decodeProjectPath(encodedName: string): string {
  return encodedName.replace(/-/g, '/')
}

export function listSessions(): SessionInfo[] {
  const projectsDir = join(config.CLAUDE_HOME, 'projects')
  if (!existsSync(projectsDir)) return []

  const sessions: SessionInfo[] = []
  let projectDirs: string[]
  try {
    projectDirs = readdirSync(projectsDir)
  } catch {
    return []
  }

  for (const projDir of projectDirs) {
    const projPath = join(projectsDir, projDir)
    let files: string[]
    try {
      files = readdirSync(projPath).filter((f) => f.endsWith('.jsonl'))
    } catch {
      continue
    }

    const projectName = decodeProjectPath(projDir)

    for (const file of files) {
      const filePath = join(projPath, file)
      try {
        const stat = statSync(filePath)
        sessions.push({
          projectPath: projDir,
          projectName,
          sessionId: file.replace('.jsonl', ''),
          filePath,
          sizeBytes: stat.size,
          modifiedAt: stat.mtime,
        })
      } catch {
        // skip
      }
    }
  }

  return sessions.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime())
}

export async function parseSessionMessages(filePath: string, startOffset = 0): Promise<{ messages: SessionMessage[]; endOffset: number }> {
  const messages: SessionMessage[] = []
  const stat = statSync(filePath)
  if (stat.size <= startOffset) return { messages, endOffset: startOffset }

  const stream = createReadStream(filePath, { start: startOffset, encoding: 'utf-8' })
  const rl = createInterface({ input: stream, crlfDelay: Infinity })

  for await (const line of rl) {
    if (!line.trim()) continue
    try {
      const record = JSON.parse(line)
      if (record.type === 'message' && record.message) {
        const msg = record.message
        const sessionMsg: SessionMessage = {
          role: msg.role ?? 'unknown',
          model: msg.model,
          timestamp: record.timestamp,
        }
        if (msg.usage) {
          sessionMsg.usage = {
            input: msg.usage.input ?? 0,
            output: msg.usage.output ?? 0,
            cacheRead: msg.usage.cacheRead ?? 0,
            cacheWrite: msg.usage.cacheWrite ?? 0,
          }
        }
        // Detect tool calls (Agent tool = subagent spawning)
        if (Array.isArray(msg.content)) {
          const toolCalls: string[] = []
          for (const block of msg.content) {
            if (block.type === 'tool_use') {
              toolCalls.push(block.name ?? 'unknown')
            }
          }
          if (toolCalls.length > 0) sessionMsg.toolCalls = toolCalls
        }
        messages.push(sessionMsg)
      }
    } catch {
      // skip malformed lines
    }
  }

  return { messages, endOffset: stat.size }
}
