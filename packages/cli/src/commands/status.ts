import { Command } from 'commander'
import chalk from 'chalk'
import { requireConfig } from '../config.js'
import { CCOperator } from '@cc-operator/sdk'
import { json as printJson } from '../output.js'

export const statusCommand = new Command('status')
  .description('Check CC Operator health')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const config = requireConfig()
    const client = new CCOperator({ baseUrl: config.url, token: config.token })

    try {
      const status = await client.system.health()

      if (opts.json) {
        printJson(status)
        return
      }

      console.log(chalk.bold('\nClaude Code Operator Status\n'))
      console.log(`  Database:  ${status.db.ok ? chalk.green('✓ OK') : chalk.red('✗ Down')}${status.db.latencyMs ? chalk.gray(` (${status.db.latencyMs}ms)`) : ''}`)
      console.log(`  Redis:     ${status.redis.ok ? chalk.green('✓ OK') : chalk.red('✗ Down')}${status.redis.latencyMs ? chalk.gray(` (${status.redis.latencyMs}ms)`) : ''}`)
      console.log(`  Agent SDK: ${status.agentSdk.available ? chalk.green('✓ Available') : chalk.yellow('○ Not available')}`)

      if (status.workers && Object.keys(status.workers).length) {
        console.log(chalk.bold('\n  Workers:'))
        for (const [name, w] of Object.entries(status.workers)) {
          console.log(`    ${w.ok ? chalk.green('✓') : chalk.red('✗')} ${name}${w.lastRunAt ? chalk.gray(` (last: ${w.lastRunAt})`) : ''}`)
        }
      }

      console.log()
    } catch (err) {
      console.error(chalk.red(`Failed to connect: ${err instanceof Error ? err.message : err}`))
      process.exit(1)
    }
  })
