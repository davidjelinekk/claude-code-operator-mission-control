# Claude Code Operator — Mission Control

## Monorepo Structure

- `apps/api/` — Hono API server (Node 22+, PostgreSQL, Redis)
- `apps/api/src/services/providers/` — Multi-CLI provider abstraction (Claude, Codex, Gemini)
- `apps/web/` — React 19 SPA (TanStack Router, TanStack Query, Tailwind, Vite)
- `packages/shared-types/` — Zod schemas shared between API and web
- `packages/tsconfig/` — Shared TypeScript configs

## Commands

- `pnpm install` — install all dependencies
- `pnpm dev` — start API (port 3001) + web (port 5173) dev servers
- `pnpm typecheck` — type-check entire monorepo (primary verification, no test suite yet)
- `pnpm build` — production build via Turborepo

## Conventions

- Use `pnpm`, not npm or yarn
- TypeScript strict mode, ES modules throughout
- Hono for API routes, Drizzle ORM for database, Zod for validation
- API routes: one file per domain in `apps/api/src/routes/`
- Shared types go in `packages/shared-types/src/`
- Requires `@anthropic-ai/claude-agent-sdk` >= 0.2.97 (context usage, subagent inspection, `taskBudget`, `terminal_reason`)

## Database

- PostgreSQL with pgvector extension
- Drizzle schema in `apps/api/src/db/schema.ts`
- Manual migrations use `9xxx_*.sql` series in `apps/api/src/db/migrations/`
- Docker PG on port 5434, Homebrew PG on port 5432

## Infrastructure

- Docker: `docker compose up -d` (PostgreSQL + pgvector on 5434, Redis on 6379)
- Ollama for embeddings: `nomic-embed-text` model on port 11434
- Redis for pub/sub, caching, BullMQ
