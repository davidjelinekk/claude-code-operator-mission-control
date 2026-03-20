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
pnpm typecheck    # runs across entire monorepo
```

There is no test suite yet — typecheck is the primary verification step.

## PR Guidelines

- Keep PRs focused — one feature or fix per PR
- Run `pnpm typecheck` before submitting
- Include a description of what changed and why
- If adding new API endpoints, document them in the README API Reference section
