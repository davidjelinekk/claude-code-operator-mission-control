# Contributing to Claude Code Operator — Mission Control

## Prerequisites

- **Node.js 22+**
- **pnpm 10+**
- **Docker** (for PostgreSQL + Redis) or local Homebrew installs

## Dev Setup

```bash
git clone https://github.com/davidjelinekk/claude-code-operator-mission-control.git
cd claude-code-operator-mission-control
pnpm install

# Start infrastructure
docker compose up -d

# Configure environment
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env — set DATABASE_URL, REDIS_URL, OPERATOR_TOKEN, AUTH_USER, AUTH_PASS

# Create database and run migrations
createdb cc_operator  # skip if using Docker (already created)
cd apps/api && pnpm db:migrate && cd ../..

# Optional: pgvector + context graph migrations
psql $DATABASE_URL -f apps/api/src/db/migrations/9001_pgvector_embeddings.sql
psql $DATABASE_URL -f apps/api/src/db/migrations/9002_context_graph.sql
psql $DATABASE_URL -f apps/api/src/db/migrations/9003_session_archives.sql
psql $DATABASE_URL -f apps/api/src/db/migrations/9004_agent_messages.sql
psql $DATABASE_URL -f apps/api/src/db/migrations/9005_vector_hnsw_index.sql
psql $DATABASE_URL -f apps/api/src/db/migrations/9006_add_missing_indexes.sql
psql $DATABASE_URL -f apps/api/src/db/migrations/9007_session_archives_terminal_reason.sql

# Optional: Multi-provider support (for testing with non-Claude CLIs)
# Add to apps/api/.env:
#   OPENAI_API_KEY=sk-...    # enables Codex provider
#   GOOGLE_API_KEY=AI...     # enables Gemini provider

# Start dev servers
pnpm dev
# API: http://localhost:3001
# Web: http://localhost:5173
```

## Project Structure

```
apps/
  api/          Hono API server (Node 22+, PostgreSQL, Redis)
  web/          React 19 SPA (TanStack Router/Query, Tailwind, Vite)
packages/
  shared-types/ Zod schemas shared between API and web
  tsconfig/     Shared TypeScript configs
```

## Code Conventions

- **TypeScript** — strict mode, ES modules
- **API routes** — Hono framework, one file per domain in `apps/api/src/routes/`
- **Database** — Drizzle ORM for schema + queries, raw SQL for manual migrations
- **Validation** — Zod schemas in `packages/shared-types/`, used in both API and web
- **Formatting** — follow existing style, no additional linting tools required

## Adding a New API Route

1. Create `apps/api/src/routes/your-feature.ts`
2. Define a Hono app with your routes
3. Register it in `apps/api/src/index.ts` via `.route()`
4. Add shared Zod schemas to `packages/shared-types/src/` if needed
5. Run `pnpm typecheck` to verify

## Adding a New Migration

- **Drizzle migrations** — modify `apps/api/src/db/schema.ts`, then run `pnpm db:generate` and `pnpm db:migrate`
- **Manual migrations** — create `apps/api/src/db/migrations/9xxx_descriptive_name.sql` (9000-series, sequential numbering)

## Type Checking

```bash
pnpm typecheck    # runs across entire monorepo (8 packages)
```

## Testing

Three test suites — all require the API server running on `:3001`.

```bash
# API endpoint tests (152 assertions, no API key needed)
bash test-all.sh

# Full orchestration simulation with real Claude agents (134 assertions, requires ANTHROPIC_API_KEY)
bash test-e2e-orchestration.sh

# Orchestration runner simulation — the autonomous loop (60 assertions, requires ANTHROPIC_API_KEY)
bash test-e2e-runner.sh
```

**`test-all.sh`** — validates all 34 API route files. Runs in ~5 seconds, no cost.

**`test-e2e-orchestration.sh`** — spawns 3 real Claude agents, validates governance, agent bus, approval workflows. Cost: ~$0.15.

**`test-e2e-runner.sh`** — simulates the operator-runner agent: board with 4-task dependency chain, autonomous queue processing (claim → spawn → monitor → done → next). Cost: ~$0.20.

All scripts are idempotent and clean up after themselves.

## PR Guidelines

- Keep PRs focused — one feature or fix per PR
- Run `pnpm typecheck` before submitting
- Run `bash test-all.sh` to verify API changes don't break endpoints
- If adding new API endpoints, document them in the README API Reference section and add coverage to `test-all.sh`
