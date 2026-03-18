import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { config } from '../../config.js'

export interface ClaudeSettings {
  permissions?: Record<string, unknown>
  env?: Record<string, string>
  mcpServers?: Record<string, McpServerConfig>
  hooks?: Record<string, unknown>
  [key: string]: unknown
}

export interface McpServerConfig {
  command?: string
  args?: string[]
  env?: Record<string, string>
  type?: string
  url?: string
  [key: string]: unknown
}

export function readSettings(): ClaudeSettings {
  const settingsPath = join(config.CLAUDE_HOME, 'settings.json')
  try {
    return JSON.parse(readFileSync(settingsPath, 'utf-8'))
  } catch {
    return {}
  }
}

export function readLocalSettings(): ClaudeSettings {
  const settingsPath = join(config.CLAUDE_HOME, 'settings.local.json')
  try {
    return JSON.parse(readFileSync(settingsPath, 'utf-8'))
  } catch {
    return {}
  }
}

export function readMcpConfig(projectDir?: string): Record<string, McpServerConfig> {
  const servers: Record<string, McpServerConfig> = {}

  // Global settings
  const globalSettings = readSettings()
  if (globalSettings.mcpServers) {
    Object.assign(servers, globalSettings.mcpServers)
  }

  // Project-level .mcp.json
  if (projectDir) {
    const mcpPath = join(projectDir, '.mcp.json')
    try {
      const mcpConfig = JSON.parse(readFileSync(mcpPath, 'utf-8'))
      if (mcpConfig.mcpServers) {
        Object.assign(servers, mcpConfig.mcpServers)
      }
    } catch {
      // no project-level MCP config
    }
  }

  return servers
}
