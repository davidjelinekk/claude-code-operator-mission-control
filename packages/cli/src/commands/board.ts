import { Command } from 'commander'
import { requireConfig } from '../config.js'
import { CCOperator } from '@cc-operator/sdk'
import { table, json as printJson, truncate } from '../output.js'

export const boardCommand = new Command('board')
  .description('Manage boards')

boardCommand
  .command('list')
  .description('List all boards')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const config = requireConfig()
    const client = new CCOperator({ baseUrl: config.url, token: config.token })
    const boards = await client.boards.list()

    if (opts.json) { printJson(boards); return }

    if (!boards.length) { console.log('No boards found.'); return }

    console.log(table(
      ['ID', 'Name', 'Slug', 'Description'],
      boards.map(b => [b.id.slice(0, 8), b.name, b.slug, truncate(b.description ?? '', 40)])
    ))
  })

boardCommand
  .command('create')
  .description('Create a board')
  .requiredOption('--name <name>', 'Board name')
  .option('--description <desc>', 'Board description')
  .option('--objective <obj>', 'Board objective')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const config = requireConfig()
    const client = new CCOperator({ baseUrl: config.url, token: config.token })
    const board = await client.boards.create({
      name: opts.name,
      description: opts.description,
      objective: opts.objective,
    })

    if (opts.json) { printJson(board); return }
    console.log(`Created board: ${board.name} (${board.id})`)
  })

boardCommand
  .command('summary')
  .description('Board summary')
  .argument('<id>', 'Board ID')
  .option('--json', 'Output as JSON')
  .action(async (id, opts) => {
    const config = requireConfig()
    const client = new CCOperator({ baseUrl: config.url, token: config.token })
    const summary = await client.boards.summary(id)

    if (opts.json) { printJson(summary); return }
    console.log(JSON.stringify(summary, null, 2))
  })
