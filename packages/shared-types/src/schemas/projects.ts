import { z } from 'zod'

export const ProjectStatus = z.enum(['planning', 'active', 'paused', 'complete'])
export type ProjectStatus = z.infer<typeof ProjectStatus>

export const ExecutionMode = z.enum(['sequential', 'parallel'])
export type ExecutionMode = z.infer<typeof ExecutionMode>

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  status: ProjectStatus,
  progressPct: z.number().int().min(0).max(100),
  targetDate: z.string().datetime().nullable(),
  orchestratorAgentId: z.string().nullable(),
  workspacePath: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type Project = z.infer<typeof ProjectSchema>

export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(300),
  description: z.string().optional(),
  status: ProjectStatus.default('planning'),
  targetDate: z.string().datetime().optional(),
  orchestratorAgentId: z.string().optional(),
})
export type CreateProject = z.infer<typeof CreateProjectSchema>

export const UpdateProjectSchema = CreateProjectSchema.partial().extend({
  progressPct: z.number().int().min(0).max(100).optional(),
})
export type UpdateProject = z.infer<typeof UpdateProjectSchema>

export const ProjectTaskSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  position: z.number().int(),
  executionMode: ExecutionMode,
})
export type ProjectTask = z.infer<typeof ProjectTaskSchema>
