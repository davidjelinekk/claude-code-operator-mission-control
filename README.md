<p align="center">
  <img src="apps/web/public/vite.svg" alt="CC Operator" width="48" />
</p>

<h1 align="center">Claude Code Operator — Mission Control</h1>

<p align="center">
  Workflow orchestration dashboard purpose-built for <strong>Claude Code</strong>.<br />
  Manage agents, skills, CLI scripts, sessions, hooks, MCP servers, and project boards — all from a single operator interface.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen" alt="Node 22+" />
  <img src="https://img.shields.io/badge/pnpm-%3E%3D10-orange" alt="pnpm 10+" />
  <img src="https://img.shields.io/badge/TypeScript-strict-blue" alt="TypeScript strict" />
</p>

---

## Quick Start

```bash
git clone https://github.com/davidjelinekk/claude-code-operator-mission-control.git
cd claude-code-operator-mission-control
pnpm install

# Start PostgreSQL + Redis via Docker
docker compose up -d

# Configure
cp apps/api/.env.example apps/api/.env
# Edit .env — set OPERATOR_TOKEN, AUTH_USER, AUTH_PASS
# DATABASE_URL=postgresql://operator:operator@localhost:5434/cc_operator

# Migrate and run
cd apps/api && pnpm db:migrate && cd ../..
pnpm dev
# API → http://localhost:3001   Web → http://localhost:5173
```

