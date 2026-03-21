import { Command } from 'commander'
import { requireConfig } from '../config.js'
import { CCOperator } from '@cc-operator/sdk'
import { table, json as printJson, statusColor } from '../output.js'

export const agentCommand = new Command('agent')
  .description('Manage agents')

agentCommand
  .command('list')
  .description('List agents')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const config = requireConfig()
    const client = new CCOperator({ baseUrl: config.url, token: config.token })
    const agents = await client.agents.list()

    if (opts.json) { printJson(agents); return }

    if (!agents.length) { console.log('No agents found.'); return }

    console.log(table(
      ['ID', 'Name', 'Model', 'Status'],
      agents.map(a => [a.id, a.name, a.model ?? '—', statusColor(a.status)])
    ))
  })

agentCommand
  .command('create')
  .description('Create an agent')
  .requiredOption('--name <name>', 'Agent name')
  .option('--model <model>', 'Model to use')
  .option('--description <desc>', 'Agent description')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const config = requireConfig()
    const client = new CCOperator({ baseUrl: config.url, token: config.token })
    const agent = await client.agents.create({
      name: opts.name,
      model: opts.model,
      description: opts.description,
    })

    if (opts.json) { printJson(agent); return }
    console.log(`Created agent: ${agent.name} (${agent.id})`)
  })
