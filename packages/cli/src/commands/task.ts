import { Command } from 'commander'
import { requireConfig } from '../config.js'
import { CCOperator } from '@cc-operator/sdk'
import { table, json as printJson, statusColor, priorityColor, truncate } from '../output.js'

export const taskCommand = new Command('task')
  .description('Manage tasks')

taskCommand
  .command('list')
  .description('List tasks')
  .option('--board <id>', 'Filter by board ID')
  .option('--status <status>', 'Filter by status')
  .option('--agent <id>', 'Filter by assigned agent')
  .option('--limit <n>', 'Max results', '20')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const config = requireConfig()
    const client = new CCOperator({ baseUrl: config.url, token: config.token })
    const tasks = await client.tasks.list({
      boardId: opts.board,
      status: opts.status,
      assignedAgentId: opts.agent,
      limit: parseInt(opts.limit),
    })

    if (opts.json) { printJson(tasks); return }

    if (!tasks.length) { console.log('No tasks found.'); return }

    console.log(table(
      ['ID', 'Title', 'Status', 'Priority', 'Agent'],
      tasks.map(t => [
        t.id.slice(0, 8),
        truncate(t.title, 50),
        statusColor(t.status),
        priorityColor(t.priority),
        t.assignedAgentId ?? '—',
      ])
    ))
  })

taskCommand
  .command('create')
  .description('Create a task')
  .requiredOption('--board <id>', 'Board ID')
  .requiredOption('--title <title>', 'Task title')
  .option('--description <desc>', 'Task description')
  .option('--priority <priority>', 'Priority (low/medium/high)', 'medium')
  .option('--agent <id>', 'Assign to agent')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const config = requireConfig()
    const client = new CCOperator({ baseUrl: config.url, token: config.token })
    const task = await client.tasks.create({
      boardId: opts.board,
      title: opts.title,
      description: opts.description,
      priority: opts.priority as 'low' | 'medium' | 'high',
      assignedAgentId: opts.agent,
    })

    if (opts.json) { printJson(task); return }
    console.log(`Created task: ${task.title} (${task.id})`)
  })
