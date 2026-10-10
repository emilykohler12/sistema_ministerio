// PreToolUse (Bash) de subagentes que no deben modificar el repo por shell.
// Lista blanca: solo se permiten los comandos del perfil; todo lo demás se bloquea.
//   node limitar-bash.mjs lectura   → explorar el repo (Explore, crítico)
//   node limitar-bash.mjs checks    → explorar + correr lint, typecheck y tests (test-writer, revisor)
import { analizarComando, block, escribeArchivo, readInput } from './lib.mjs'

const perfil = process.argv[2]

const LECTURA = [
  /^git (status|diff|log|show|ls-files|branch|rev-parse|blame)\b/,
  /^(ls|cat|head|tail|grep|rg|wc|sort|uniq|pwd|tree|cd|echo|basename|dirname)\b/,
  /^find\b(?!.*\s-(exec|execdir|ok|okdir|delete|fprint\w*|fls)\b)/,
]
const CHECKS = [
  ...LECTURA,
  /^npm (test|run (test(?!:db)|lint|typecheck))\b(?!.*--fix)/,
  // Base local: anclados y sin argumentos extra (un `-- --db-url ...` no pasa).
  /^npm run (db:reset|test:db)$/,
  /^npx (vitest|tsc --noEmit|oxlint)\b(?!.*--fix)/,
]
const PERFILES = { lectura: LECTURA, checks: CHECKS }

const permitidos = PERFILES[perfil]
if (!permitidos) block(`limitar-bash: perfil desconocido "${perfil}".`)

const input = await readInput()
const cmd = input.tool_input?.command ?? ''
if (!cmd) process.exit(0)

const { segmentos, sustitucion } = analizarComando(cmd)
if (sustitucion) block('Bloqueado: este agente no puede usar sustitución de comandos ($(...), `...`).')

for (const segmento of segmentos) {
  // Variables al inicio (CI=1 npm test) no cuentan como comando.
  const comando = segmento.replace(/^(\w+=\S*\s+)+/, '')
  if (escribeArchivo(comando)) {
    block(`Bloqueado: este agente no puede escribir archivos por shell ("${segmento}").`)
  }
  if (!permitidos.some((re) => re.test(comando))) {
    block(`Bloqueado: "${segmento}" no está permitido para este agente (perfil ${perfil}). Usá Read/Grep/Glob o los comandos de checks.`)
  }
}

process.exit(0)
