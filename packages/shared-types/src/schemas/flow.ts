import { z } from 'zod'

export const FlowEdgeSchema = z.object({
  id: z.string().uuid(),
  fromAgentId: z.string(),
  toAgentId: z.string(),
  messageType: z.string(),
  sessionId: z.string().nullable(),
  taskId: z.string().uuid().nullable(),
  tokenCost: z.string().nullable(),
  occurredAt: z.string().datetime(),
  rawLogLine: z.string().nullable(),
})
export type FlowEdge = z.infer<typeof FlowEdgeSchema>
