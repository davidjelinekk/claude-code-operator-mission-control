import { execSync } from 'node:child_process'
import pino from 'pino'
import type { NormalizedMessage } from '@claude-code-operator/shared-types'
import type { SessionProvider, ProviderSession, ProviderSpawnParams } from './types.js'
import { spawnCli } from './child-process-helper.js'

const log = pino({ name: 'codex-provider' })

export class CodexProvider implements SessionProvider {
  readonly name = 'codex' as const
  private cliInstalled: boolean | null = null

  checkAvailable(): boolean {
    if (this.cliInstalled !== null) return this.cliInstalled
    try {
      execSync('codex --version', { stdio: 'pipe', timeout: 5000 })
      this.cliInstalled = true
    } catch {
      this.cliInstalled = false
    }
    return this.cliInstalled
  }

  getStatus() {
    const cliInstalled = this.checkAvailable()
    return {
      provider: 'codex' as const,
      available: cliInstalled && !!process.env.OPENAI_API_KEY,
      cliInstalled,
      defaultModel: cliInstalled ? 'o4-mini' : null,
    }
  }

  async spawn(params: ProviderSpawnParams): Promise<ProviderSession> {
    if (!this.checkAvailable()) {
      throw new Error('Codex CLI not installed')
    }
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured')
    }

    const raw = params.raw as Record<string, any>
    const args = this.buildArgs(params, raw)

    const cli = spawnCli('codex', args, {
      cwd: params.cwd,
      env: {
        ...process.env,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        ...params.env,
      } as Record<string, string>,
    })

    // Write prompt to stdin and close
    if (cli.process.stdin) {
      cli.process.stdin.write(params.prompt)
      cli.process.stdin.end()
    }

    const sessionId = crypto.randomUUID()

    log.info({ sessionId, model: params.model }, 'codex session spawned')

    return {
      messages: this.normalizeStream(cli.lines, sessionId),
      abort: () => cli.abort(),
      close: () => cli.close(),
      queryHandle: null,
    }
  }

  private buildArgs(params: ProviderSpawnParams, raw: Record<string, any>): string[] {
    const args: string[] = []

    if (params.model) {
      args.push('--model', params.model)
    }

    // Map permission modes to Codex approval modes
    const mode = raw.permissionMode
    if (mode === 'bypassPermissions') {
      args.push('--full-auto')
    } else if (mode === 'acceptEdits') {
      args.push('--full-auto')
    } else {
      args.push('--suggest')
    }

    // Sandbox
    if (params.sandbox) {
      args.push('--sandbox')
    }

    // Quiet mode for cleaner output
    args.push('--quiet')

    return args
  }

  private async *normalizeStream(
    lines: AsyncGenerator<string, void>,
    sessionId: string,
  ): AsyncGenerator<NormalizedMessage, void> {
    let buffer = ''

    try {
      for await (const line of lines) {
        // Try to parse as JSON (Codex JSONL output)
        try {
          const event = JSON.parse(line)
          if (event.type === 'message' || event.type === 'response') {
            const content = typeof event.content === 'string'
              ? event.content
              : event.text ?? event.message ?? JSON.stringify(event)
            yield {
              type: 'assistant',
              content,
              session_id: sessionId,
              uuid: crypto.randomUUID(),
              provider: 'codex',
              raw: event,
            }
          } else {
            yield {
              type: 'progress',
              subtype: event.type ?? 'unknown',
              session_id: sessionId,
              uuid: crypto.randomUUID(),
              provider: 'codex',
              raw: event,
            }
          }
        } catch {
          // Not JSON — accumulate as plain text
          if (line.trim()) {
            buffer += line + '\n'
          }
        }
      }
    } finally {
      // Flush any remaining text buffer as a final assistant message
      if (buffer.trim()) {
        yield {
          type: 'assistant',
          content: buffer.trim(),
          session_id: sessionId,
          uuid: crypto.randomUUID(),
          provider: 'codex',
        }
      }

      // Emit synthetic result
      yield {
        type: 'result',
        session_id: sessionId,
        uuid: crypto.randomUUID(),
        provider: 'codex',
        is_error: false,
        total_cost_usd: null,
        num_turns: null,
      }
    }
  }
}
