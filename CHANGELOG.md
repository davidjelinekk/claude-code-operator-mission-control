# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.3.0] - 2026-03-22

### Added — Live Session Control

- **`POST /sessions/:id/set-model`** — change model on a running agent session without restarting
- **`POST /sessions/:id/set-permission-mode`** — escalate or restrict permissions mid-session
- **`POST /sessions/:id/apply-settings`** — merge settings (permissions, model overrides) into a running session
- **`POST /sessions/:id/stop-task`** — stop a specific subagent task without killing the parent session
- **`POST /sessions/:id/set-mcp-servers`** — hot-swap MCP servers on a running session (add/remove tools live)
- **`POST /sessions/:id/rewind-files`** — revert file changes to a checkpoint (with dry-run support)
- **`GET /sessions/:id/agents`** — list available subagents for a running session
- **`GET /sessions/:id/commands`** — list available slash commands for a running session

### Added — SDK & Web Hooks

- SDK `SessionsResource`: 8 new methods (`setModel`, `setPermissionMode`, `applySettings`, `stopTask`, `setMcpServers`, `rewindFiles`, `agents`, `commands`)
- Web frontend: 6 new mutation hooks (`useSetSessionModel`, `useSetSessionPermissionMode`, `useApplySessionSettings`, `useStopSessionTask`, `useSetSessionMcpServers`, `useRewindSessionFiles`)

### Added — Spawn Enhancements

- **`debug`** / **`debugFile`** — enable verbose debug logging for spawned sessions with stderr capture via pino
- **`plugins`** — load local plugins into spawned sessions (connects to skill-pack system)
- **`strictMcpConfig`** — always enabled; invalid MCP configs now error instead of silently warning

### Changed

- `@anthropic-ai/claude-agent-sdk` updated to `0.2.81` (installed)
- README: new "Not a Plugin. A Platform." section with architecture diagrams and positioning
- Governance section updated to highlight `canUseTool` interception and sandbox isolation

## [0.2.0] - 2026-03-21

### Added — Agent SDK Integration (P0/P1 Features)

- **Sandbox Mode** — `sandbox: true` on spawn enables isolated filesystem/network execution. Supports both boolean shorthand and full `{ enabled, autoAllowBashIfSandboxed, network }` config. Addresses the audit finding about full `process.env` leaking to agents
- **Tool Governance (`canUseTool`)** — New `tool-governance.ts` service that intercepts every tool call in board-governed sessions. Logs all tool usage as activity events and blocks high-risk operations (destructive `rm`, pipe-to-shell, force-push, writes to `.env`/`.pem`/`.key`) by auto-creating pending approvals
- **Settings Injection** — `settings: { permissions: { allow: [...], deny: [...] } }` on spawn injects fine-grained permission rules per-session, replacing reliance on coarse `permissionMode` presets
- **1M Context Beta** — `betas: ['context-1m-2025-08-07']` enables the 1M token context window for Sonnet 4/4.5+
- **Allowed Tools** — `allowedTools: [...]` auto-approves specific tools without prompting, finer than `permissionMode`
- **Setting Sources Control** — `settingSources: ['user', 'project', 'local']` controls which filesystem settings layers load for session isolation
- **Thinking Config** — `thinking: { type: 'adaptive' | 'enabled' | 'disabled' }` controls Claude's reasoning behavior. Adaptive is default for Opus 4.6+
- **Resume At Message** — `resumeSessionAt: 'uuid'` resumes a session from a specific message in the conversation
- **Fork On Resume** — `forkSession: true` creates a new branch when resuming a session

### Changed

- **SDK version bump** — `@anthropic-ai/claude-agent-sdk` upgraded from `^0.2.77` to `^0.2.81`
- All new spawn params exposed in API route (Zod validated), SDK package (`@cc-operator/sdk`), and web frontend types

## [0.1.1] - 2026-03-21

### Security

