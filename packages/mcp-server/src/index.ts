#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const BASE_URL = process.env.OPERATOR_URL ?? 'http://localhost:3001'
const TOKEN = process.env.OPERATOR_TOKEN ?? ''

async function api(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${TOKEN}`,
    'User-Agent': 'cc-operator-mcp/0.1.0',
  }
  if (body) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  try {
    return { status: res.status, data: JSON.parse(text) }
  } catch {
    return { status: res.status, data: text }
  }
}

const server = new McpServer({
  name: 'Claude Code Operator',
  version: '0.1.0',
})

// ── System ──

server.tool(
  'operator_status',
  'Get Operator system status — health, SDK availability, active sessions, database and Redis connectivity',
  {},
  async () => {
    const [health, sdk] = await Promise.all([
      api('GET', '/health'),
      api('GET', '/api/system/status'),
    ])
    return { content: [{ type: 'text', text: JSON.stringify({ health: health.data, system: sdk.data }, null, 2) }] }
  },
)

// ── Boards ──

server.tool(
  'operator_list_boards',
  'List all boards with task counts and recent activity',
  {},
  async () => {
    const res = await api('GET', '/api/boards')
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] }
  },
)

server.tool(
  'operator_create_board',
  'Create a new board for organizing tasks and agents',
  {
    name: z.string().describe('Board name'),
    description: z.string().optional().describe('Board description'),
    requireApprovalForDone: z.boolean().optional().describe('Require approval before marking tasks done'),
    requireReviewBeforeDone: z.boolean().optional().describe('Tasks must pass through review status before done'),
  },
  async ({ name, description, requireApprovalForDone, requireReviewBeforeDone }) => {
    const res = await api('POST', '/api/boards', {
      name,
      description,
      requireApprovalForDone: requireApprovalForDone ?? false,
      requireReviewBeforeDone: requireReviewBeforeDone ?? false,
    })
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] }
  },
)

server.tool(
  'operator_board_summary',
  'Get board summary with task counts by status, pending approvals, and recent activity',
  {
    boardId: z.string().describe('Board UUID'),
  },
  async ({ boardId }) => {
    const res = await api('GET', `/api/boards/${boardId}/summary`)
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] }
  },
)

// ── Tasks ──

server.tool(
  'operator_list_tasks',
  'List tasks, optionally filtered by board, status, or assigned agent',
  {
    boardId: z.string().optional().describe('Filter by board UUID'),
    status: z.string().optional().describe('Filter by status: inbox, in_progress, review, done'),
    limit: z.number().optional().describe('Max results (default 50)'),
  },
  async ({ boardId, status, limit }) => {
    const params = new URLSearchParams()
    if (boardId) params.set('boardId', boardId)
    if (status) params.set('status', status)
    if (limit) params.set('limit', String(limit))
    const q = params.toString()
    const res = await api('GET', `/api/tasks${q ? `?${q}` : ''}`)
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] }
  },
)

server.tool(
  'operator_create_task',
  'Create a new task on a board',
  {
    boardId: z.string().describe('Board UUID'),
    title: z.string().describe('Task title'),
    description: z.string().optional().describe('Task description'),
    priority: z.enum(['low', 'medium', 'high']).optional().describe('Priority level'),
  },
  async ({ boardId, title, description, priority }) => {
    const res = await api('POST', '/api/tasks', {
      boardId,
      title,
      description,
      priority: priority ?? 'medium',
    })
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] }
  },
)

server.tool(
  'operator_update_task',
  'Update a task status, assignment, or details',
  {
    taskId: z.string().describe('Task UUID'),
    status: z.enum(['inbox', 'in_progress', 'review', 'done']).optional().describe('New status'),
    assignedAgentId: z.string().optional().describe('Agent to assign'),
    title: z.string().optional().describe('New title'),
    priority: z.enum(['low', 'medium', 'high']).optional().describe('New priority'),
  },
  async ({ taskId, ...updates }) => {
    const body: Record<string, unknown> = {}
    if (updates.status) body.status = updates.status
    if (updates.assignedAgentId) body.assignedAgentId = updates.assignedAgentId
    if (updates.title) body.title = updates.title
    if (updates.priority) body.priority = updates.priority
    const res = await api('PATCH', `/api/tasks/${taskId}`, body)
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] }
  },
)

server.tool(
  'operator_task_queue',
  'Get the prioritized task queue — tasks ready for agents to claim',
  {
    boardId: z.string().optional().describe('Filter by board'),
    respectDeps: z.boolean().optional().describe('Only show tasks with resolved dependencies'),
  },
  async ({ boardId, respectDeps }) => {
    const params = new URLSearchParams()
    if (boardId) params.set('boardId', boardId)
    if (respectDeps) params.set('respectDeps', 'true')
    const q = params.toString()
    const res = await api('GET', `/api/tasks/queue${q ? `?${q}` : ''}`)
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] }
  },
)

// ── Agent Orchestration ──

server.tool(
  'operator_spawn_agent',
  'Spawn a governed Claude agent session with context injection, tool governance, and cost tracking',
  {
    prompt: z.string().describe('The task prompt for the agent'),
    boardId: z.string().optional().describe('Board UUID — enables governance and context injection'),
    taskId: z.string().optional().describe('Task UUID — links session to a specific task'),
    model: z.string().optional().describe('Model: claude-sonnet-4-6, claude-opus-4-6, claude-haiku-4-5-20251001'),
    maxTurns: z.number().optional().describe('Max conversation turns (default 10)'),
    maxBudgetUsd: z.number().optional().describe('Budget cap in USD'),
    effort: z.enum(['low', 'medium', 'high', 'max']).optional().describe('Effort level'),
    permissionMode: z.enum(['default', 'acceptEdits', 'plan', 'dontAsk']).optional().describe('Permission mode'),
    sandbox: z.boolean().optional().describe('Enable sandbox isolation'),
    agent: z.string().optional().describe('Agent name from ~/.claude/agents/'),
  },
  async ({ prompt, boardId, taskId, model, maxTurns, maxBudgetUsd, effort, permissionMode, sandbox, agent }) => {
    const body: Record<string, unknown> = { prompt }
    if (boardId) body.boardId = boardId
    if (taskId) body.taskId = taskId
    if (model) body.model = model
    if (maxTurns) body.maxTurns = maxTurns
    if (maxBudgetUsd) body.maxBudgetUsd = maxBudgetUsd
    if (effort) body.effort = effort
    if (permissionMode) body.permissionMode = permissionMode
    if (sandbox) body.sandbox = sandbox
    if (agent) body.agent = agent
    const res = await api('POST', '/api/agent-sdk/spawn', body)
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] }
  },
)

server.tool(
  'operator_list_sessions',
  'List active and recent agent sessions',
  {},
  async () => {
    const res = await api('GET', '/api/agent-sdk/sessions')
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] }
  },
)

server.tool(
  'operator_session_detail',
  'Get detailed session info including messages and result',
  {
    sessionId: z.string().describe('Session UUID'),
  },
  async ({ sessionId }) => {
    const res = await api('GET', `/api/agent-sdk/sessions/${sessionId}`)
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] }
  },
)

// ── Approvals ──

server.tool(
  'operator_list_approvals',
  'List pending approvals that need human review',
  {
    boardId: z.string().optional().describe('Filter by board'),
    status: z.enum(['pending', 'approved', 'rejected']).optional().describe('Filter by status'),
  },
  async ({ boardId, status }) => {
    const params = new URLSearchParams()
    if (boardId) params.set('boardId', boardId)
    if (status) params.set('status', status)
    const q = params.toString()
    const res = await api('GET', `/api/approvals${q ? `?${q}` : ''}`)
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] }
  },
)

server.tool(
  'operator_resolve_approval',
  'Approve or reject a pending approval',
  {
    approvalId: z.string().describe('Approval UUID'),
    status: z.enum(['approved', 'rejected']).describe('Decision'),
  },
  async ({ approvalId, status }) => {
    const res = await api('PATCH', `/api/approvals/${approvalId}`, { status })
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] }
  },
)

// ── Analytics ──

server.tool(
  'operator_analytics',
  'Get cost and usage analytics — total spend, by agent, by model',
  {
    start: z.string().optional().describe('Start date (ISO)'),
    end: z.string().optional().describe('End date (ISO)'),
  },
  async ({ start, end }) => {
    const params = new URLSearchParams()
    if (start) params.set('start', start)
    if (end) params.set('end', end)
    const q = params.toString()
    const res = await api('GET', `/api/analytics/summary${q ? `?${q}` : ''}`)
    return { content: [{ type: 'text', text: JSON.stringify(res.data, null, 2) }] }
  },
)

// ── Start ──

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error('MCP server error:', err)
  process.exit(1)
})
