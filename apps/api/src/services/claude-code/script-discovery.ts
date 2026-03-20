import { readdirSync, readFileSync, existsSync, lstatSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { config } from '../../config.js'

export interface ScriptDefinition {
  id: string
  name: string
  description: string | null
  entrypoint: string
  interpreter: string | null
  inputMode: 'args' | 'stdin' | 'env'
  outputMode: 'stdout' | 'json'
  timeout: number
  requiredEnv: string[]
  argsSchema: Record<string, unknown> | null
  tags: string[]
  filePath: string
  executablePath: string
  content: string
}

function parseScriptFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  const meta: Record<string, unknown> = {}
  let currentKey: string | null = null
  let multilineValue = ''
  let inMultiline = false

  for (const line of match[1].split('\n')) {
    if (inMultiline) {
      // End multiline block when we hit an unindented line that starts a new key
      if (!line.startsWith(' ') && !line.startsWith('\t') && line.includes(':') && line.indexOf(':') > 0) {
        meta[currentKey!] = multilineValue.trim()
        inMultiline = false
        // Fall through to process this line as a new key
      } else {
        multilineValue += line + '\n'
        continue
      }
    }

    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    let rawValue = line.slice(idx + 1).trim()

    if (rawValue === '|') {
      currentKey = key
      multilineValue = ''
      inMultiline = true
      continue
    }

    // Remove surrounding quotes
    if ((rawValue.startsWith('"') && rawValue.endsWith('"')) ||
        (rawValue.startsWith("'") && rawValue.endsWith("'"))) {
      rawValue = rawValue.slice(1, -1)
    }

    let value: unknown = rawValue
    if (value === 'true') value = true
    else if (value === 'false') value = false
    else if (/^\d+$/.test(rawValue)) value = parseInt(rawValue, 10)

    // Handle YAML inline arrays: [item1, item2]
    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean)
    }

    // Skip YAML dash-prefixed list items (handled by parseEnvList)
    if (key === '-') continue

    meta[key] = value
  }

  if (inMultiline && currentKey) {
    meta[currentKey] = multilineValue.trim()
  }

  return meta
}

function parseEnvList(content: string): string[] {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return []

  const lines = match[1].split('\n')
  const envVars: string[] = []
  let inEnvBlock = false

  for (const line of lines) {
    if (line.startsWith('env:')) {
      const inline = line.slice(4).trim()
      // Handle inline array: env: [VAR1, VAR2]
      if (inline.startsWith('[') && inline.endsWith(']')) {
        return inline.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean)
      }
      // Handle empty inline: env: []
      if (inline === '[]') return []
      inEnvBlock = true
      continue
    }
    if (inEnvBlock) {
      const trimmed = line.trim()
      if (trimmed.startsWith('- ')) {
        // Strip trailing comments
        const val = trimmed.slice(2).trim().replace(/\s+#.*$/, '')
        if (val) envVars.push(val)
      } else if (trimmed === '' || (!line.startsWith(' ') && !line.startsWith('\t'))) {
        inEnvBlock = false
      }
    }
  }

  return envVars
}

function parseArgsSchema(meta: Record<string, unknown>): Record<string, unknown> | null {
  const raw = meta['args-schema']
  if (!raw) return null
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }
  return null
}

function parseTags(meta: Record<string, unknown>): string[] {
  const raw = meta['tags']
  if (Array.isArray(raw)) return raw.map(String)
  if (typeof raw === 'string') {
    return raw.split(',').map((s) => s.trim()).filter(Boolean)
  }
  return []
}

const scriptsDir = () => join(config.CLAUDE_HOME, 'scripts')

function parseOneScript(dir: string, dirName: string): ScriptDefinition | null {
  const scriptMdPath = join(dir, dirName, 'SCRIPT.md')
  if (!existsSync(scriptMdPath)) return null

  const content = readFileSync(scriptMdPath, 'utf-8')
  const meta = parseScriptFrontmatter(content)

  const entrypoint = (meta.entrypoint as string) ?? ''
  if (!entrypoint) return null

  const rawPath = resolve(join(dir, dirName, entrypoint))
  if (!existsSync(rawPath)) return null

  // Security: resolve symlinks and ensure executable is within scripts directory
  let executablePath: string
  try {
    executablePath = realpathSync(rawPath)
  } catch {
    return null
  }
  const realScriptsDir = realpathSync(resolve(dir))
  if (!executablePath.startsWith(realScriptsDir + '/')) return null

  return {
    id: dirName,
    name: (meta.name as string) ?? dirName,
    description: (meta.description as string) ?? null,
    entrypoint,
    interpreter: (meta.interpreter as string) ?? null,
    inputMode: (['args', 'stdin', 'env'].includes(meta['input-mode'] as string)
      ? meta['input-mode'] as 'args' | 'stdin' | 'env'
      : 'args'),
    outputMode: (['stdout', 'json'].includes(meta['output-mode'] as string)
      ? meta['output-mode'] as 'stdout' | 'json'
      : 'stdout'),
    timeout: typeof meta.timeout === 'number' ? meta.timeout : 30000,
    requiredEnv: parseEnvList(content),
    argsSchema: parseArgsSchema(meta),
    tags: parseTags(meta),
    filePath: scriptMdPath,
    executablePath,
    content,
  }
}

export function discoverScripts(): ScriptDefinition[] {
  const dir = scriptsDir()
  if (!existsSync(dir)) return []

  const scripts: ScriptDefinition[] = []
  let dirs: string[]
  try {
    dirs = readdirSync(dir).filter((d) => {
      try { return lstatSync(join(dir, d)).isDirectory() } catch { return false }
    })
  } catch {
    return []
  }

  for (const dirName of dirs) {
    try {
      const script = parseOneScript(dir, dirName)
      if (script) scripts.push(script)
    } catch {
      // skip malformed scripts
    }
  }
  return scripts
}

export function getScript(id: string): ScriptDefinition | null {
  // Validate ID to prevent path traversal
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(id)) return null

  const dir = scriptsDir()
  try {
    return parseOneScript(dir, id)
  } catch {
    return null
  }
}
