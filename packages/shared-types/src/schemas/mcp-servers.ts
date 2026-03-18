import { z } from 'zod'

export const McpServerSchema = z.object({
  id: z.string(),
  command: z.string().nullable(),
  type: z.string(),
  args: z.array(z.string()),
  env: z.array(z.string()),
})
export type McpServer = z.infer<typeof McpServerSchema>
