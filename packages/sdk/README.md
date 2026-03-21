<p align="center">
  <img src="../../docs/cc-operator-hero.png" alt="Claude Code Operator" width="600" />
</p>

# @cc-operator/sdk

TypeScript SDK for the [Claude Code Operator](https://github.com/davidjelinekk/claude-code-operator-mission-control) API.

<p align="center">
  <img src="../../docs/cc-operator-architecture.png" alt="Architecture" width="600" />
</p>

## Install

```bash
npm install @cc-operator/sdk
```

## Quick Start

```typescript
import { CCOperator } from '@cc-operator/sdk'

const op = new CCOperator({
  baseUrl: 'http://localhost:3001',
  token: process.env.CC_OPERATOR_TOKEN,
})

// List boards
const boards = await op.boards.list()

// Create a task
const task = await op.tasks.create({
  boardId: boards[0].id,
  title: 'Fix the login bug',
})

// Spawn an agent session
const session = await op.sessions.spawn({
  prompt: 'Investigate and fix the login bug',
  agent: 'debugger',
  boardId: boards[0].id,
})

// Stream session output
for await (const event of op.sessions.stream(session.sessionId)) {
  if (event.event === 'message') {
    const data = JSON.parse(event.data)
    if (data.content) process.stdout.write(data.content)
  }
}
```

## Resources

| Resource | Methods |
|----------|---------|
| `op.boards` | `list`, `create`, `get`, `update`, `delete`, `summary`, `snapshot` |
| `op.tasks` | `list`, `create`, `get`, `update`, `delete`, `queue`, `batch`, `overdue`, `claim`, `cancel`, `notes`, `addNote`, `deps`, `addDep`, `removeDep` |
| `op.sessions` | `spawn`, `list`, `get`, `abort`, `stream`, `status`, `interrupt`, `rename`, `tag`, `fork`, `mcpStatus`, `accountInfo`, `mcpServers`, `historical` |
| `op.agents` | `list`, `get`, `create`, `update`, `delete` |
| `op.projects` | `list`, `create`, `get`, `update`, `delete`, `addTask`, `removeTask`, `kickoff`, `progress`, `updateTaskExecution`, `initWorkspace` |
| `op.skills` | `list`, `get`, `refresh` |
| `op.scripts` | `list`, `get`, `create`, `delete`, `test`, `refresh` |
| `op.contextGraph` | `entities`, `getEntity`, `subgraph`, `createEntity`, `addObservation`, `search`, `stats` |
| `op.agentBus` | `send`, `inbox`, `agents` |
| `op.search` | `query`, `semantic` |
| `op.analytics` | `summary`, `byAgent`, `byModel`, `timeseries`, `byProject`, `taskVelocity`, `taskOutcomes` |
| `op.approvals` | `list`, `get`, `create`, `updateStatus`, `delete`, `streamUrl` |
| `op.webhooks` | `list`, `create`, `get`, `update`, `delete`, `test` |
| `op.tags` | `list`, `create`, `get`, `update`, `delete`, `taskTags`, `addTagToTask`, `removeTagFromTask` |
| `op.flow` | `graph`, `listEdges`, `createEdge` |
| `op.activity` | `list`, `create`, `streamUrl` |
| `op.cron` | `list`, `create`, `delete`, `run`, `runs` |
| `op.people` | `list`, `create`, `get`, `update`, `delete`, `addThread`, `updateThread`, `deleteThread`, `listTasks`, `linkTask`, `unlinkTask`, `linkProject`, `unlinkProject` |
| `op.system` | `health` |

## Requirements

- Node.js >= 22
- A running Claude Code Operator instance

## License

MIT
