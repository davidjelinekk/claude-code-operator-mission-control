import { z } from 'zod'

export const HookConfigSchema = z.object({
  type: z.literal('command'),
  command: z.string(),
  timeout: z.number().optional(),
})
export type HookConfig = z.infer<typeof HookConfigSchema>

export const HookEntrySchema = z.object({
  event: z.string(),
  matcher: z.string().optional(),
  hooks: z.array(HookConfigSchema),
  source: z.enum(['global', 'project']),
})
export type HookEntry = z.infer<typeof HookEntrySchema>
