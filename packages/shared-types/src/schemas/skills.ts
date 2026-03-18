import { z } from 'zod'

export const SkillType = z.enum(['skill', 'mcp_server'])
export type SkillType = z.infer<typeof SkillType>

export const SkillSnapshotSchema = z.object({
  skillId: z.string(),
  displayName: z.string(),
  description: z.string().nullable(),
  skillType: SkillType,
  isInstalled: z.boolean(),
  configJson: z.unknown().nullable(),
  requiredEnv: z.array(z.string()),
  dependencies: z.array(z.string()),
  scannedAt: z.string().datetime(),
})
export type SkillSnapshot = z.infer<typeof SkillSnapshotSchema>

export const AgentSkillSchema = z.object({
  agentId: z.string(),
  skillId: z.string(),
})
export type AgentSkill = z.infer<typeof AgentSkillSchema>
