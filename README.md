# Claude Code Operator — Mission Control

Workflow orchestration dashboard purpose-built for **Claude Code**. Manage agents, skills, sessions, hooks, MCP servers, and project boards — all from a single operator interface.

## Architecture

```
apps/
  api/          Hono API server (Node 22+, PostgreSQL, Redis)
  web/          React 19 SPA (TanStack Router/Query, Tailwind, Vite)
packages/
  shared-types/ Zod schemas shared between API and web
  tsconfig/     Shared TypeScript configs
```

## What It Does

- **Boards & Tasks** — Kanban-style project management with agent assignment, approvals, dependencies
- **Agent Management** — Discover and manage agents from `~/.claude/agents/*.md`
- **Skill Discovery** — Browse skills from `~/.claude/skills/` and MCP servers from `settings.json`
- **Session Analytics** — Ingest token usage from `~/.claude/projects/*/` JSONL session logs
- **Flow Visualization** — Real-time agent communication graph
- **Hooks Dashboard** — View configured Claude Code hooks
- **MCP Server Management** — List MCP servers from settings
- **Orchestration** — Agent SDK status and session management (requires `ANTHROPIC_API_KEY`)
- **Approval Workflows** — Confidence-scored approvals with board-level governance policies
- **Project Orchestration** — Group tasks into projects with sequential/parallel execution
- **Real-Time Events** — WebSocket, SSE, Redis pub/sub, and outbound webhooks

## Setup

```bash
# Prerequisites: Node 22+, pnpm 10+, PostgreSQL, Redis

# Install
pnpm install

# Configure
cp apps/api/.env.example apps/api/.env
# Edit .env: DATABASE_URL, OPERATOR_TOKEN, REDIS_URL

# Database
createdb cc_operator
cd apps/api && pnpm db:migrate

# Run
pnpm dev
# API: http://localhost:3001
# Web: http://localhost:5173
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPERATOR_TOKEN` | (required) | API authentication token |
| `DATABASE_URL` | `postgresql://localhost:5432/cc_operator` | PostgreSQL connection |
| `REDIS_URL` | `redis://127.0.0.1:6379/2` | Redis connection |
| `CLAUDE_HOME` | `~/.claude` | Claude Code config directory |
| `ANTHROPIC_API_KEY` | (optional) | Enables orchestration mode |

## Claude Code Integration

Reads from the standard `~/.claude/` directory:

- `agents/*.md` — Agent definitions (YAML frontmatter + prompt)
- `skills/*/SKILL.md` — Skill definitions
- `settings.json` — Global settings, MCP servers, hooks
- `projects/*/` — Session JSONL logs for analytics
- `cron/jobs.json` — Scheduled tasks

## Tech Stack

| Layer | Tech |
|-------|------|
| API | Node.js 22, Hono, Drizzle ORM, PostgreSQL, Redis, WebSockets |
| Web | React 19, TanStack Router, Tailwind CSS, Vite |
| Shared | Zod schemas (`@claude-code-operator/shared-types`) |
| Monorepo | pnpm workspaces + Turborepo |

## License

[MIT](LICENSE)
