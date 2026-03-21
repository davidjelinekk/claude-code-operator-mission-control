import { Command } from 'commander'
import { requireConfig } from '../config.js'
import { CCOperator } from '@cc-operator/sdk'
import { table, json as printJson, truncate } from '../output.js'

export const scriptCommand = new Command('script')
  .description('Manage scripts')

scriptCommand
  .command('list')
  .description('List scripts')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const config = requireConfig()
    const client = new CCOperator({ baseUrl: config.url, token: config.token })
    const scripts = await client.scripts.list()

    if (opts.json) { printJson(scripts); return }

    if (!scripts.length) { console.log('No scripts found.'); return }

    console.log(table(
      ['ID', 'Name', 'Interpreter', 'Description'],
      scripts.map(s => [s.id, s.name, s.interpreter ?? '—', truncate(s.description ?? '', 40)])
    ))
  })

scriptCommand
  .command('create')
  .description('Create a script')
  .requiredOption('--id <id>', 'Script ID')
  .requiredOption('--name <name>', 'Script name')
  .option('--interpreter <interp>', 'Interpreter (bash/node/python3)', 'bash')
  .option('--description <desc>', 'Description')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const config = requireConfig()
    const client = new CCOperator({ baseUrl: config.url, token: config.token })
    const result = await client.scripts.create({
      id: opts.id,
      name: opts.name,
      interpreter: opts.interpreter,
      description: opts.description,
    })

    if (opts.json) { printJson(result); return }
    console.log(`Created script: ${opts.id}`)
  })

scriptCommand
  .command('test')
  .description('Test a script')
  .argument('<id>', 'Script ID')
  .option('--args <json>', 'Arguments as JSON')
  .option('--json', 'Output as JSON')
  .action(async (id, opts) => {
    const config = requireConfig()
    const client = new CCOperator({ baseUrl: config.url, token: config.token })
    let args: Record<string, unknown> | undefined
    if (opts.args) {
      try {
        args = JSON.parse(opts.args)
      } catch {
        console.error('Invalid JSON in --args')
        process.exit(1)
      }
    }
    const result = await client.scripts.test(id, args)

    if (opts.json) { printJson(result); return }
    console.log(JSON.stringify(result, null, 2))
  })
