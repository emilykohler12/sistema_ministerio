// Utilidades compartidas por los hooks. Solo Node, sin dependencias, para Linux y Windows.
import { execSync } from 'node:child_process'
import path from 'node:path'

export const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd()

export async function readInput() {
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  try {
    return JSON.parse(raw || '{}')
  } catch {
    return {}
  }
}

/** Ruta relativa al proyecto, siempre con "/" como separador. */
export function relPath(filePath) {
  if (!filePath) return ''
  const abs = path.isAbsolute(filePath) ? filePath : path.join(projectDir, filePath)
  return path.relative(projectDir, abs).split(path.sep).join('/')
}

export function run(cmd) {
  try {
    const out = execSync(cmd, { cwd: projectDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { ok: true, out }
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

export function block(reason) {
  process.stderr.write(reason + '\n')
  process.exit(2)
}
