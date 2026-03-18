import { z } from 'zod'

export const CronJobSchema = z.object({
  id: z.string(),
  name: z.string(),
  schedule: z.string(),
  agentId: z.string(),
  enabled: z.boolean(),
  lastRunAt: z.string().datetime().nullable(),
  lastRunStatus: z.enum(['ok', 'error', 'timeout', 'running']).nullable(),
  lastRunDurationMs: z.number().int().nullable(),
  consecutiveErrors: z.number().int(),
  nextRunAt: z.string().datetime().nullable(),
})
export type CronJob = z.infer<typeof CronJobSchema>
