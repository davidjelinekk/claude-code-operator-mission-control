import { z } from 'zod'

export const TokenEventSchema = z.object({
  id: z.string().uuid(),
  agentId: z.string(),
  sessionId: z.string(),
  taskId: z.string().uuid().nullable(),
  projectId: z.string().uuid().nullable(),
  provider: z.string(),
  modelId: z.string(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  cacheReadTokens: z.number().int(),
  cacheWriteTokens: z.number().int(),
  costUsd: z.string(),
  turnTimestamp: z.string().datetime(),
  createdAt: z.string().datetime(),
})
export type TokenEvent = z.infer<typeof TokenEventSchema>

export const AnalyticsSummarySchema = z.object({
  totalCostUsd: z.string(),
  totalInputTokens: z.number().int(),
  totalOutputTokens: z.number().int(),
  totalCacheReadTokens: z.number().int(),
  totalCacheWriteTokens: z.number().int(),
  cacheHitPct: z.number(),
  turnCount: z.number().int(),
})
export type AnalyticsSummary = z.infer<typeof AnalyticsSummarySchema>

export const AgentAnalyticsSchema = z.object({
  agentId: z.string(),
  totalCostUsd: z.string(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  cacheReadTokens: z.number().int(),
  cacheWriteTokens: z.number().int(),
  turnCount: z.number().int(),
})
export type AgentAnalytics = z.infer<typeof AgentAnalyticsSchema>

export const TimeseriesPointSchema = z.object({
  bucket: z.string(),
  agentId: z.string(),
  costUsd: z.string(),
  tokens: z.number().int(),
})
export type TimeseriesPoint = z.infer<typeof TimeseriesPointSchema>
