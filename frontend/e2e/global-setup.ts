import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backendDir = path.resolve(__dirname, '../../backend')
const envPath = path.join(backendDir, '.env')
const envBackupPath = path.join(backendDir, '.env.e2e-backup')

const DB_HOST = process.env.E2E_DB_HOST ?? '127.0.0.1'
const DB_PORT = process.env.E2E_DB_PORT ?? '3306'
const DB_NAME = process.env.E2E_DB_NAME ?? 'bli_e2e'
const DB_USER = process.env.E2E_DB_USER ?? 'root'
const DB_PASS = process.env.E2E_DB_PASS ?? ''
export const BACKEND_PORT = process.env.E2E_BACKEND_PORT ?? '8130'

function mysqlArgs(extra: string[] = []): string[] {
  const args = ['-h', DB_HOST, '-P', DB_PORT, '-u', DB_USER]
  if (DB_PASS) args.push(`-p${DB_PASS}`)
  return [...args, ...extra]
}

function runSqlFile(database: string | null, file: string) {
  const sql = readFileSync(file, 'utf8')
  const args = mysqlArgs(database ? [database] : [])
  execFileSync('mysql', args, { input: sql, stdio: ['pipe', 'inherit', 'inherit'] })
}

async function waitForHealth(url: string, timeoutMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.status === 200) return
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`Backend did not become healthy at ${url} within ${timeoutMs}ms`)
}

export default async function globalSetup() {
  // 1. Fresh test database, schema + fixture data.
  execFileSync('mysql', mysqlArgs(['-e', `DROP DATABASE IF EXISTS \`${DB_NAME}\`; CREATE DATABASE \`${DB_NAME}\` CHARACTER SET utf8mb4;`]))
  runSqlFile(DB_NAME, path.join(backendDir, 'database/schema.sql'))
  runSqlFile(DB_NAME, path.join(__dirname, 'fixtures/seed.sql'))

  // 2. Point the backend at it — back up any real .env first, restored in global-teardown.
  if (existsSync(envPath) && !existsSync(envBackupPath)) {
    renameSync(envPath, envBackupPath)
  }
  writeFileSync(
    envPath,
    [
      'APP_ENV=local',
      'APP_DEBUG=true',
      '',
      `DB_HOST=${DB_HOST}`,
      `DB_PORT=${DB_PORT}`,
      `DB_DATABASE=${DB_NAME}`,
      `DB_USERNAME=${DB_USER}`,
      `DB_PASSWORD=${DB_PASS}`,
      '',
      'JWT_SECRET=e2e-test-secret-not-for-production-use-1234567890',
      'JWT_ACCESS_TTL_MINUTES=30',
      'JWT_REFRESH_TTL_DAYS=14',
      '',
      'MAIL_HOST=',
      'AI_DEFAULT_PROVIDER=claude',
      'CLAUDE_API_KEY=',
      'GEMINI_API_KEY=',
      'CHATGPT_API_KEY=',
      'GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_PATH=',
      'GOOGLE_DRIVE_FAT_SAT_FOLDER_ID=',
      '',
      'AT_RISK_WARNING_DAYS=3',
      'BLOCKER_ESCALATION_DAYS=7',
      'TICKET_AUTO_CLOSE_BUSINESS_DAYS=5',
      'BUSINESS_HOURS_START=09:00',
      'BUSINESS_HOURS_END=18:00',
      'BUSINESS_DAYS=Mon,Tue,Wed,Thu,Fri,Sat',
      '',
    ].join('\n'),
  )

  // 3. Start the PHP backend and wait for it to answer.
  const backend: ChildProcess = spawn('php', ['-S', `127.0.0.1:${BACKEND_PORT}`, '-t', 'public'], {
    cwd: backendDir,
    stdio: 'ignore',
    detached: true,
  })
  backend.unref()
  writeFileSync(path.join(__dirname, '.backend-pid'), String(backend.pid))

  await waitForHealth(`http://127.0.0.1:${BACKEND_PORT}/api/health`)
}
