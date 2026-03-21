import ora, { type Ora } from 'ora'
import chalk from 'chalk'

export interface Step {
  title: string
  run: (spinner: Ora) => Promise<void>
  skip?: () => boolean
}

export async function runSteps(steps: Step[]): Promise<void> {
  for (const step of steps) {
    if (step.skip?.()) {
      console.log(chalk.gray(`  ○ ${step.title} (skipped)`))
      continue
    }

    const spinner = ora(step.title).start()
    try {
      await step.run(spinner)
      spinner.succeed()
    } catch (err) {
      spinner.fail()
      throw err
    }
  }
}
