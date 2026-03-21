import { Command } from 'commander'
import chalk from 'chalk'
import { saveConfig } from '../config.js'
import { CCOperator } from '@cc-operator/sdk'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createInterface } from 'node:readline/promises'

const SKILL_CONTENT = `---
name: cc-operator
description: Interact with Claude Code Operator — manage boards, tasks, agents, and sessions
---

# Claude Code Operator

You can interact with a running Claude Code Operator instance via the \`cc-operator\` CLI.

## Prerequisites
- CLI installed: \`npm install -g cc-operator\`
- Configured: \`cc-operator init\` (stores URL + token in ~/.cc-operator/config.json)

## Commands

### Status
\`\`\`
cc-operator status
\`\`\`

### Boards & Tasks
\`\`\`
cc-operator board list
cc-operator board create --name "Name"
cc-operator task list --board BOARD_ID
cc-operator task create --board BOARD_ID --title "Title" --priority high
\`\`\`

### Agent Sessions
\`\`\`
cc-operator spawn "Your prompt" --agent=agent-id --board=board-id --stream
cc-operator stream SESSION_ID
\`\`\`

### Scripts
\`\`\`
cc-operator script list
cc-operator script test SCRIPT_ID --args '{"key": "value"}'
\`\`\`

### Search
\`\`\`
cc-operator search "query"
\`\`\`

All commands support \`--json\` for machine-readable output.
`

export const initCommand = new Command('init')
  .description('Configure CC Operator URL and token')
  .option('--url <url>', 'Operator API URL')
  .option('--token <token>', 'Operator token')
  .action(async (opts) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })

    const url = opts.url || await rl.question(chalk.cyan('Operator URL [http://localhost:3001]: ')) || 'http://localhost:3001'
    const token = opts.token || await rl.question(chalk.cyan('Operator token: '))

    rl.close()

    if (!token) {
      console.error(chalk.red('Token is required'))
      process.exit(1)
    }

    // Verify connection
    const client = new CCOperator({ baseUrl: url, token })
    try {
      await client.system.health()
      console.log(chalk.green('✓ Connected successfully'))
    } catch (err) {
      console.log(chalk.yellow('⚠ Could not reach server (config saved anyway)'))
    }

    saveConfig({ url, token })
    console.log(chalk.green('✓ Config saved to ~/.cc-operator/config.json'))

    // Scaffold Claude Code directories
    const claudeHome = join(homedir(), '.claude')
    for (const dir of ['agents', 'scripts', 'skills']) {
      const p = join(claudeHome, dir)
      if (!existsSync(p)) {
        mkdirSync(p, { recursive: true })
        console.log(chalk.gray(`  Created ${p}`))
      }
    }

    // Write skill file
    const skillDir = join(claudeHome, 'skills', 'cc-operator')
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, 'SKILL.md'), SKILL_CONTENT)
    console.log(chalk.green('✓ Skill installed at ~/.claude/skills/cc-operator/SKILL.md'))
  })