- **Shell injection fix** — Anchored ISO timestamp regex in claude-mem-sync worker to prevent injection via `execSync`
- **CORS restriction** — Replaced `origin: '*'` with env-configurable `CORS_ORIGINS` allow list (defaults to `localhost:5173`)
- **Path traversal protection** — Added `SAFE_ID` regex validation to agent-files and skill-files PUT/GET endpoints
- **Input validation** — Added Zod schema validation to agent-bus `/send` endpoint (was raw `c.req.json()`)
- **CLI config directory** — Set `0o700` permissions on `~/.cc-operator/` directory creation
- **Session stream auth** — Fixed `useSessionStream` to read token from Zustand auth store instead of wrong `localStorage` key

### Fixed

- **Hardcoded WebSocket URL** — `useFlowSocket` now derives WS URL from `VITE_API_URL` instead of `ws://localhost:3001`
- **SSE error type** — SDK `sessions.stream()` now throws `CCOperatorError` instead of generic `Error`
- **Transaction safety** — Task PATCH and project DELETE now wrapped in `db.transaction()` for atomicity
- **N+1 cycle detection** — Replaced per-node query loop with a single recursive CTE for dependency cycle detection
- **CLI version** — Now reads version from `package.json` instead of hardcoded string
- **CLI crash handler** — Added `unhandledRejection` handler to prevent raw stack traces on network failures
- **`.env.example`** — Fixed `DATABASE_URL` port from `5432` to `5434` with correct credentials

### Added

- **Database indexes** — Added 11 missing indexes on `tasks`, `approvals`, `task_dependencies`, `person_threads`, and `webhooks` tables (migrations `9005` and `9006`)
- **pgvector HNSW index** — Created HNSW index for fast cosine similarity search (migration `9005`)
- **Global error handler** — Added `app.onError()` to prevent stack trace leaks
- **SDK timeout** — `HttpClient` now supports configurable request timeouts via `AbortSignal` (default 30s)
- **SDK User-Agent** — All SDK requests now send `User-Agent: cc-operator-sdk/0.1.0`
- **Shared `relativeTime`** — Consolidated 5+ duplicate implementations into `@/lib/utils`
- **Worker error logging** — Worker startup failures now log error messages instead of silently swallowing

### Changed

- **Vite build** — Added `manualChunks` for React, Router, Query, Recharts, ReactFlow, and dnd-kit; set `target: es2022`
- **Font subsetting** — Changed to latin-only font imports (removes ~15 unnecessary woff2 files)
- **Docker Compose** — Parameterized credentials via env vars, added health checks, added restart policy
- **`@types/dagre`** — Moved from `dependencies` to `devDependencies`

### Removed

- Unused barrel file `hooks/api/index.ts`
- Unused icon imports (`Kanban` from boards.index, `Layers` from Sidebar)

## [0.1.0] - 2026-03-20

### Added

- **Boards & Tasks** — Kanban-style project management with agent assignment, approvals, dependencies
- **Agent Management** — Discover and manage agents from `~/.claude/agents/*.md`
- **Skill Discovery** — Browse skills, MCP servers, and CLI scripts from `~/.claude/`
- **CLI Scripts** — Executable tools with SCRIPT.md manifests, injectable as MCP tools into agent sessions
- **Orchestration** — Spawn, stream, and manage Agent SDK sessions with model/permission/effort controls
- **Context Graph RAG** — Semantic search, entity extraction, knowledge graph, intent-aware retrieval, session compression, and automatic context injection
- **Agent Message Bus** — Inter-agent messaging with direct and broadcast channels
- **Session Analytics** — Token usage ingestion from JSONL session logs
- **Flow Visualization** — Real-time agent communication graph
- **Approval Workflows** — Confidence-scored approvals with board-level governance
- **Project Orchestration** — Group tasks into projects with sequential/parallel execution
- **Real-Time Events** — WebSocket, SSE, Redis pub/sub, and outbound webhooks
- **claude-mem Integration** — Bridge worker syncs claude-mem observations into the context graph
- **Docker Compose** — One-command dev setup for PostgreSQL + pgvector and Redis
