import { spawn as childSpawn } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pino from 'pino'
import type { ScriptDefinition } from './script-discovery.js'
import type { McpServerConfig } from './config-reader.js'

const log = pino({ name: 'script-mcp-bridge' })

export interface ScriptExecResult {
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
}

function buildCommand(script: ScriptDefinition): { cmd: string; prependArgs: string[] } {
  const interpreter = script.interpreter ?? inferInterpreter(script.entrypoint)
  // TypeScript files need tsx to run
  if (interpreter === 'tsx') {
    return { cmd: 'npx', prependArgs: ['tsx', script.executablePath] }
  }
  return { cmd: interpreter, prependArgs: [script.executablePath] }
}

export function executeScript(
  script: ScriptDefinition,
  args: Record<string, unknown>,
): Promise<ScriptExecResult> {
  return new Promise((resolvePromise) => {
    const start = Date.now()
    const cwd = resolve(script.filePath, '..')

    const { cmd, prependArgs } = buildCommand(script)
    const spawnArgs: string[] = [...prependArgs]

    // Build env (resolve required env vars from process.env)
    const env = { ...process.env }
    for (const key of script.requiredEnv) {
      if (process.env[key]) {
        env[key] = process.env[key]
      }
    }

    if (script.inputMode === 'args') {
      for (const [key, value] of Object.entries(args)) {
        if (value === true) {
          spawnArgs.push(`--${key}`)
        } else if (value !== false && value !== undefined && value !== null) {
          spawnArgs.push(`--${key}`, String(value))
        }
      }
    } else if (script.inputMode === 'env') {
      for (const [key, value] of Object.entries(args)) {
        env[`SCRIPT_ARG_${key.toUpperCase()}`] = String(value ?? '')
      }
    }

    let resolved = false
    const finish = (result: ScriptExecResult) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      resolvePromise(result)
    }

    const proc = childSpawn(cmd, spawnArgs, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    if (script.inputMode === 'stdin') {
      proc.stdin.write(JSON.stringify(args))
      proc.stdin.end()
    }

    // Manual timeout — spawn() does not have a timeout option
    const timer = setTimeout(() => {
      proc.kill('SIGTERM')
      setTimeout(() => { if (!resolved) proc.kill('SIGKILL') }, 2000)
      finish({
        exitCode: 124,
        stdout: stdout.trim(),
        stderr: (stderr.trim() + '\n[timeout after ' + script.timeout + 'ms]').trim(),
        durationMs: Date.now() - start,
      })
    }, script.timeout)

    proc.on('close', (code) => {
      finish({
        exitCode: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        durationMs: Date.now() - start,
      })
    })

    proc.on('error', (err) => {
      finish({
        exitCode: 1,
        stdout: '',
        stderr: String(err),
        durationMs: Date.now() - start,
      })
    })
  })
}

function inferInterpreter(entrypoint: string): string {
  if (entrypoint.endsWith('.py')) return 'python3'
  if (entrypoint.endsWith('.ts')) return 'tsx'
  if (entrypoint.endsWith('.js') || entrypoint.endsWith('.mjs')) return 'node'
  if (entrypoint.endsWith('.sh') || entrypoint.endsWith('.bash')) return 'bash'
  if (entrypoint.endsWith('.rb')) return 'ruby'
  return 'bash'
}

/**
 * Build an MCP server config for scripts that can be injected into spawn options.
 *
 * Creates a lightweight stdio-based MCP server config wrapping each script.
 * The wrapper implements the MCP protocol and exposes scripts as tools.
 */
export function buildScriptMcpConfig(scripts: ScriptDefinition[]): Record<string, McpServerConfig> | null {
  if (scripts.length === 0) return null

  const scriptDefs: Record<string, {
    id: string
    description: string
    executablePath: string
    interpreter: string
    inputMode: string
    outputMode: string
    timeout: number
    argsSchema: Record<string, unknown> | null
  }> = {}

  for (const s of scripts) {
    const interpreter = s.interpreter ?? inferInterpreter(s.entrypoint)
    scriptDefs[s.id] = {
      id: s.id,
      description: s.description ?? s.name,
      executablePath: s.executablePath,
      interpreter,
      inputMode: s.inputMode,
      outputMode: s.outputMode,
      timeout: s.timeout,
      argsSchema: s.argsSchema,
    }
  }

  // Resolve wrapper path relative to THIS file (works in both src/ and dist/)
  // The postbuild script copies .mjs files, or in dev tsx runs from src/ directly
  const thisDir = dirname(fileURLToPath(import.meta.url))
  const wrapperPath = resolve(thisDir, 'script-mcp-wrapper.mjs')

  return {
    'script-runner': {
      command: 'node',
      args: [wrapperPath],
      env: {
        SCRIPT_DEFS: JSON.stringify(scriptDefs),
      },
    } as McpServerConfig,
  }
}
