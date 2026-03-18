import { z } from 'zod'

export const TaskStatus = z.enum(['inbox', 'in_progress', 'review', 'done'])
export type TaskStatus = z.infer<typeof TaskStatus>

export const TaskPriority = z.enum(['low', 'medium', 'high'])
export type TaskPriority = z.infer<typeof TaskPriority>

export const TaskSchema = z.object({
  id: z.string().uuid(),
  boardId: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  status: TaskStatus,
  priority: TaskPriority,
  assignedAgentId: z.string().nullable(),
  dueAt: z.string().datetime().nullable(),
  inProgressAt: z.string().datetime().nullable(),
  outcome: z.enum(['success', 'failed', 'partial', 'abandoned']).nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  autoCreated: z.boolean(),
  autoReason: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type Task = z.infer<typeof TaskSchema>

export const CreateTaskSchema = z.object({
  boardId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  status: TaskStatus.default('inbox'),
  priority: TaskPriority.default('medium'),
  assignedAgentId: z.string().optional(),
  dueAt: z.string().datetime().optional(),
})
export type CreateTask = z.infer<typeof CreateTaskSchema>

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  status: TaskStatus.optional(),
  priority: TaskPriority.optional(),
  assignedAgentId: z.string().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
})
export type UpdateTask = z.infer<typeof UpdateTaskSchema>

export const ApprovalStatus = z.enum(['pending', 'approved', 'rejected'])
export type ApprovalStatus = z.infer<typeof ApprovalStatus>

export const ApprovalSchema = z.object({
  id: z.string().uuid(),
  boardId: z.string().uuid(),
  taskId: z.string().uuid().nullable(),
  agentId: z.string(),
  actionType: z.string(),
  payload: z.unknown(),
  confidence: z.string().nullable(),
  status: ApprovalStatus,
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
})
export type Approval = z.infer<typeof ApprovalSchema>

export const TaskDependencySchema = z.object({
  taskId: z.string().uuid(),
  dependsOnTaskId: z.string().uuid(),
})
export type TaskDependency = z.infer<typeof TaskDependencySchema>
