// Stop: si hay código modificado, lint y typecheck deben pasar antes de cerrar el turno.
// - No hace nada si no hay cambios de código (por ejemplo, mientras se discute diseño).
// - No repite los checks si el código no cambió desde la última vez que pasaron.
// - Respeta stop_hook_active para no entrar en bucle.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { projectDir, readInput, run } from './lib.mjs'

const input = await readInput()
if (input.stop_hook_active) process.exit(0)

const status = run('git status --porcelain --untracked-files=all')
if (!status.ok) process.exit(0)

const codigo = status.out
  .split('\n')
  .map((l) => l.slice(3).trim().split(' -> ').pop())
  .filter((f) => /\.(ts|tsx)$/.test(f) || /^(package\.json|tsconfig.*\.json|\.oxlintrc\.json)$/.test(f))

if (codigo.length === 0) process.exit(0)

// Huella del estado actual del código: si no cambió desde el último OK, no se repite.
const diff = run(`git diff HEAD -- ${codigo.map((f) => `"${f}"`).join(' ')}`).out
const nuevos = codigo
  .filter((f) => existsSync(path.join(projectDir, f)))
  .map((f) => readFileSync(path.join(projectDir, f), 'utf8'))
  .join('\n')
const huella = createHash('sha1').update(diff + nuevos).digest('hex')
const cacheDir = path.join(projectDir, 'node_modules', '.cache', 'claude-hooks')
const cacheFile = path.join(cacheDir, 'checks-ok')
if (existsSync(cacheFile) && readFileSync(cacheFile, 'utf8') === huella) process.exit(0)

const fallos = []
const lint = run('npm run lint --silent')
if (!lint.ok) fallos.push(`## npm run lint\n${lint.out.slice(-3000)}`)
const tipos = run('npm run typecheck --silent')
if (!tipos.ok) fallos.push(`## npm run typecheck\n${tipos.out.slice(-3000)}`)

if (fallos.length > 0) {
  const reason = `Los checks fallan con los cambios actuales. Corregilos antes de terminar:\n\n${fallos.join('\n\n')}`
  process.stdout.write(JSON.stringify({ decision: 'block', reason }))
  process.exit(0)
}

mkdirSync(cacheDir, { recursive: true })
writeFileSync(cacheFile, huella)
process.exit(0)
