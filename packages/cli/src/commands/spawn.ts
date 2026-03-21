import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { requireConfig } from '../config.js'
import { CCOperator } from '@cc-operator/sdk'
import { json as printJson } from '../output.js'

export const spawnCommand = new Command('spawn')
  .description('Spawn an agent session')
  .argument('<prompt>', 'Prompt for the agent')
  .option('--agent <id>', 'Agent ID')
  .option('--board <id>', 'Board ID')
  .option('--model <model>', 'Model override')
  .option('--scripts <ids>', 'Comma-separated script IDs')
  .option('--stream', 'Stream output')
  .option('--json', 'Output as JSON')
  .action(async (prompt, opts) => {
    const config = requireConfig()
    const client = new CCOperator({ baseUrl: config.url, token: config.token })

    const spinner = opts.json ? null : ora('Spawning session...').start()

    try {
      const result = await client.sessions.spawn({
        prompt,
        agent: opts.agent,
        boardId: opts.board,
        model: opts.model,
        scripts: opts.scripts?.split(','),
      })

      spinner?.succeed(`Session ${result.sessionId} spawned`)

      if (opts.json) { printJson(result); return }

      if (opts.stream) {
        console.log(chalk.gray('Streaming output...\n'))
        for await (const event of client.sessions.stream(result.sessionId)) {
          if (event.event === 'message') {
            try {
              const data = JSON.parse(event.data)
              if (data.content) {
                process.stdout.write(data.content)
              } else if (data.type) {
                console.log(chalk.gray(`[${data.type}]`))
              }
            } catch {
              process.stdout.write(event.data)
            }
          } else if (event.event === 'done') {
            console.log(chalk.green('\n\nSession completed'))
            try {
              const data = JSON.parse(event.data)
              if (data.result?.total_cost_usd) {
                console.log(chalk.gray(`Cost: $${data.result.total_cost_usd.toFixed(4)}`))
              }
            } catch {}
          }
        }
      } else {
        console.log(`Session ID: ${result.sessionId}`)
        console.log(`Stream with: cc-operator stream ${result.sessionId}`)
      }
    } catch (err) {
      spinner?.fail('Failed to spawn session')
      console.error(chalk.red(err instanceof Error ? err.message : String(err)))
      process.exit(1)
    }
  })
