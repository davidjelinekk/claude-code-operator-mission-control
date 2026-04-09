import { z } from 'zod'

export const ProviderSchema = z.enum(['claude', 'codex', 'gemini'])
export type Provider = z.infer<typeof ProviderSchema>

/**
 * Terminal reason from SDK 0.2.91+ result messages. Mirrors the SDK's
 * TerminalReason type. Kept as a string (not enum) to stay forward-compatible
 * with future SDK additions.
 */
export type TerminalReason = string

export const NormalizedMessageSchema = z.object({
  type: z.enum(['assistant', 'user', 'system', 'tool_use', 'result', 'progress']),
  content: z.string().optional(),
  session_id: z.string().optional(),
  uuid: z.string().optional(),
  subtype: z.string().optional(),
  is_error: z.boolean().optional(),
  total_cost_usd: z.number().nullable().optional(),
  num_turns: z.number().nullable().optional(),
  /** SDK 0.2.91+: Why the query loop terminated (Claude provider only) */
  terminal_reason: z.string().nullable().optional(),
  provider: ProviderSchema,
  raw: z.unknown().optional(),
})
export type NormalizedMessage = z.infer<typeof NormalizedMessageSchema>

export const ProviderStatusSchema = z.object({
  provider: ProviderSchema,
  available: z.boolean(),
  cliInstalled: z.boolean(),
  defaultModel: z.string().nullable(),
})
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>

/** Context usage breakdown from SDK getContextUsage() (Claude provider only) */
export const ContextUsageCategorySchema = z.object({
  name: z.string(),
  tokens: z.number(),
  color: z.string().optional(),
  isDeferred: z.boolean().optional(),
})
export type ContextUsageCategory = z.infer<typeof ContextUsageCategorySchema>

export const ContextUsageSchema = z.object({
  categories: z.array(ContextUsageCategorySchema),
  totalTokens: z.number(),
  /** Effective context window size for the current session (e.g., 200000, 1000000) */
  maxTokens: z.number().optional(),
  /** Raw context window size before any overrides */
  rawMaxTokens: z.number().optional(),
  /** Precomputed percentage of the context window used */
  percentage: z.number().optional(),
})
export type ContextUsage = z.infer<typeof ContextUsageSchema>
