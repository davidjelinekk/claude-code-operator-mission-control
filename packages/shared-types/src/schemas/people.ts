import { z } from 'zod'

export const PersonSourceSchema = z.enum(['telegram', 'teams', 'email', 'manual', 'form'])

export const CreatePersonSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  source: PersonSourceSchema.optional(),
  role: z.string().optional(),
  relationship: z.string().optional(),
  priorities: z.array(z.string()).default([]),
  context: z.string().optional(),
  channelHandles: z.record(z.string()).default({}),
  externalId: z.string().optional(),
  avatarUrl: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).default([]),
})

export const UpdatePersonSchema = CreatePersonSchema.partial()

export const CreatePersonThreadSchema = z.object({
  agentId: z.string().min(1),
  channel: z.enum(['telegram', 'teams', 'email', 'other']),
  threadId: z.string().optional(),
  summary: z.string().optional(),
  lastMessageAt: z.string().datetime().optional(),
})
