export { CCOperator } from './client.js'
export { CCOperatorError } from './types.js'
export type {
  CCOperatorConfig,
  SSEEvent,
  SpawnParams,
  SessionSummary,
  SessionDetail,
  AgentBusMessage,
  ContextGraphEntity,
  ContextGraphObservation,
  AnalyticsQuery,
  TimeseriesQuery,
} from './types.js'

// Re-export shared types for convenience
export type {
  Board, CreateBoard, UpdateBoard,
  Task, CreateTask, UpdateTask, TaskStatus, TaskPriority,
  Agent, AgentStatus,
  SkillSnapshot, SkillType,
  Project, CreateProject, UpdateProject, ProjectStatus, ProjectTask, ExecutionMode,
  TokenEvent, AnalyticsSummary, AgentAnalytics, TimeseriesPoint,
  SessionInfo,
  FlowEdge,
  Approval, ApprovalStatus, TaskDependency,
  CronJob,
} from '@claude-code-operator/shared-types'
