import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface AnalyticsSummary {
  totalCostUsd: string
  cacheHitPct: number
  totalInputTokens: number
  totalOutputTokens: number
  mostExpensiveAgent: { agentId: string; name: string; totalCostUsd: string } | null
}

export interface AnalyticsTimeseriesItem {
  bucket: string
  agentId: string
  costUsd: string
  tokens: number
}

export interface AnalyticsByAgent {
  agentId: string
  totalCostUsd: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  turnCount: number
}

export interface AnalyticsByModel {
  modelId: string
  costUsd: string
  inputTokens: number
  outputTokens: number
}

export interface AnalyticsByProject {
  projectId: string
  name: string
  costUsd: string
  taskCount: number
}

function buildParams(start: string, end: string) {
  return new URLSearchParams({ start, end }).toString()
}

export function useAnalyticsSummary(start: string, end: string) {
  return useQuery<AnalyticsSummary>({
    queryKey: ['analytics', 'summary', start, end],
    queryFn: () => api.get(`api/analytics/summary?${buildParams(start, end)}`).json<AnalyticsSummary>(),
  })
}

export function useAnalyticsTimeseries(start: string, end: string) {
  return useQuery<AnalyticsTimeseriesItem[]>({
    queryKey: ['analytics', 'timeseries', start, end],
    queryFn: () =>
      api
        .get(`api/analytics/timeseries?${new URLSearchParams({ start, end, bucket: 'hourly' }).toString()}`)
        .json<AnalyticsTimeseriesItem[]>(),
  })
}

export function useAnalyticsByAgent(start: string, end: string) {
  return useQuery<AnalyticsByAgent[]>({
    queryKey: ['analytics', 'by-agent', start, end],
    queryFn: () => api.get(`api/analytics/by-agent?${buildParams(start, end)}`).json<AnalyticsByAgent[]>(),
  })
}

export function useAnalyticsByModel(start: string, end: string) {
  return useQuery<AnalyticsByModel[]>({
    queryKey: ['analytics', 'by-model', start, end],
    queryFn: () => api.get(`api/analytics/by-model?${buildParams(start, end)}`).json<AnalyticsByModel[]>(),
  })
}

export function useAnalyticsByProject(start: string, end: string) {
  return useQuery<AnalyticsByProject[]>({
    queryKey: ['analytics', 'by-project', start, end],
    queryFn: () => api.get(`api/analytics/by-project?${buildParams(start, end)}`).json<AnalyticsByProject[]>(),
  })
}

export interface TaskVelocityItem {
  date: string
  count: number
}

export interface TaskOutcomeItem {
  outcome: string | null
  count: number
}

function buildParamsWithBoard(start: string, end: string, boardId?: string) {
  const p = new URLSearchParams({ start, end })
  if (boardId) p.set('boardId', boardId)
  return p.toString()
}

export function useTaskVelocity(start: string, end: string, boardId?: string) {
  return useQuery<TaskVelocityItem[]>({
    queryKey: ['analytics', 'task-velocity', start, end, boardId],
    queryFn: () =>
      api.get(`api/analytics/task-velocity?${buildParamsWithBoard(start, end, boardId)}`).json<TaskVelocityItem[]>(),
  })
}

export function useTaskOutcomes(start: string, end: string, boardId?: string) {
  return useQuery<TaskOutcomeItem[]>({
    queryKey: ['analytics', 'task-outcomes', start, end, boardId],
    queryFn: () =>
      api.get(`api/analytics/task-outcomes?${buildParamsWithBoard(start, end, boardId)}`).json<TaskOutcomeItem[]>(),
  })
}
