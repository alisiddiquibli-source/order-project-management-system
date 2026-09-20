import { existsSync, readFileSync, renameSync, rmSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backendDir = path.resolve(__dirname, '../../backend')
const envPath = path.join(backendDir, '.env')
const envBackupPath = path.join(backendDir, '.env.e2e-backup')
const pidPath = path.join(__dirname, '.backend-pid')

export default async function globalTeardown() {
  if (existsSync(pidPath)) {
    const pid = Number(readFileSync(pidPath, 'utf8'))
    try {
      process.kill(pid)
    } catch {
      // already gone
    }
    unlinkSync(pidPath)
  }

  // Restore whatever .env the developer had before the suite ran (or remove
  // the test one if there wasn't one) — the suite must never leave a real
  // local .env overwritten.
  if (existsSync(envBackupPath)) {
    renameSync(envBackupPath, envPath)
  } else if (existsSync(envPath)) {
    rmSync(envPath)
  }
}
