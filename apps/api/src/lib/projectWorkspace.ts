import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { config } from '../config.js'
import { slugify } from './slugify.js'

const execAsync = promisify(exec)

export async function initProjectWorkspace(project: {
  id: string
  name: string
  description?: string | null
}): Promise<string> {
  const base = join(config.CLAUDE_HOME, 'workspaces', 'projects')
  const slug = slugify(project.name).slice(0, 60)
  let dirPath = join(base, slug)

  if (existsSync(dirPath)) {
    dirPath = join(base, `${slug}-${project.id.slice(0, 8)}`)
  }

  await mkdir(join(dirPath, 'scripts'), { recursive: true })

  const desc = project.description ?? '(No description)'
  const now = new Date().toISOString().slice(0, 10)

  await writeFile(join(dirPath, 'BRIEF.md'), [
    `# ${project.name}`,
    '',
    `## Description`,
    desc,
    '',
    `## Project ID`,
    project.id,
    '',
    `## Status`,
    'planning',
    '',
    `## Created`,
    now,
    '',
    `## Objective`,
    '<!-- Define the project goal here -->',
    '',
    `## Success Criteria`,
    '<!-- How will you know the project is complete -->',
  ].join('\n'))

  await writeFile(join(dirPath, 'MEMORY.md'), [
    `# ${project.name} — Memory`,
    '',
    '<!-- Project-level memory and notes for agents working on this project -->',
  ].join('\n'))

  await writeFile(join(dirPath, 'CONTEXT.md'), [
    `# ${project.name} — Context`,
    '',
    `## Project ID`,
    project.id,
    '',
    `## Workspace`,
    dirPath,
    '',
    `## Notes`,
    '<!-- Ongoing context, decisions, and observations -->',
  ].join('\n'))

  await writeFile(join(dirPath, 'TOOLS.md'), [
    `# Tools`,
    '',
    '<!-- Document tools and scripts available for this project -->',
    '',
    '## Scripts',
    'See `scripts/` directory.',
  ].join('\n'))

  try {
    await execAsync('git init', { cwd: dirPath })
    await execAsync('git add -A && git commit -m "Initial project workspace"', { cwd: dirPath })
  } catch { /* git unavailable or no files — non-fatal */ }

  return dirPath
}