> **No Docker?** See [Homebrew setup](#homebrew-setup) below.

---

## What It Does

- **Boards & Tasks** — Kanban-style project management with agent assignment, approvals, dependencies
- **Agent Management** — Discover and manage agents from `~/.claude/agents/*.md`
- **Skill Discovery** — Browse skills from `~/.claude/skills/` and MCP servers from `settings.json`
- **CLI Scripts** — Executable tools with structured I/O, injectable as MCP tools into agent sessions
- **Orchestration** — Spawn, stream, and manage Agent SDK sessions with full control over model, permissions, effort, agents, scripts, and MCP servers
- **Context Graph RAG** — Semantic search, entity extraction, knowledge graph, intent-aware retrieval, session compression, and automatic context injection
- **Session Analytics** — Ingest token usage from `~/.claude/projects/*/` JSONL session logs
- **Flow Visualization** — Real-time agent communication graph
- **Agent Message Bus** — Inter-agent messaging with direct and broadcast channels
- **Approval Workflows** — Confidence-scored approvals with board-level governance policies
- **Project Orchestration** — Group tasks into projects with sequential/parallel execution
- **Real-Time Events** — WebSocket, SSE, Redis pub/sub, and outbound webhooks

## Architecture

```
apps/
  api/          Hono API server (Node 22+, PostgreSQL, Redis)
  web/          React 19 SPA (TanStack Router/Query, Tailwind, Vite)
packages/
  shared-types/ Zod schemas shared between API and web
  tsconfig/     Shared TypeScript configs
```

## Tech Stack

| Layer | Tech |
|-------|------|
| API | Node.js 22, Hono, Drizzle ORM, PostgreSQL + pgvector, Redis, WebSockets |
| RAG | Ollama (nomic-embed-text), pgvector, Claude Haiku (extraction + reranking + session compression) |
| Web | React 19, TanStack Router, Tailwind CSS, Vite |
| SDK | `@anthropic-ai/claude-agent-sdk` for session orchestration |
| Shared | Zod schemas (`@claude-code-operator/shared-types`) |
| Monorepo | pnpm workspaces + Turborepo |

---

## Setup

### Prerequisites

- **Node.js 22+** — `node --version`
- **pnpm 10+** — `pnpm --version`
- **PostgreSQL 17** — via [Docker](#quick-start) or [Homebrew](#homebrew-setup)
- **Redis** — via [Docker](#quick-start) or [Homebrew](#homebrew-setup)
- **Claude CLI** (optional) — for orchestration: `npm install -g @anthropic-ai/claude-code`
- **Ollama** (optional) — for semantic search: `brew install ollama`

### Homebrew Setup

If you prefer native installs over Docker:

```bash
brew install node pnpm postgresql@17 redis
brew services start postgresql@17
brew services start redis

# Optional: semantic search
brew install ollama pgvector
ollama pull nomic-embed-text
ollama serve
```

### 1. Clone and install

```bash
git clone https://github.com/davidjelinekk/claude-code-operator-mission-control.git
cd claude-code-operator-mission-control
pnpm install
```

### 2. Configure environment

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env`:

```bash
OPERATOR_TOKEN=$(openssl rand -hex 32)
AUTH_USER=admin
AUTH_PASS=<pick-a-strong-password>

# Docker setup
DATABASE_URL=postgresql://operator:operator@localhost:5434/cc_operator
REDIS_URL=redis://127.0.0.1:6379/2

# Or Homebrew setup
# DATABASE_URL=postgresql://localhost:5432/cc_operator
```

### 3. Database

```bash
# If using Homebrew PostgreSQL (Docker auto-creates the database)
createdb cc_operator

# Run Drizzle migrations
cd apps/api && pnpm db:migrate && cd ../..

# Optional: pgvector + context graph + agent messaging
psql $DATABASE_URL -f apps/api/src/db/migrations/9001_pgvector_embeddings.sql
psql $DATABASE_URL -f apps/api/src/db/migrations/9002_context_graph.sql
psql $DATABASE_URL -f apps/api/src/db/migrations/9003_session_archives.sql
psql $DATABASE_URL -f apps/api/src/db/migrations/9004_agent_messages.sql
```

### 4. Run

```bash
pnpm dev
# API: http://localhost:3001
# Web: http://localhost:5173
```

### 5. Verify

```bash
curl http://localhost:3001/health
# → { "status": "ok", ... }
```

### 6. First login

Open http://localhost:5173. Log in with the `AUTH_USER` / `AUTH_PASS` credentials from your `.env`. These seed the initial admin account on first startup.

### Orchestration (optional)

To spawn Agent SDK sessions from the dashboard:

1. Install Claude Code CLI: `npm install -g @anthropic-ai/claude-code`
2. Add `ANTHROPIC_API_KEY` to `apps/api/.env`
3. Ensure `~/.claude/` exists (run `claude` once to bootstrap, or `mkdir -p ~/.claude/{agents,skills,scripts}`)

---

## Dashboard Pages

| Route | Description |
|-------|-------------|
| `/` | Home dashboard |
| `/boards` | Kanban boards with task management |
| `/agents` | Agent discovery and management |
| `/orchestration` | Spawn and monitor Agent SDK sessions |
| `/skills` | Skills + skill packs browser |
| `/scripts` | CLI script management with inline test runner |
| `/flow` | Real-time agent communication graph |
| `/analytics` | Token usage analytics |
| `/cron` | Scheduled task management |
| `/approvals` | Approval workflow queue |
| `/projects` | Multi-task project orchestration |
| `/people` | Contact/collaborator management |
| `/activity` | Activity event feed |
| `/settings` | System configuration |

---

## API Reference

### Orchestration (Agent SDK)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/agent-sdk/status` | GET | SDK availability and config |
| `/api/agent-sdk/spawn` | POST | Spawn session (supports `scripts` array for CLI script injection) |
| `/api/agent-sdk/sessions` | GET | List active + historical sessions |
| `/api/agent-sdk/sessions/:id` | GET | Session detail with messages |
| `/api/agent-sdk/sessions/:id/abort` | POST | Stop running session |
| `/api/agent-sdk/sessions/:id/stream` | GET | SSE for real-time session events |
| `/api/agent-sdk/sessions/:id/interrupt` | POST | Interrupt session |
| `/api/agent-sdk/sessions/:id/rename` | POST | Rename session |
| `/api/agent-sdk/sessions/:id/tag` | POST | Tag session |
| `/api/agent-sdk/sessions/:id/fork` | POST | Fork session |
| `/api/agent-sdk/sessions/:id/mcp-status` | GET | MCP server status |
| `/api/agent-sdk/sessions/:id/account-info` | GET | Account info |
| `/api/agent-sdk/mcp-servers` | GET | Available MCP servers |

### Scripts

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/scripts` | GET | List all discovered scripts |
| `/api/scripts` | POST | Create new script (scaffolds directory + SCRIPT.md + entrypoint) |
| `/api/scripts/refresh` | POST | Re-scan filesystem |
| `/api/scripts/:id` | GET | Script detail with agent assignments |
| `/api/scripts/:id` | PATCH | Update metadata |
| `/api/scripts/:id` | DELETE | Delete script directory |
| `/api/scripts/:id/test` | POST | Execute with test args |

### Script Files

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/script-files/:id/content` | GET | Read SCRIPT.md |
| `/api/script-files/:id/content` | PUT | Update SCRIPT.md |
| `/api/script-files/:id/entrypoint` | GET | Read executable source |
| `/api/script-files/:id/entrypoint` | PUT | Update executable source |

### Skills

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/skills` | GET | List all skill snapshots (skills, MCP servers, CLI scripts) |
| `/api/skills/refresh` | POST | Re-scan all skill types |
| `/api/skills/:id` | GET | Skill detail with agent assignments |

### Context Graph

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/context-graph/entities` | GET | List/search entities `?type=&boardId=&q=&limit=` |
| `/api/context-graph/entities/:id` | GET | Entity detail with 1-hop neighbors + observations |
| `/api/context-graph/entities/:id/subgraph` | GET | N-hop subgraph `?depth=2` (max 3) |
| `/api/context-graph/entities` | POST | Create/upsert an entity |
| `/api/context-graph/observations` | POST | Add an observation to an entity |
| `/api/context-graph/search` | GET | Hybrid search `?q=&boardId=&limit=` |
| `/api/context-graph/retrieval-preview` | GET | Preview context injection `?prompt=&boardId=&agentId=&rerank=true` |
| `/api/context-graph/stats` | GET | Entity/relation/observation/embedding counts |

### Agent Message Bus

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/agent-bus/send` | POST | Send inter-agent message (direct or broadcast `toAgentId: "*"`) |
| `/api/agent-bus/inbox` | GET | Read agent inbox `?boardId=&agentId=&since=&from=&limit=` |
| `/api/agent-bus/agents` | GET | List active agents on board `?boardId=` |

### Semantic Search

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/search/semantic` | GET | Vector similarity search `?q=&boardId=&sourceTable=&limit=` |

### Boards, Tasks, Projects, Agents

See `apps/api/src/index.ts` for the complete list of endpoints covering boards, tasks, projects, agents, approvals, analytics, cron, flow, people, tags, webhooks, and more.

---

## Extension Ecosystem

Claude Code has three levels of extensibility, from lightest to heaviest:

| Mechanism | Weight | Capabilities | Setup |
|-----------|--------|-------------|-------|
| **Skill** | Light | Prompt injection only | `~/.claude/skills/<id>/SKILL.md` |
| **CLI Script** | Medium | Real execution + structured I/O | `~/.claude/scripts/<id>/SCRIPT.md` + executable |
| **MCP Server** | Heavy | Stateful services, complex APIs | Server process + config in `settings.json` |

All three are discovered, managed, and assignable to agents through the dashboard.

<details>
<summary><strong>CLI Scripts — deep dive</strong></summary>

CLI scripts bridge the gap between prompt-only skills and full MCP servers. They are executable files (Python, Bash, Node, etc.) with a `SCRIPT.md` metadata manifest that defines input/output schemas, interpreter, timeout, and required environment variables.

**Directory structure:**

```
~/.claude/scripts/
  searchapi-client/
    SCRIPT.md              # Metadata manifest (YAML frontmatter + docs)
    searchapi_client.py    # The executable
  deploy-staging/
    SCRIPT.md
    deploy.sh
```

**SCRIPT.md format:**

```markdown
---
name: searchapi-client
description: "Google SERP analysis and competitor intelligence"
entrypoint: searchapi_client.py
interpreter: python3
input-mode: args           # args | stdin | env
output-mode: stdout        # stdout | json
timeout: 30000
env:
  - SEARCHAPI_API_KEY
args-schema: |
  {
    "type": "object",
    "properties": {
      "mode": { "type": "string", "enum": ["serp-audit", "keyword-expand"] },
      "query": { "type": "string" }
    },
    "required": ["mode", "query"]
  }
tags: [seo, search]
---

## SearchAPI Client

Provides live Google SERP intelligence...
```

**SCRIPT.md frontmatter fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | directory name | Display name |
| `description` | string | — | Human-readable description, shown to Claude as tool description |
| `entrypoint` | string | **(required)** | Filename of the executable (e.g. `main.py`). Scripts without this field are skipped. |
| `interpreter` | string | inferred from extension | Runtime: `bash`, `python3`, `node`, `tsx`, `ruby` |
| `input-mode` | enum | `args` | How arguments are passed: `args`, `stdin`, `env` |
| `output-mode` | enum | `stdout` | Output format: `stdout` (raw text) or `json` (validated) |
| `timeout` | number | `30000` | Max execution time in ms |
| `env` | list | `[]` | Required environment variables |
| `args-schema` | JSON | — | JSON Schema for input arguments |
| `tags` | list | `[]` | Categorization tags |

Interpreter inference by file extension: `.py` → `python3`, `.ts` → `tsx`, `.js`/`.mjs` → `node`, `.sh`/`.bash` → `bash`, `.rb` → `ruby`.

**How scripts become tools:**

When a session is spawned with `scripts: ["searchapi-client"]`:

1. The API resolves each script ID via the discovery service
2. Wraps each as a tool in an MCP stdio server (`script-mcp-wrapper.mjs`)
3. Injects the `script-runner` MCP server into the session's `mcpServers` config
4. Claude sees tools like `mcp__script-runner__searchapi-client` with full JSON Schema descriptions
5. When Claude invokes the tool, the wrapper spawns the script subprocess, passes input per `input-mode`, captures output, and returns results

**Input modes:**

| Mode | Behavior | Example |
|------|----------|---------|
| `args` | Arguments passed as CLI flags: `--key value` | `./script.sh --query "test" --verbose` |
| `stdin` | Full arguments object piped as JSON to stdin | `echo '{"data":{"nested":true}}' \| ./script.py` |
| `env` | Each argument set as `SCRIPT_ARG_<KEY>` env var | `SCRIPT_ARG_PREFIX=NODE ./check.sh` |

**Security:**

- **Path containment** — Executables verified to be within `~/.claude/scripts/` via `realpathSync()` (dereferences symlinks)
- **ID validation** — Script IDs must match `^[a-z0-9][a-z0-9._-]*$`
- **No shell injection** — Scripts spawned via `child_process.spawn()` array form
- **Timeout enforcement** — SIGTERM then SIGKILL after configurable timeout
- **Environment isolation** — Env vars resolved server-side from `process.env`
- **Input validation** — `args-schema` provides JSON Schema for MCP tool invocations

</details>

---

## Context Graph RAG

The dashboard includes a built-in knowledge system that gives every agent session automatic awareness of prior work, decisions, patterns, and errors.

```
Activity Events ──┐
Board Memory ─────┤
Tasks ────────────┤──▶ Embedding Worker ──▶ pgvector (768-dim)
                  │                              │
                  └──▶ Extraction Worker ──▶ Context Graph ──┐
                       (Claude Haiku)       (entities,       │
                                            relations,       │
                                            observations)    │
                                                             │
   Session Done ──▶ Session Compressor ──▶ Session Archives ─┤
                    (Claude Haiku)                            │
                                                             │
   Agent Spawn ◀── Context Retriever ◀──────────────────────┘
                   (intent classifier → vector + graph →
                    reranker → context injection)
```

**Prerequisites:** Ollama with `nomic-embed-text` for embeddings, `ANTHROPIC_API_KEY` for entity extraction. All features degrade gracefully when dependencies are unavailable.

<details>
<summary><strong>Context Graph — deep dive</strong></summary>

### Data Flow

1. **Embedding worker** (60s) — scans `board_memory`, `activity_events`, and `tasks` for records without embeddings. Stores 768-dim vectors via Ollama.
2. **Extraction worker** (3 min) — processes activity events through Claude Haiku to extract entities, relationships, observations, and L0 abstracts. Observations are deduplicated via vector similarity (>0.85 = skip, 0.7-0.85 = merge).
3. **Context retriever** — on agent spawn with a `boardId` or `taskId`:
   - Classifies intent (planning/execution/debugging/review/question)
   - Runs parallel queries: vector similarity, graph neighborhood, board memory, session archives
   - Applies intent-weighted scoring and reranks via Claude Haiku
   - Injects L1 abstracts (compact summaries) for 3-5x more knowledge per token budget
4. **Prompt builder** — formats context into `<context>` block injected into the agent's system prompt
5. **Session output capture** — completed sessions are compressed into structured archives

### Graceful Degradation

| Dependency | Missing Behavior |
|------------|-----------------|
| Ollama not running | Embedding worker skips, semantic search falls back to ILIKE |
| pgvector not installed | Embedding storage fails silently, rest unaffected |
| `ANTHROPIC_API_KEY` not set | Extraction/reranking/compression skipped, vector + board memory still work |
| No embeddings in DB | Vector search returns empty, graph + board memory + archives still work |

### Entity Taxonomy

| Type | Description | Example |
|------|-------------|---------|
| `agent` | A Claude agent definition | `planner`, `code-reviewer` |
| `board` | A project board | `backend-api`, `frontend-v2` |
| `task` | A tracked work item | `fix-jwt-expiry` |
| `project` | A multi-task project | `auth-rewrite` |
| `person` | A human collaborator | `david` |
| `skill` | A skill/script/MCP capability | `searchapi-client` |
| `concept` | A domain concept or technology | `jwt`, `pgvector` |
| `decision` | A recorded decision | `use-hono-over-express` |
| `error_pattern` | A recurring failure pattern | `redis-econnrefused-cold-start` |
| `workflow` | A process or procedure | `pr-review-approval-merge` |

### Relationship Types

| Type | Direction | Example |
|------|-----------|---------|
| `assigned_to` | task → agent | "fix-bug" assigned_to debugger |
| `depends_on` | task → task | login depends_on auth-setup |
| `resolved_by` | task → agent | "fix-bug" resolved_by debugger |
| `uses_skill` | agent → skill | planner uses_skill code-review |
| `part_of` | task → project | "fix-bug" part_of auth-rewrite |
| `related_to` | entity → entity | jwt related_to auth-middleware |
| `succeeded_at` | agent → concept | debugger succeeded_at jwt-fixes |
| `failed_at` | agent → concept | planner failed_at deployment |
| `led_to` | decision → task | "use-pgvector" led_to add-embeddings |
| `mentions` | activity → entity | board.chat mentions jwt |

### Context Injection Example

```xml
<context>
## Relevant Knowledge
- [agent/planner] Prefers 3-5 subtask decomposition
- [decision] Use pgvector for embeddings
- [error_pattern] Redis ECONNREFUSED on cold start

## Board Context
- Deployment requires lead-agent approval before merge.
- Sprint goal: complete auth system rewrite by 2026-03-22.

## Recent Session History
- [session:a1b2c3d4] Implemented JWT refresh token rotation
- [session:e5f6g7h8] Fixed Redis connection pool exhaustion under load
</context>
```

### Background Workers

| Worker | Interval | Purpose |
|--------|----------|---------|
| `embeddingWorker` | 60s | Embeds unprocessed board_memory, activity_events, tasks via Ollama |
| `extractionWorker` | 3 min | Extracts entities/relations/observations via Claude Haiku |
| `claudeMemSyncWorker` | 5 min | Syncs claude-mem observations into the context graph |

### Database Tables

| Table | Purpose |
|-------|---------|
| `embeddings` | Vector embeddings (768-dim, pgvector) |
| `ctx_entities` | Named entities with type, description, abstracts |
| `ctx_relations` | Directed relationships between entities |
| `ctx_observations` | Factual observations attached to entities, deduped via vector similarity |
| `ctx_extraction_watermarks` | Incremental extraction tracking |
| `session_archives` | Compressed session summaries |
| `agent_messages` | Inter-agent messages with sender/receiver, board context, TTL |

### claude-mem Integration

The [claude-mem](https://github.com/thedotmack/claude-mem) plugin is supported as a complementary memory system:

- Every spawned session gets the `mcp-search` MCP server injected (if configured)
- Bridge worker syncs claude-mem observations into the context graph
- Set `CLAUDE_MEM_DB_PATH` in `.env` to override auto-detection

</details>

---

## Claude Code Integration

Reads from the standard `~/.claude/` directory:

- `agents/*.md` — Agent definitions (YAML frontmatter + prompt)
- `skills/*/SKILL.md` — Skill definitions
- `scripts/*/SCRIPT.md` — CLI script definitions
- `settings.json` — MCP servers, hooks, claude-mem config
- `projects/*/` — Session JSONL logs for analytics
- `cron/jobs.json` — Scheduled tasks

### Skill Type Taxonomy

| `skillType` | Source | Prefix |
|-------------|--------|--------|
| `skill` | `~/.claude/skills/*/SKILL.md` | (none) |
| `mcp_server` | `~/.claude/settings.json` → `mcpServers` | `mcp:` |
| `cli_script` | `~/.claude/scripts/*/SCRIPT.md` | `script:` |

---

## Creating Your First CLI Script

```bash
# 1. Scaffold
mkdir -p ~/.claude/scripts/hello-world

# 2. Create SCRIPT.md
cat > ~/.claude/scripts/hello-world/SCRIPT.md << 'EOF'
---
name: hello-world
description: "A simple greeting script"
entrypoint: hello.sh
interpreter: bash
input-mode: args
output-mode: stdout
timeout: 5000
args-schema: |
  {
    "type": "object",
    "properties": {
      "name": { "type": "string", "description": "Name to greet" }
    },
    "required": ["name"]
  }
tags: [example]
---

## Hello World

A minimal example script that greets by name.
EOF

# 3. Create the executable
cat > ~/.claude/scripts/hello-world/hello.sh << 'EOF'
#!/usr/bin/env bash
while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) echo "Hello, $2!"; shift 2 ;;
    *) shift ;;
  esac
done
EOF
chmod +x ~/.claude/scripts/hello-world/hello.sh
```

Open **Scripts** in the dashboard, click **Refresh**, and test it.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPERATOR_TOKEN` | (required) | API authentication token |
| `DATABASE_URL` | `postgresql://localhost:5432/cc_operator` | PostgreSQL connection |
| `REDIS_URL` | `redis://127.0.0.1:6379/2` | Redis connection |
| `CLAUDE_HOME` | `~/.claude` | Claude Code config directory |
| `ANTHROPIC_API_KEY` | (optional) | Enables orchestration + context graph extraction |
| `EMBEDDING_PROVIDER` | `ollama` | Embedding provider |
| `EMBEDDING_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `EMBEDDING_MODEL` | `nomic-embed-text` | Embedding model (768-dim) |
| `CLAUDE_MEM_DB_PATH` | (auto-detected) | claude-mem SQLite database path |
| `AUTH_USER` | (optional) | Admin username seeded on first run |
| `AUTH_PASS` | (optional) | Admin password seeded on first run |
| `VITE_API_URL` | `http://localhost:3001` | Frontend API URL (build-time) |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `ECONNREFUSED` on startup | PostgreSQL not running — `docker compose up -d` or `brew services start postgresql@17` |
| `ECONNREFUSED :6379` | Redis not running — `docker compose up -d` or `brew services start redis` |
| Login page but no credentials work | Set `AUTH_USER`/`AUTH_PASS` in `.env` and restart |
| Orchestration says "unavailable" | Install Claude CLI + add `ANTHROPIC_API_KEY` to `.env` |
| `pnpm db:migrate` fails | Database doesn't exist — `createdb cc_operator` (or use Docker) |
| Frontend can't reach API | Check `VITE_API_URL` matches actual API address |
| Scripts not appearing | `SCRIPT.md` must have `entrypoint` in frontmatter |
| Semantic search returns text fallback | `ollama serve` (or `brew services start ollama`) |
| "failed to store embedding" | pgvector not installed — use Docker or `brew install pgvector` |
| No entities in context graph | Add `ANTHROPIC_API_KEY` to `.env` |
| Embedding worker skips every run | `ollama pull nomic-embed-text` |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup, project structure, and PR guidelines.

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## License

[MIT](LICENSE) — David Jelinek
