import { z } from 'zod'
import { homedir } from 'node:os'
import { join } from 'node:path'

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3001),
  OPERATOR_TOKEN: z.string().min(1),
  DATABASE_URL: z.string().url().default('postgresql://localhost:5432/cc_operator'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379/2'),
  CLAUDE_HOME: z.string().default(join(homedir(), '.claude')),
  ANTHROPIC_API_KEY: z.string().default(''),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

const raw = EnvSchema.parse(process.env)

export const config = {
  ...raw,
  BASE_URL: process.env.BASE_URL ?? `http://localhost:${raw.PORT}`,
} as const
