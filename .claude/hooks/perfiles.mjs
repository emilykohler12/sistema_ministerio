// Perfiles de permisos de los subagentes: qué archivos escribe y qué comandos corre cada rol.
// Los usan roles.mjs (despachador global por agent_type, 0021) y los scripts limitar-*.mjs (CLI por perfil).
// Cada función devuelve el motivo del bloqueo, o null si está permitido.
import { analizarComando, escribeArchivo, relPath } from './lib.mjs'

export const PERFILES_ESCRITURA = {
  tests: [/\.test\.tsx?$/, /\/__snapshots__\//, /^supabase\/tests\/.+\.sql$/],
  critico: [/^\.claude\/agent-memory\/critico\//, /^docs\/specs\/[^/]+\/critica\.md$/],
  revisor: [/^\.claude\/agent-memory\/revisor\//, /^docs\/specs\/[^/]+\/revision\.md$/],
  qa: [/^e2e\//, /^docs\/specs\/[^/]+\/qa\.md$/, /^\.claude\/agent-memory\/qa\//],
  ninguno: [],
}

const LECTURA = [
  /^git (status|diff|log|show|ls-files|branch|rev-parse|blame)\b/,
  /^(ls|cat|head|tail|grep|rg|wc|sort|uniq|pwd|tree|cd|echo|basename|dirname)\b/,
  /^find\b(?!.*\s-(exec|execdir|ok|okdir|delete|fprint\w*|fls)\b)/,
]
const CHECKS = [
  ...LECTURA,
  /^npm (test|run (test(?!:db|:e2e)|lint|typecheck))\b(?!.*--fix)/,
  // Base local: anclados y sin argumentos extra (un `-- --db-url ...` no pasa).
  /^npm run (db:reset|test:db)$/,
  /^npx (vitest|tsc --noEmit|oxlint)\b(?!.*--fix)/,
]
// Playwright (solo qa). Se aceptan filtros (archivo, --grep, --project, --workers...), pero no las banderas que cambian
// la configuración, cargan un reporter o escriben fuera de test-results/: -c/--config, --reporter, --output y --ui*.
const SIN_BANDERAS_PELIGROSAS = String.raw`(?!.*\s(?:-[a-zA-Z]*c|--config|--reporter|--output|--ui)(?![a-zA-Z0-9]))`
const QA = [
  ...CHECKS,
  new RegExp(String.raw`^npm run test:e2e(?=\s|$)${SIN_BANDERAS_PELIGROSAS}`),
  new RegExp(String.raw`^npx playwright test(?=\s|$)${SIN_BANDERAS_PELIGROSAS}`),
]
export const PERFILES_BASH = { lectura: LECTURA, checks: CHECKS, qa: QA }

export function motivoEscritura(perfil, filePath) {
  const permitidos = PERFILES_ESCRITURA[perfil]
  if (!permitidos) return `perfil de escritura desconocido "${perfil}".`
  const file = relPath(filePath)
  if (!file) return null
  if (!permitidos.some((re) => re.test(file))) {
    return `Bloqueado: con el perfil "${perfil}" no podés escribir "${file}". Ese archivo es de otro rol.`
  }
  return null
}

export function motivoBash(perfil, cmd) {
  const permitidos = PERFILES_BASH[perfil]
  if (!permitidos) return `perfil de bash desconocido "${perfil}".`
  if (!cmd) return null
  const { segmentos, sustitucion } = analizarComando(cmd)
  if (sustitucion) return 'Bloqueado: este agente no puede usar sustitución de comandos ($(...), `...`).'
  for (const segmento of segmentos) {
    // Variables al inicio (CI=1 npm test) no cuentan como comando.
    const comando = segmento.replace(/^(\w+=\S*\s+)+/, '')
    if (escribeArchivo(comando)) return `Bloqueado: este agente no puede escribir archivos por shell ("${segmento}").`
    if (!permitidos.some((re) => re.test(comando))) {
      return `Bloqueado: "${segmento}" no está permitido para este agente (perfil ${perfil}). Usá Read/Grep/Glob o los comandos de checks.`
    }
  }
  return null
}
