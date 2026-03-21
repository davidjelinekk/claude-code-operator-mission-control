<p align="center">
  <img src="../../docs/cc-operator-hero.png" alt="Claude Code Operator" width="600" />
</p>

# create-cc-operator

Scaffold a new [Claude Code Operator](https://github.com/davidjelinekk/claude-code-operator-mission-control) project.

<p align="center">
  <img src="../../docs/cc-operator-features.png" alt="Why Claude Code Operator" width="600" />
</p>

## Usage

```bash
npx create-cc-operator my-project
```

## What It Does

1. Downloads the latest template
2. Generates `.env` with a random operator token
3. Optionally starts Docker services (PostgreSQL + Redis)
4. Installs dependencies with pnpm
5. Builds all packages

## After Setup

```bash
cd my-project
pnpm dev          # Start API (3001) + Dashboard (5173)
```

Then install the CLI:

```bash
npm install -g cc-operator
cc-operator init  # Point to your local instance
```

## Requirements

- Node.js >= 22
- pnpm
- Docker (optional, for PostgreSQL + Redis)

## License

MIT
