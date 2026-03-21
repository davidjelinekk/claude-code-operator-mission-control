import chalk from 'chalk'
import prompts from 'prompts'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { execa } from 'execa'
import { runSteps, type Step } from './steps.js'
import { isDockerAvailable, runCompose } from './docker.js'
import { generateEnv, readGeneratedToken } from './env.js'
import type { Ora } from 'ora'

export async function scaffold(targetDir: string): Promise<void> {
  const projectDir = resolve(targetDir)

  console.log(chalk.bold('\n🚀 Create Claude Code Operator\n'))

  if (existsSync(projectDir)) {
    console.error(chalk.red(`Directory ${targetDir} already exists.`))
    process.exit(1)
  }

  // Prompt for config
  const response = await prompts([
    {
      type: 'text',
      name: 'authUser',
      message: 'Admin username',
      initial: 'admin',
    },
    {
      type: 'password',
      name: 'authPass',
      message: 'Admin password',
      initial: 'changeme',
    },
  ], { onCancel: () => { process.exit(0) } })

  const dockerAvailable = await isDockerAvailable()
  let useDocker = false
  if (dockerAvailable) {
    const dockerResponse = await prompts({
      type: 'confirm',
      name: 'useDocker',
      message: 'Start Docker services (PostgreSQL + Redis)?',
      initial: true,
    })
    useDocker = dockerResponse.useDocker
  }

  const steps: Step[] = [
    {
      title: 'Downloading template',
      run: async (spinner: Ora) => {
        const degit = (await import('degit')).default
        const emitter = degit('davidjelinekk/claude-code-operator-mission-control', { cache: false, force: true })
        await emitter.clone(projectDir)
        spinner.text = `Downloaded to ${targetDir}`
      },
    },
    {
      title: 'Generating .env',
      run: async () => {
        generateEnv(projectDir, {
          AUTH_USER: response.authUser,
          AUTH_PASS: response.authPass,
        })
      },
    },
    {
      title: 'Starting Docker services',
      skip: () => !useDocker,
      run: async () => {
        await runCompose(projectDir)
      },
    },
    {
      title: 'Installing dependencies',
      run: async (spinner: Ora) => {
        // Detect pnpm
        try {
          await execa('pnpm', ['--version'], { stdio: 'pipe' })
        } catch {
          spinner.text = 'Installing pnpm...'
          await execa('npm', ['install', '-g', 'pnpm'], { stdio: 'pipe' })
        }
        spinner.text = 'Running pnpm install...'
        await execa('pnpm', ['install'], { cwd: projectDir, stdio: 'pipe' })
      },
    },
    {
      title: 'Building packages',
      run: async () => {
        await execa('pnpm', ['build'], { cwd: projectDir, stdio: 'pipe' })
      },
    },
  ]

  await runSteps(steps)

  // Summary
  const token = readGeneratedToken(projectDir)

  console.log(chalk.bold.green('\n✓ Claude Code Operator created successfully!\n'))
  console.log(chalk.bold('Next steps:\n'))
  console.log(`  ${chalk.cyan('cd')} ${targetDir}`)

  if (!useDocker) {
    console.log(`  ${chalk.cyan('docker compose up -d')}    ${chalk.gray('# Start PostgreSQL + Redis')}`)
  }

  console.log(`  ${chalk.cyan('pnpm dev')}                 ${chalk.gray('# Start dev servers')}`)
  console.log()
  console.log(chalk.bold('URLs:'))
  console.log(`  API:       ${chalk.cyan('http://localhost:3001')}`)
  console.log(`  Dashboard: ${chalk.cyan('http://localhost:5173')}`)
  console.log()

  if (token) {
    console.log(chalk.bold('Credentials:'))
    console.log(`  Username: ${chalk.cyan(response.authUser)}`)
    console.log(`  Password: ${chalk.cyan(response.authPass)}`)
    console.log(`  Token:    ${chalk.cyan(token.slice(0, 16))}...`)
    console.log()
  }

  console.log(chalk.bold('CLI setup:'))
  console.log(`  ${chalk.cyan('npm install -g cc-operator')}`)
  console.log(`  ${chalk.cyan('cc-operator init')}`)
  console.log()
}
