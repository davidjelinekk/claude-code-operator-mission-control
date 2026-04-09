import { execSync } from 'node:child_process'
import pino from 'pino'
import type { NormalizedMessage } from '@claude-code-operator/shared-types'
import type { SessionProvider, ProviderSession, ProviderSpawnParams } from './types.js'
import { spawnCli } from './child-process-helper.js'

const log = pino({ name: 'gemini-provider' })

export class GeminiProvider implements SessionProvider {
  readonly name = 'gemini' as const
  private cliInstalled: boolean | null = null

  checkAvailable(): boolean {
    if (this.cliInstalled !== null) return this.cliInstalled
    try {
      execSync('gemini --version', { stdio: 'pipe', timeout: 5000 })
      this.cliInstalled = true
    } catch {
      this.cliInstalled = false
    }
    return this.cliInstalled
  }

  getStatus() {
    const cliInstalled = this.checkAvailable()
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY
    return {
      provider: 'gemini' as const,
      available: cliInstalled && !!apiKey,
      cliInstalled,
      defaultModel: cliInstalled ? 'gemini-2.5-pro' : null,
    }
  }

  async spawn(params: ProviderSpawnParams): Promise<ProviderSession> {
    if (!this.checkAvailable()) {
      throw new Error('Gemini CLI not installed')
    }
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY or GEMINI_API_KEY not configured')
    }

    const raw = params.raw as Record<string, any>
    const args = this.buildArgs(params, raw)

    const cli = spawnCli('gemini', args, {
      cwd: params.cwd,
      env: {
        ...process.env,
        GOOGLE_API_KEY: apiKey,
        ...params.env,
      } as Record<string, string>,
    })

    // Write prompt to stdin and close
    if (cli.process.stdin) {
      cli.process.stdin.write(params.prompt)
      cli.process.stdin.end()
    }

    const sessionId = crypto.randomUUID()

    log.info({ sessionId, model: params.model }, 'gemini session spawned')

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

    // Map permission modes to Gemini's sandbox/auto modes
    const mode = raw.permissionMode
    if (mode === 'bypassPermissions') {
      args.push('--yolo')
    }

    // Sandbox
    if (params.sandbox) {
      args.push('--sandbox')
    }

    return args
  }

  private async *normalizeStream(
    lines: AsyncGenerator<string, void>,
    sessionId: string,
  ): AsyncGenerator<NormalizedMessage, void> {
    let buffer = ''

    try {
      for await (const line of lines) {
        // Try to parse as JSON
        try {
          const event = JSON.parse(line)
          if (event.type === 'message' || event.type === 'response' || event.text) {
            yield {
              type: 'assistant',
              content: event.text ?? event.content ?? event.message ?? JSON.stringify(event),
              session_id: sessionId,
              uuid: crypto.randomUUID(),
              provider: 'gemini',
              raw: event,
            }
          } else {
            yield {
              type: 'progress',
              subtype: event.type ?? 'unknown',
              session_id: sessionId,
              uuid: crypto.randomUUID(),
              provider: 'gemini',
              raw: event,
            }
          }
        } catch {
          // Plain text output
          if (line.trim()) {
            buffer += line + '\n'
          }
        }
      }
    } finally {
      // Flush remaining text
      if (buffer.trim()) {
        yield {
          type: 'assistant',
          content: buffer.trim(),
          session_id: sessionId,
          uuid: crypto.randomUUID(),
          provider: 'gemini',
        }
      }

      // Synthetic result
      yield {
        type: 'result',
        session_id: sessionId,
        uuid: crypto.randomUUID(),
        provider: 'gemini',
        is_error: false,
        total_cost_usd: null,
        num_turns: null,
      }
    }
  }
}
