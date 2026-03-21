import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export interface CLIConfig {
  url: string
  token: string
}

const CONFIG_DIR = join(homedir(), '.cc-operator')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

export function loadConfig(): CLIConfig | null {
  // Env vars take precedence
  const url = process.env.CC_OPERATOR_URL
  const token = process.env.CC_OPERATOR_TOKEN
  if (url && token) return { url, token }

  if (!existsSync(CONFIG_FILE)) return null
  try {
    const raw = readFileSync(CONFIG_FILE, 'utf-8')
    const parsed = JSON.parse(raw) as CLIConfig
    if (!parsed.url || !parsed.token) return null
    return parsed
  } catch {
    return null
  }
}

export function saveConfig(config: CLIConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
}

export function requireConfig(): CLIConfig {
  const config = loadConfig()
  if (!config) {
    console.error('Not configured. Run: cc-operator init')
    process.exit(1)
  }
  return config
}
