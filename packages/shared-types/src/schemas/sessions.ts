import { z } from 'zod'

export const SessionInfoSchema = z.object({
  sessionId: z.string(),
  projectName: z.string(),
  sizeBytes: z.number(),
  modifiedAt: z.string(),
})
export type SessionInfo = z.infer<typeof SessionInfoSchema>
