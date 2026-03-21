import { execa } from 'execa'

export async function isDockerAvailable(): Promise<boolean> {
  try {
    await execa('docker', ['info'], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

export async function runCompose(projectDir: string): Promise<void> {
  await execa('docker', ['compose', 'up', '-d'], {
    cwd: projectDir,
    stdio: 'inherit',
  })
}
