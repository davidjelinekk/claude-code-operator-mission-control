import { z } from 'zod'

export const AgentStatusSchema = z.enum(['available', 'running', 'offline', 'error'])
export type AgentStatus = z.infer<typeof AgentStatusSchema>

export const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  tools: z.array(z.string()).optional(),
  maxTurns: z.number().int().nullable().optional(),
  permissionMode: z.string().nullable().optional(),
  promptContent: z.string().optional(),
  status: AgentStatusSchema,
})
export type Agent = z.infer<typeof AgentSchema>
