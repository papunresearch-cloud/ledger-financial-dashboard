import { spawnSync } from 'node:child_process'

const python = process.platform === 'win32' ? 'py' : 'python3'
const prefix = process.platform === 'win32' ? ['-3'] : []
const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: '0' }

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', env, shell: process.platform === 'win32' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run(python, [...prefix, '-m', 'playwright', 'install', 'chromium', '--only-shell'])
run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'])
