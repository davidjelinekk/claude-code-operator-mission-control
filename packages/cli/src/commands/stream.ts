import { Command } from 'commander'
import chalk from 'chalk'
import { requireConfig } from '../config.js'
import { CCOperator } from '@cc-operator/sdk'
import { json as printJson } from '../output.js'

export const streamCommand = new Command('stream')
  .description('Stream a session')
  .argument('<sessionId>', 'Session ID')
  .option('--json', 'Output events as JSON lines')
  .action(async (sessionId, opts) => {
    const config = requireConfig()
    const client = new CCOperator({ baseUrl: config.url, token: config.token })

    try {
      for await (const event of client.sessions.stream(sessionId)) {
        if (opts.json) {
          console.log(JSON.stringify({ event: event.event, data: event.data }))
          continue
        }

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
            if (data.result) printJson(data.result)
          } catch {}
        }
      }
    } catch (err) {
      console.error(chalk.red(`Stream error: ${err instanceof Error ? err.message : err}`))
      process.exit(1)
    }
  })
