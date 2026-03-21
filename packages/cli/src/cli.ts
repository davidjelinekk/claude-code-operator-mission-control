#!/usr/bin/env node
import { Command } from 'commander'
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

const program = new Command()
  .name('cc-operator')
  .description('CLI for Claude Code Operator')
  .version('0.1.0')

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

program.parse()
