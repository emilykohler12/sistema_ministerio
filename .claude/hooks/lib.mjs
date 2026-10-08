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

/**
 * Parte un comando de shell en segmentos (separados por |, ||, &&, ;, &, saltos de línea).
 * El contenido entre comillas se reemplaza por "Q" para que un ">" o un ";" dentro de un
 * string no se confunda con sintaxis. Devuelve también si hay sustitución de comandos.
 */
export function analizarComando(cmd) {
  const sinComillas = cmd
    .replace(/'[^']*'/g, 'Q')
    .replace(/"(?:\\.|[^"\\])*"/g, 'Q')
    .replace(/\d?>&\d/g, ' ') // 2>&1 duplica un descriptor: no escribe archivos ni separa comandos
  const sustitucion = /\$\(|`|<\(|>\(/.test(sinComillas)
  const segmentos = sinComillas
    .split(/\|\||&&|[|;&\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
  return { segmentos, sustitucion }
}

/** Redirecciones de salida a archivos (se permiten 2>&1 y las que van a /dev/null). */
export function escribeArchivo(segmento) {
  const sinInofensivas = segmento.replace(/\d?>>?\s*\/dev\/null/g, '')
  return /\d?>>?|>\|/.test(sinInofensivas)
}

export function block(reason) {
  process.stderr.write(reason + '\n')
  process.exit(2)
}
