import { readdirSync, readFileSync, existsSync, lstatSync } from 'node:fs'
import { join } from 'node:path'
import { db } from '../db/client.js'
import { skillSnapshots } from '../db/schema.js'
import { config } from '../config.js'

interface SkillEntry {
  skillId: string
  displayName: string
  description: string | null
  skillType: string
  isInstalled: boolean
  configJson: unknown
  requiredEnv: string[]
  dependencies: string[]
}

function parseSkillFrontmatter(content: string): { name: string; description: string | null } {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) {
    // Fallback: parse headings
    const lines = content.split('\n')
    const h1 = lines.find((l) => l.startsWith('# '))
    const name = h1 ? h1.slice(2).trim() : 'Unknown Skill'
    const descLines = lines.slice(1).filter((l) => l.trim() && !l.startsWith('#')).slice(0, 3)
    return { name, description: descLines.join(' ').trim() || null }
  }
  const meta: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return {
    name: meta['name'] ?? 'Unknown Skill',
    description: meta['description'] ?? null,
  }
}

async function runRefresh(): Promise<void> {
  const skillsDir = join(config.CLAUDE_HOME, 'skills')
  const entries: SkillEntry[] = []

  // Scan skills directory
  if (existsSync(skillsDir)) {
    let skillDirs: string[] = []
    try {
      skillDirs = readdirSync(skillsDir).filter((d) => {
        try { return lstatSync(join(skillsDir, d)).isDirectory() } catch { return false }
      })
    } catch (e) {
      console.error('[skills] failed to read skills dir:', e)
    }

    for (const skillId of skillDirs) {
      const skillDir = join(skillsDir, skillId)
      let displayName = skillId
      let description: string | null = null
      let requiredEnv: string[] = []

      const skillMdPath = join(skillDir, 'SKILL.md')
      if (existsSync(skillMdPath)) {
        const content = readFileSync(skillMdPath, 'utf-8')
        const parsed = parseSkillFrontmatter(content)
        displayName = parsed.name
        description = parsed.description

        const envMatches = content.match(/`([A-Z_]+_[A-Z_]+)`/g) ?? []
        requiredEnv = [...new Set(envMatches.map((m) => m.replace(/`/g, '')))]
      }

      entries.push({
        skillId,
        displayName,
        description,
        skillType: 'skill',
        isInstalled: true,
        configJson: null,
        requiredEnv,
        dependencies: [],
      })
    }
  }

  // Read MCP servers from settings.json
  try {
    const settingsPath = join(config.CLAUDE_HOME, 'settings.json')
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      const mcpServers = settings?.mcpServers ?? {}
      for (const [serverId, serverConfig] of Object.entries(mcpServers)) {
        entries.push({
          skillId: `mcp:${serverId}`,
          displayName: serverId,
          description: `MCP Server: ${serverId}`,
          skillType: 'mcp_server',
          isInstalled: true,
          configJson: serverConfig,
          requiredEnv: [],
          dependencies: [],
        })
      }
    }
  } catch (e) {
    console.error('[skills] failed to read settings.json MCP servers:', e)
  }

  for (const entry of entries) {
    await db.insert(skillSnapshots).values({
      skillId: entry.skillId,
      displayName: entry.displayName,
      description: entry.description,
      skillType: entry.skillType,
      isInstalled: entry.isInstalled,
      configJson: entry.configJson,
      requiredEnv: entry.requiredEnv as unknown as never,
      dependencies: entry.dependencies as unknown as never,
      scannedAt: new Date(),
    }).onConflictDoUpdate({
      target: skillSnapshots.skillId,
      set: {
        displayName: entry.displayName,
        description: entry.description,
        configJson: entry.configJson,
        requiredEnv: entry.requiredEnv as unknown as never,
        scannedAt: new Date(),
      },
    })
  }
}

export const skillsRefreshWorker = {
  run: runRefresh,
}
