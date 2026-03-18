import { z } from 'zod'

export const WsBoardEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('snapshot'), board: z.unknown(), tasks: z.array(z.unknown()) }),
  z.object({ type: z.literal('task.created'), task: z.unknown() }),
  z.object({ type: z.literal('task.updated'), task: z.unknown() }),
  z.object({ type: z.literal('task.status'), taskId: z.string(), status: z.string() }),
  z.object({ type: z.literal('task.deleted'), taskId: z.string() }),
  z.object({ type: z.literal('approval.created'), approval: z.unknown() }),
  z.object({ type: z.literal('approval.resolved'), approvalId: z.string(), status: z.string() }),
])

export const WsFlowEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('edge.batch'), edges: z.array(z.unknown()) }),
  z.object({ type: z.literal('edge.added'), edge: z.unknown() }),
  z.object({ type: z.literal('node.updated'), agentId: z.string(), status: z.string() }),
])
