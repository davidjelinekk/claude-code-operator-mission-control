import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { customType } from 'drizzle-orm/pg-core'

// pgvector column type (768-dim for nomic-embed-text)
export const vector = customType<{ data: string; driverData: string }>({
  dataType() { return 'vector(768)' },
  toDriver(value: string) { return value },
  fromDriver(value: unknown) { return value as string },
})

// ---- board groups ----
export const boardGroups = pgTable('board_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---- boards ----
export const boards = pgTable('boards', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  gatewayAgentId: text('gateway_agent_id'),
  requireApprovalForDone: boolean('require_approval_for_done').notNull().default(false),
  boardGroupId: uuid('board_group_id').references(() => boardGroups.id, { onDelete: 'set null' }),
  objective: text('objective'),
  targetDate: timestamp('target_date', { withTimezone: true }),
  goalConfirmed: boolean('goal_confirmed').notNull().default(false),
  requireReviewBeforeDone: boolean('require_review_before_done').notNull().default(false),
  commentRequiredForReview: boolean('comment_required_for_review').notNull().default(false),
  blockStatusChangesWithPendingApproval: boolean('block_status_changes_with_pending_approval').notNull().default(false),
  onlyLeadCanChangeStatus: boolean('only_lead_can_change_status').notNull().default(false),
  maxAgents: integer('max_agents').notNull().default(10),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---- projects ----
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull().default('planning'),
  progressPct: smallint('progress_pct').notNull().default(0),
  targetDate: timestamp('target_date', { withTimezone: true }),
  orchestratorAgentId: text('orchestrator_agent_id'),
  workspacePath: text('workspace_path'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const projectTasks = pgTable(
  'project_tasks',
  {
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    executionMode: text('execution_mode').notNull().default('sequential'),
  },
  (t) => [
    unique().on(t.projectId, t.taskId),
    index('idx_project_tasks_position').on(t.projectId, t.position),
  ],
)

export const projectTaskDeps = pgTable(
  'project_task_deps',
  {
    projectId: uuid('project_id').notNull(),
    taskId: uuid('task_id').notNull(),
    dependsOnTaskId: uuid('depends_on_task_id').notNull(),
  },
  (t) => [unique().on(t.projectId, t.taskId, t.dependsOnTaskId)],
)

// ---- tasks ----
export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  boardId: uuid('board_id').notNull().references(() => boards.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('inbox'),
  priority: text('priority').notNull().default('medium'),
  assignedAgentId: text('assigned_agent_id'),
  dueAt: timestamp('due_at', { withTimezone: true }),
  inProgressAt: timestamp('in_progress_at', { withTimezone: true }),
  outcome: text('outcome'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  autoCreated: boolean('auto_created').notNull().default(false),
  autoReason: text('auto_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_tasks_board_status').on(t.boardId, t.status),
  index('idx_tasks_board_created').on(t.boardId, t.createdAt),
  index('idx_tasks_project').on(t.projectId),
  index('idx_tasks_assigned_agent').on(t.assignedAgentId),
  index('idx_tasks_due_at').on(t.dueAt),
])

export const taskDependencies = pgTable(
  'task_dependencies',
  {
    taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    dependsOnTaskId: uuid('depends_on_task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  },
  (t) => [
    unique().on(t.taskId, t.dependsOnTaskId),
    index('idx_task_deps_depends_on').on(t.dependsOnTaskId),
  ],
)

export const approvals = pgTable('approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  boardId: uuid('board_id').notNull().references(() => boards.id, { onDelete: 'cascade' }),
  taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
  agentId: text('agent_id').notNull(),
  actionType: text('action_type').notNull(),
  payload: jsonb('payload'),
  confidence: text('confidence'),
  status: text('status').notNull().default('pending'),
  rubricScores: jsonb('rubric_scores'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, (t) => [
  index('idx_approvals_board_status').on(t.boardId, t.status),
  index('idx_approvals_task_status').on(t.taskId, t.status),
  index('idx_approvals_board_created').on(t.boardId, t.createdAt),
])

// ---- analytics ----
export const tokenEvents = pgTable(
  'token_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: text('agent_id').notNull(),
    sessionId: text('session_id').notNull(),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    provider: text('provider').notNull(),
    modelId: text('model_id').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
    cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
    costUsd: text('cost_usd').notNull().default('0'),
    turnTimestamp: timestamp('turn_timestamp', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_token_events_agent_turn').on(t.agentId, t.turnTimestamp),
    index('idx_token_events_session').on(t.sessionId),
    index('idx_token_events_project').on(t.projectId),
  ],
)

export const analyticsWatermarks = pgTable(
  'analytics_watermarks',
  {
    agentId: text('agent_id').notNull(),
    sessionId: text('session_id').notNull(),
    byteOffset: integer('byte_offset').notNull().default(0),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.agentId, t.sessionId)],
)

// ---- flow ----
export const agentFlowEdges = pgTable(
  'agent_flow_edges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fromAgentId: text('from_agent_id').notNull(),
    toAgentId: text('to_agent_id').notNull(),
    messageType: text('message_type').notNull(),
    sessionId: text('session_id'),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    tokenCost: text('token_cost'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    rawLogLine: text('raw_log_line'),
  },
  (t) => [
    index('idx_flow_from_agent').on(t.fromAgentId, t.occurredAt),
    index('idx_flow_to_agent').on(t.toAgentId, t.occurredAt),
  ],
)

// ---- skills ----
export const skillSnapshots = pgTable('skill_snapshots', {
  skillId: text('skill_id').primaryKey(),
  displayName: text('display_name').notNull(),
  description: text('description'),
  skillType: text('skill_type').notNull().default('skill'),
  isInstalled: boolean('is_installed').notNull().default(true),
  configJson: jsonb('config_json'),
  requiredEnv: jsonb('required_env').notNull().default([]),
  dependencies: jsonb('dependencies').notNull().default([]),
  scannedAt: timestamp('scanned_at', { withTimezone: true }).notNull().defaultNow(),
})

export const agentSkills = pgTable(
  'agent_skills',
  {
    agentId: text('agent_id').notNull(),
    skillId: text('skill_id').notNull().references(() => skillSnapshots.skillId, { onDelete: 'cascade' }),
  },
  (t) => [unique().on(t.agentId, t.skillId)],
)

// ---- people ----
export const people = pgTable('people', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  source: text('source').notNull().default('manual'), // 'telegram' | 'teams' | 'email' | 'manual' | 'form'
  externalId: text('external_id'),   // e.g. Telegram user ID
  avatarUrl: text('avatar_url'),
  notes: text('notes'),
  tags: jsonb('tags').$type<string[]>().default([]),
  role: text('role'),
  relationship: text('relationship'),
  priorities: jsonb('priorities').$type<string[]>().default([]),
  context: text('context'),
  channelHandles: jsonb('channel_handles').$type<Record<string, string>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('people_source_idx').on(t.source),
  index('people_email_idx').on(t.email),
])

export const personThreads = pgTable('person_threads', {
  id: uuid('id').primaryKey().defaultRandom(),
  personId: uuid('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  agentId: text('agent_id').notNull(),
  channel: text('channel').notNull(), // 'telegram' | 'teams' | 'email' | 'other'
  threadId: text('thread_id'),
  summary: text('summary'),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_person_threads_person').on(t.personId),
])

export const personTasks = pgTable('person_tasks', {
  personId: uuid('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
}, (t) => [
  primaryKey({ columns: [t.personId, t.taskId] }),
])

export const personProjects = pgTable('person_projects', {
  personId: uuid('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
}, (t) => [
  primaryKey({ columns: [t.personId, t.projectId] }),
])

// ---- tags ----
export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  color: text('color').notNull().default('6e7681'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const taskTags = pgTable(
  'task_tags',
  {
    taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [unique().on(t.taskId, t.tagId)],
)

// ---- activity events ----
export const activityEvents = pgTable(
  'activity_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id').references(() => boards.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    agentId: text('agent_id'),
    eventType: text('event_type').notNull(),
    message: text('message').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_activity_board_created').on(t.boardId, t.createdAt),
    index('idx_activity_task_created').on(t.taskId, t.createdAt),
    index('idx_activity_event_type_created').on(t.eventType, t.createdAt),
  ],
)

// ---- board memory ----
export const boardMemory = pgTable(
  'board_memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id').notNull().references(() => boards.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    tags: jsonb('tags').$type<string[]>().default([]),
    isChat: boolean('is_chat').notNull().default(false),
    source: text('source'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_board_memory_board_created').on(t.boardId, t.createdAt)],
)

// ---- custom fields ----
export const taskCustomFieldDefinitions = pgTable('task_custom_field_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  fieldKey: text('field_key').notNull().unique(),
  label: text('label').notNull(),
  fieldType: text('field_type').notNull().default('text'),
  uiVisibility: text('ui_visibility').notNull().default('always'),
  description: text('description'),
  required: boolean('required').notNull().default(false),
  defaultValue: jsonb('default_value'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const boardTaskCustomFields = pgTable(
  'board_task_custom_fields',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id').notNull().references(() => boards.id, { onDelete: 'cascade' }),
    definitionId: uuid('definition_id').notNull().references(() => taskCustomFieldDefinitions.id, { onDelete: 'cascade' }),
  },
  (t) => [unique().on(t.boardId, t.definitionId)],
)

export const taskCustomFieldValues = pgTable(
  'task_custom_field_values',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    definitionId: uuid('definition_id').notNull().references(() => taskCustomFieldDefinitions.id, { onDelete: 'cascade' }),
    value: jsonb('value'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.taskId, t.definitionId)],
)

// ---- task planning sessions ----
export const taskPlanningSessions = pgTable(
  'task_planning_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    boardId: uuid('board_id').notNull().references(() => boards.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('active'),
    messages: jsonb('messages').$type<Array<{ role: string; content: string; timestamp: string }>>().default([]),
    planningSpec: jsonb('planning_spec'),
    suggestedAgents: jsonb('suggested_agents'),
    sessionKey: text('session_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_planning_task_status').on(t.taskId, t.status)],
)

// ---- auth ----
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('operator'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('idx_sessions_user_id').on(t.userId),
    index('idx_sessions_expires_at').on(t.expiresAt),
  ],
)

// ---- webhooks ----
export const webhooks = pgTable('webhooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  url: text('url').notNull(),
  secret: text('secret'),
  events: jsonb('events').$type<string[]>().notNull(),
  boardId: uuid('board_id').references(() => boards.id, { onDelete: 'cascade' }),
  active: boolean('active').notNull().default(true),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_webhooks_board').on(t.boardId),
])

// ---- task templates ----
export const taskTemplates = pgTable('task_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  boardId: uuid('board_id').references(() => boards.id, { onDelete: 'set null' }),
  template: jsonb('template').$type<{
    title: string
    description?: string
    priority?: string
    assignedAgentId?: string
    tags?: string[]
  }>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---- skill packs ----
export const skillPacks = pgTable('skill_packs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  version: text('version').notNull().default('1.0.0'),
  skills: jsonb('skills').$type<string[]>().default([]),
  mcpServers: jsonb('mcp_servers').$type<Record<string, unknown>>().default({}),
  installStatus: text('install_status').notNull().default('available'),
  installError: text('install_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---- embeddings (Phase 1: pgvector) ----
export const embeddings = pgTable(
  'embeddings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceTable: text('source_table').notNull(),
    sourceId: text('source_id').notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_embeddings_source').on(t.sourceTable, t.sourceId),
    index('idx_embeddings_source').on(t.sourceTable, t.sourceId),
  ],
)

// ---- context graph (Phase 2) ----
export const ctxEntities = pgTable(
  'ctx_entities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    entityType: text('entity_type').notNull(),
    description: text('description'),
    abstract: text('abstract'),
    properties: jsonb('properties').$type<Record<string, unknown>>(),
    boardId: uuid('board_id').references(() => boards.id, { onDelete: 'set null' }),
    confidence: real('confidence').default(1.0),
    sourceType: text('source_type').notNull().default('extraction'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_ctx_entities_type_board').on(t.entityType, t.boardId),
    index('idx_ctx_entities_name').on(t.name, t.entityType),
  ],
)

export const ctxRelations = pgTable(
  'ctx_relations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fromEntityId: uuid('from_entity_id').notNull().references(() => ctxEntities.id, { onDelete: 'cascade' }),
    toEntityId: uuid('to_entity_id').notNull().references(() => ctxEntities.id, { onDelete: 'cascade' }),
    relationType: text('relation_type').notNull(),
    properties: jsonb('properties').$type<Record<string, unknown>>(),
    sourceEventId: uuid('source_event_id').references(() => activityEvents.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_ctx_relation').on(t.fromEntityId, t.toEntityId, t.relationType),
    index('idx_ctx_relations_from').on(t.fromEntityId, t.relationType),
    index('idx_ctx_relations_to').on(t.toEntityId, t.relationType),
  ],
)

export const ctxObservations = pgTable(
  'ctx_observations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityId: uuid('entity_id').notNull().references(() => ctxEntities.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    abstract: text('abstract'),
    observationType: text('observation_type').default('fact'),
    source: text('source').default('session'),
    sourceId: text('source_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_ctx_observations_entity').on(t.entityId, t.createdAt),
  ],
)

export const ctxExtractionWatermarks = pgTable('ctx_extraction_watermarks', {
  eventType: text('event_type').primaryKey(),
  lastEventAt: timestamp('last_event_at', { withTimezone: true }),
  lastProcessedAt: timestamp('last_processed_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---- agent messages (inter-agent communication bus) ----
export const agentMessages = pgTable(
  'agent_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id').notNull().references(() => boards.id, { onDelete: 'cascade' }),
    fromAgentId: text('from_agent_id').notNull(),
    toAgentId: text('to_agent_id').notNull(),
    content: text('content').notNull(),
    priority: text('priority').notNull().default('normal'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_agent_messages_inbox').on(t.boardId, t.toAgentId, t.createdAt),
    index('idx_agent_messages_from').on(t.boardId, t.fromAgentId, t.createdAt),
  ],
)

// ---- session archives (session compression + structured summaries) ----
export const sessionArchives = pgTable(
  'session_archives',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: text('session_id').notNull().unique(),
    boardId: uuid('board_id').references(() => boards.id, { onDelete: 'set null' }),
    agentId: text('agent_id'),
    summary: text('summary').notNull(),
    keyDecisions: jsonb('key_decisions').$type<string[]>().default([]),
    keyOutcomes: jsonb('key_outcomes').$type<string[]>().default([]),
    errorPatterns: jsonb('error_patterns').$type<string[]>().default([]),
    tokenCost: text('token_cost'),
    turnCount: integer('turn_count'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_session_archives_board').on(t.boardId, t.createdAt),
    index('idx_session_archives_agent').on(t.agentId, t.createdAt),
  ],
)
