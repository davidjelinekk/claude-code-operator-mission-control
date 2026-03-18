import { readdirSync, readFileSync, existsSync, lstatSync } from 'node:fs'
import { join } from 'node:path'
import { config } from '../../config.js'

export interface SkillDefinition {
  id: string
  name: string
  description: string | null
  isUserInvocable: boolean
  filePath: string
  content: string
}

function parseSkillFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  const meta: Record<string, unknown> = {}
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    let value: unknown = line.slice(idx + 1).trim()
    if (value === 'true') value = true
    else if (value === 'false') value = false
    meta[key] = value
  }
  return meta
}

export function discoverSkills(): SkillDefinition[] {
  const skillsDir = join(config.CLAUDE_HOME, 'skills')
  if (!existsSync(skillsDir)) return []

  const skills: SkillDefinition[] = []
  let dirs: string[]
  try {
    dirs = readdirSync(skillsDir).filter((d) => {
      try { return lstatSync(join(skillsDir, d)).isDirectory() } catch { return false }
    })
  } catch {
    return []
  }

  for (const dir of dirs) {
    const skillMdPath = join(skillsDir, dir, 'SKILL.md')
    if (!existsSync(skillMdPath)) continue
    try {
      const content = readFileSync(skillMdPath, 'utf-8')
      const meta = parseSkillFrontmatter(content)
      skills.push({
        id: dir,
        name: (meta.name as string) ?? dir,
        description: (meta.description as string) ?? null,
        isUserInvocable: (meta.user_invocable as boolean) ?? false,
        filePath: skillMdPath,
        content,
      })
    } catch {
      // skip
    }
  }
  return skills
}
