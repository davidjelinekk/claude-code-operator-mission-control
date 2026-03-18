import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { config } from '../../config.js'

export interface HookConfig {
  type: 'command'
  command: string
  timeout?: number
}

export interface HookEntry {
  event: string
  matcher?: string
  hooks: HookConfig[]
  source: 'global' | 'project'
}

type HooksMap = Record<string, Array<HookConfig | { matcher: string; hooks: HookConfig[] }>>

export function readAllHooks(projectDir?: string): HookEntry[] {
  const entries: HookEntry[] = []

  // Global hooks from settings.json
  const settingsPath = join(config.CLAUDE_HOME, 'settings.json')
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    if (settings.hooks) {
      appendHooks(entries, settings.hooks, 'global')
    }
  } catch {
    // no global hooks
  }

  // Project hooks
  if (projectDir) {
    const hooksPath = join(projectDir, '.claude', 'hooks.json')
    try {
      if (existsSync(hooksPath)) {
        const hooks = JSON.parse(readFileSync(hooksPath, 'utf-8'))
        appendHooks(entries, hooks, 'project')
      }
    } catch {
      // no project hooks
    }
  }

  return entries
}

function appendHooks(entries: HookEntry[], hooksMap: HooksMap, source: 'global' | 'project'): void {
  for (const [event, items] of Object.entries(hooksMap)) {
    if (!Array.isArray(items)) continue
    for (const item of items) {
      if ('matcher' in item && item.matcher) {
        entries.push({
          event,
          matcher: item.matcher,
          hooks: Array.isArray(item.hooks) ? item.hooks : [],
          source,
        })
      } else if ('command' in item) {
        entries.push({ event, hooks: [item as HookConfig], source })
      }
    }
  }
}
