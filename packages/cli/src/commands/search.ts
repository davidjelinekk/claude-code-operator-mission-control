import { Command } from 'commander'
import chalk from 'chalk'
import { requireConfig } from '../config.js'
import { CCOperator } from '@cc-operator/sdk'
import { json as printJson, truncate } from '../output.js'

export const searchCommand = new Command('search')
  .description('Search across tasks and boards')
  .argument('<query>', 'Search query')
  .option('--semantic', 'Use semantic search')
  .option('--json', 'Output as JSON')
  .action(async (query, opts) => {
    const config = requireConfig()
    const client = new CCOperator({ baseUrl: config.url, token: config.token })

    if (opts.semantic) {
      const result = await client.search.semantic(query)
      if (opts.json) { printJson(result); return }
      if (!result.results.length) { console.log('No results.'); return }
      for (const r of result.results as Array<Record<string, unknown>>) {
        console.log(`  ${chalk.cyan(String(r.source_table))} ${chalk.gray(String(r.source_id))}`)
        console.log(`    ${truncate(String(r.content ?? ''), 100)}`)
        if (r.similarity) console.log(chalk.gray(`    similarity: ${Number(r.similarity).toFixed(3)}`))
        console.log()
      }
    } else {
      const result = await client.search.query(query)
      if (opts.json) { printJson(result); return }
      const taskResults = result.tasks as Array<Record<string, unknown>>
      const boardResults = result.boards as Array<Record<string, unknown>>
      if (!taskResults.length && !boardResults.length) { console.log('No results.'); return }
      if (taskResults.length) {
        console.log(chalk.bold('\nTasks:'))
        for (const t of taskResults) {
          console.log(`  ${chalk.gray(String(t.id).slice(0, 8))} ${t.title} ${chalk.gray(`[${t.status}]`)}`)
        }
      }
      if (boardResults.length) {
        console.log(chalk.bold('\nBoards:'))
        for (const b of boardResults) {
          console.log(`  ${chalk.gray(String(b.id).slice(0, 8))} ${b.name}`)
        }
      }
      console.log()
    }
  })
