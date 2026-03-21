<p align="center">
  <img src="../../docs/cc-operator-hero.png" alt="Claude Code Operator" width="600" />
</p>

# cc-operator

CLI for [Claude Code Operator](https://github.com/davidjelinekk/claude-code-operator-mission-control).

<p align="center">
  <img src="../../docs/cc-operator-workflow.png" alt="Zero to Agents in 60 Seconds" width="600" />
</p>

## Install

```bash
npm install -g cc-operator
```

## Setup

```bash
cc-operator init
```

Prompts for your Operator URL and token, saves to `~/.cc-operator/config.json`, and installs the Claude Code skill.

## Commands

```
cc-operator start                                   # Start Docker + dev servers
cc-operator status                                  # Health check
cc-operator board list                              # List boards
cc-operator board create --name "Sprint 1"          # Create board
cc-operator task list --board ID                    # List tasks
cc-operator task create --board ID --title "Fix X"  # Create task
cc-operator agent list                              # List agents
cc-operator spawn "Fix the bug" --agent=debugger --stream  # Spawn + stream
cc-operator stream SESSION_ID                       # Stream a session
cc-operator script list                             # List scripts
cc-operator script test ID --args '{"key":"val"}'   # Test a script
cc-operator search "query"                          # Search tasks/boards
cc-operator search "query" --semantic               # Semantic search
```

All commands support `--json` for machine-readable output.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CC_OPERATOR_URL` | API URL (overrides config file) |
| `CC_OPERATOR_TOKEN` | API token (overrides config file) |

## License

MIT
