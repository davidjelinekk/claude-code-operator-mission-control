#!/usr/bin/env node
import { Command } from 'commander'
import { createRequire } from 'node:module'
import { initCommand } from './commands/init.js'
import { startCommand } from './commands/start.js'
import { statusCommand } from './commands/status.js'
import { boardCommand } from './commands/board.js'
import { taskCommand } from './commands/task.js'
import { agentCommand } from './commands/agent.js'
import { scriptCommand } from './commands/script.js'
import { spawnCommand } from './commands/spawn.js'
import { streamCommand } from './commands/stream.js'
import { searchCommand } from './commands/search.js'

const require = createRequire(import.meta.url)
const pkg = require('../package.json') as { version: string }

const program = new Command()
  .name('cc-operator')
  .description('CLI for Claude Code Operator')
  .version(pkg.version)

program.addCommand(initCommand)
program.addCommand(startCommand)
program.addCommand(statusCommand)
program.addCommand(boardCommand)
program.addCommand(taskCommand)
program.addCommand(agentCommand)
program.addCommand(scriptCommand)
program.addCommand(spawnCommand)
program.addCommand(streamCommand)
program.addCommand(searchCommand)

// Catch unhandled async errors from Commander actions
process.on('unhandledRejection', (err) => {
  if (err instanceof Error) {
    console.error(`Error: ${err.message}`)
  } else {
    console.error('Error:', err)
  }
  process.exit(1)
})

program.parse()
