import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

export function generateEnv(projectDir: string, overrides: Record<string, string> = {}): void {
  const examplePath = join(projectDir, 'apps', 'api', '.env.example')
  const envPath = join(projectDir, 'apps', 'api', '.env')

  let content: string
  if (existsSync(examplePath)) {
    content = readFileSync(examplePath, 'utf-8')
  } else {
    content = [
      'PORT=3001',
      'OPERATOR_TOKEN=',
      'DATABASE_URL=postgresql://localhost:5434/cc_operator',
      'REDIS_URL=redis://127.0.0.1:6379/2',
      'CLAUDE_HOME=~/.claude',
      'NODE_ENV=development',
      'AUTH_USER=admin',
      'AUTH_PASS=changeme',
      'EMBEDDING_PROVIDER=ollama',
      'EMBEDDING_BASE_URL=http://localhost:11434',
      'EMBEDDING_MODEL=nomic-embed-text',
      '# Multi-provider support (optional)',
      'OPENAI_API_KEY=',
      'GOOGLE_API_KEY=',
    ].join('\n') + '\n'
  }

  // Generate a random operator token
  const token = randomBytes(32).toString('hex')
  content = content.replace(/^OPERATOR_TOKEN=.*$/m, `OPERATOR_TOKEN=${overrides.OPERATOR_TOKEN ?? token}`)

  if (overrides.AUTH_USER) {
    content = content.replace(/^AUTH_USER=.*$/m, `AUTH_USER=${overrides.AUTH_USER}`)
  }
  if (overrides.AUTH_PASS) {
    content = content.replace(/^AUTH_PASS=.*$/m, `AUTH_PASS=${overrides.AUTH_PASS}`)
  }

  writeFileSync(envPath, content)
}

export function readGeneratedToken(projectDir: string): string | null {
  const envPath = join(projectDir, 'apps', 'api', '.env')
  if (!existsSync(envPath)) return null
  const content = readFileSync(envPath, 'utf-8')
  const match = content.match(/^OPERATOR_TOKEN=(.+)$/m)
  return match?.[1] ?? null
}
