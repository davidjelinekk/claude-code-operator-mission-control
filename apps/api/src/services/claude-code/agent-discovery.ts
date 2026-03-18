import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { config } from '../../config.js'

export interface AgentDefinition {
  id: string
  name: string
  description: string | null
  model: string | null
  tools: string[]
  maxTurns: number | null
  permissionMode: string | null
  promptContent: string
  filePath: string
}

function parseYamlFrontmatter(content: string): { meta: Record<string, unknown>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return { meta: {}, body: content }
  const meta: Record<string, unknown> = {}
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    let value: unknown = line.slice(idx + 1).trim()
    if (value === 'true') value = true
    else if (value === 'false') value = false
    else if (value === 'null') value = null
    else if (typeof value === 'string' && /^\d+$/.test(value)) value = parseInt(value, 10)
    // Handle YAML arrays (simple single-line format)
    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map((s: string) => s.trim().replace(/^['"]|['"]$/g, ''))
    }
    meta[key] = value
  }
  return { meta, body: match[2] }
}

export function discoverAgents(): AgentDefinition[] {
  const agentsDir = join(config.CLAUDE_HOME, 'agents')
  if (!existsSync(agentsDir)) return []

  const agents: AgentDefinition[] = []
  let files: string[]
  try {
    files = readdirSync(agentsDir).filter((f) => f.endsWith('.md'))
  } catch {
    return []
  }

  for (const file of files) {
    const filePath = join(agentsDir, file)
    try {
      const content = readFileSync(filePath, 'utf-8')
      const { meta, body } = parseYamlFrontmatter(content)
      const id = file.replace(/\.md$/, '')
      agents.push({
        id,
        name: (meta.name as string) ?? id,
        description: (meta.description as string) ?? null,
        model: (meta.model as string) ?? null,
        tools: Array.isArray(meta.tools) ? meta.tools as string[] : [],
        maxTurns: typeof meta.maxTurns === 'number' ? meta.maxTurns : null,
        permissionMode: (meta.permissionMode as string) ?? null,
        promptContent: body.trim(),
        filePath,
      })
    } catch {
      // skip unreadable files
    }
  }
  return agents
}

export function getAgent(id: string): AgentDefinition | null {
  const filePath = join(config.CLAUDE_HOME, 'agents', `${id}.md`)
  if (!existsSync(filePath)) return null
  try {
    const content = readFileSync(filePath, 'utf-8')
    const { meta, body } = parseYamlFrontmatter(content)
    return {
      id,
      name: (meta.name as string) ?? id,
      description: (meta.description as string) ?? null,
      model: (meta.model as string) ?? null,
      tools: Array.isArray(meta.tools) ? meta.tools as string[] : [],
      maxTurns: typeof meta.maxTurns === 'number' ? meta.maxTurns : null,
      permissionMode: (meta.permissionMode as string) ?? null,
      promptContent: body.trim(),
      filePath,
    }
  } catch {
    return null
  }
}
