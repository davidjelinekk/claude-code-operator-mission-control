# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
