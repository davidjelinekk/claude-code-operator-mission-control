import { useQuery, useMutation } from '@tanstack/react-query'
import { api, queryClient } from '@/lib/api'
import type { Approval } from './approvals'

export type { Approval }

export interface Board {
  id: string
  name: string
  slug: string
  description?: string
  gatewayAgentId?: string
  boardGroupId?: string | null
  objective?: string | null
  targetDate?: string | null
  goalConfirmed?: boolean
  requireApprovalForDone?: boolean
  requireReviewBeforeDone?: boolean
  commentRequiredForReview?: boolean
  blockStatusChangesWithPendingApproval?: boolean
  onlyLeadCanChangeStatus?: boolean
  maxAgents?: number
  taskCount?: number
  lastActivity?: string
  pendingApprovals?: number
}

export interface BoardSnapshot {
  board: Board
  tasks: Task[]
  approvals: Approval[]
}

export interface Task {
  id: string
  boardId: string
  title: string
  description?: string
  status: 'inbox' | 'in_progress' | 'review' | 'done'
  priority: 'low' | 'medium' | 'high'
  assignedAgentId?: string
  dueDate?: string
  depCount?: number
  pendingApproval?: boolean
  outcome?: 'success' | 'failed' | 'partial' | 'abandoned' | null
  completedAt?: string | null
  inProgressAt?: string | null
  createdAt?: string
  updatedAt?: string
  tags?: Array<{ id: string; name: string; color: string }>
}


export function useBoards() {
  return useQuery<Board[]>({
    queryKey: ['boards'],
    queryFn: () => api.get('api/boards').json<Board[]>(),
  })
}

export function useCreateBoard() {
  return useMutation({
    mutationFn: (data: { name: string; description?: string; gatewayAgentId?: string }) =>
      api.post('api/boards', { json: data }).json<Board>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boards'] })
    },
  })
}

export function useUpdateBoard(boardId: string) {
  return useMutation({
    mutationFn: (data: Partial<Omit<Board, 'id' | 'taskCount' | 'lastActivity' | 'pendingApprovals'>>) =>
      api.patch(`api/boards/${boardId}`, { json: data }).json<Board>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', boardId, 'snapshot'] })
      queryClient.invalidateQueries({ queryKey: ['boards'] })
    },
  })
}
