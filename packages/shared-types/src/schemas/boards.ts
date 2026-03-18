import { z } from 'zod'

export const BoardSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  gatewayAgentId: z.string().nullable(),
  boardGroupId: z.string().uuid().nullable().optional(),
  objective: z.string().nullable().optional(),
  targetDate: z.string().datetime().nullable().optional(),
  goalConfirmed: z.boolean().optional(),
  requireApprovalForDone: z.boolean(),
  requireReviewBeforeDone: z.boolean().optional(),
  commentRequiredForReview: z.boolean().optional(),
  blockStatusChangesWithPendingApproval: z.boolean().optional(),
  onlyLeadCanChangeStatus: z.boolean().optional(),
  maxAgents: z.number().int().min(0).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type Board = z.infer<typeof BoardSchema>

export const CreateBoardSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().max(1000).optional(),
  gatewayAgentId: z.string().optional(),
  boardGroupId: z.string().uuid().optional(),
  objective: z.string().optional(),
  targetDate: z.string().datetime().optional(),
  goalConfirmed: z.boolean().optional(),
  requireApprovalForDone: z.boolean().default(false),
  requireReviewBeforeDone: z.boolean().optional(),
  commentRequiredForReview: z.boolean().optional(),
  blockStatusChangesWithPendingApproval: z.boolean().optional(),
  onlyLeadCanChangeStatus: z.boolean().optional(),
  maxAgents: z.number().int().min(0).optional(),
})
export type CreateBoard = z.infer<typeof CreateBoardSchema>

export const UpdateBoardSchema = CreateBoardSchema.partial()
export type UpdateBoard = z.infer<typeof UpdateBoardSchema>
