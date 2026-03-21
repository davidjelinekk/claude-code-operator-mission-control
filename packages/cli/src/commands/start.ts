import { Command } from 'commander'
import chalk from 'chalk'
import { execSync } from 'node:child_process'

export const startCommand = new Command('start')
  .description('Start CC Operator services')
  .option('--docker', 'Start Docker services (PostgreSQL, Redis)')
  .option('--dev', 'Start dev servers')
  .action(async (opts) => {
    if (opts.docker || (!opts.docker && !opts.dev)) {
      console.log(chalk.cyan('Starting Docker services...'))
      try {
        execSync('docker compose up -d', { stdio: 'inherit' })
        console.log(chalk.green('✓ Docker services started'))
      } catch {
        console.error(chalk.red('Failed to start Docker services'))
      }
    }

    if (opts.dev || (!opts.docker && !opts.dev)) {
      console.log(chalk.cyan('Starting dev servers...'))
      try {
        execSync('pnpm dev', { stdio: 'inherit' })
      } catch {
        console.error(chalk.red('Failed to start dev servers'))
      }
    }
  })
