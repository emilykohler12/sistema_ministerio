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

// `git branch` solo para consultas: sin argumentos, con banderas de listado o con --list/--merged/... y patrones.
// Crear, borrar, mover o copiar ramas (nombre suelto, -d/-D/-m/-M/-f/-c...) no entra.
const BRANCH_CONSULTA =
  /^git branch(?:\s+(?:-a|-r|-v|-vv|--all|--remotes|--verbose|--show-current)|\s+(?:--list|--merged|--no-merged|--contains|--no-contains)(?:\s+[^-\s]\S*)*)*$/
const LECTURA = [
  /^git (status|diff|log|show|ls-files|rev-parse|blame)\b/,
  BRANCH_CONSULTA,
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

// Variables permitidas delante de un comando (lista cerrada). Cualquier otra (NODE_OPTIONS, GIT_EXTERNAL_DIFF,
// PW_TEST_REPORTER...) puede cargar código o cambiar qué ejecuta el comando.
const VARIABLES_PERMITIDAS = /^(?:(?:CI=(?:1|true)|FORCE_COLOR=\d)\s+)*/
const CUALQUIER_VARIABLE = /^[A-Za-z_]\w*=/

// Banderas peligrosas, evaluadas con las comillas BORRADAS (no reemplazadas): `"-exec"`, `-ex''ec` y `--fi''x` quedan
// como `-exec` y `--fix`. Un falso positivo (p. ej. `grep "--fix"`) es aceptable: falla cerrada.
const BANDERAS_PELIGROSAS = [
  { re: /(?<![\w-])-(?:exec|execdir|ok|okdir|delete|fprint\w*|fls)(?![\w-])/, que: 'find ejecuta o escribe' },
  { re: /(?<![\w-])--fix/, que: '--fix modifica archivos' },
  {
    re: /(?<![\w-])--(?:pre|pre-glob|hostname-bin|ext-diff|textconv|output|outfile|compress-program|config-env|exec-path)(?![\w-])/,
    que: 'ejecuta otro programa o escribe un archivo',
  },
]
// Por comando (el segmento sin comillas empieza con él).
const BANDERAS_POR_COMANDO = [
  { comando: /^(?:sort|tree)\s/, re: /(?<![\w-])-[a-zA-Z]*o/, que: '-o escribe un archivo' },
  { comando: /^git\s/, re: /(?<![\w-])-c/, que: 'git -c cambia la configuración' },
  {
    comando: /^(?:npm run test:e2e|npx playwright)(?![\w:-])/,
    re: /(?<![\w-])(?:--(?:config|reporter|ui)|-[a-zA-Z]*c)(?![a-zA-Z0-9])/,
    que: 'cambia la configuración o el reporter de Playwright',
  },
]
// Expansiones que dejan armar una bandera después de la validación: $VAR, ${...} y {a,b}.
const EXPANSION = /\$[A-Za-z_{]|\{[^{}]*,[^{}]*\}/

function segmentosSinComillas(cmd) {
  return cmd
    .replace(/['"\\]/g, '')
    .replace(/\d?>&\d/g, ' ')
    .split(/\|\||&&|[|;&\n]/)
    .map((s) => s.trim().replace(/^(?:[A-Za-z_]\w*=\S*\s+)+/, ''))
    .filter(Boolean)
}

function motivoBandera(cmd) {
  if (EXPANSION.test(cmd.replace(/['"\\]/g, ''))) {
    return 'este agente no puede usar expansión de variables ($VAR) ni de llaves ({a,b}): impide validar los argumentos.'
  }
  for (const segmento of segmentosSinComillas(cmd)) {
    for (const { re, que } of BANDERAS_PELIGROSAS) {
      if (re.test(segmento)) return `bandera no permitida en "${segmento}" (${que}).`
    }
    for (const { comando, re, que } of BANDERAS_POR_COMANDO) {
      if (comando.test(segmento) && re.test(segmento)) return `bandera no permitida en "${segmento}" (${que}).`
    }
    if (/^uniq(?:\s|$)/.test(segmento)) {
      // `uniq entrada salida` escribe el segundo archivo: a lo sumo un argumento que no sea bandera.
      const posicionales = segmento.split(/\s+/).slice(1).filter((t) => !t.startsWith('-'))
      if (posicionales.length > 1) return `uniq con archivo de salida ("${segmento}").`
    }
  }
  return null
}

export function motivoEscritura(perfil, filePath) {
  const permitidos = PERFILES_ESCRITURA[perfil]
  if (!permitidos) return `perfil de escritura desconocido "${perfil}".`
  const file = relPath(filePath)
  if (!file) return 'Bloqueado: la llamada no trae una ruta de archivo válida.'
  if (file === '..' || file.startsWith('../') || file.startsWith('/') || /^[a-zA-Z]:/.test(file)) {
    return `Bloqueado: "${file}" está fuera del proyecto.`
  }
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
    // Solo una lista cerrada de variables al inicio (CI=1 npm test); cualquier otra se bloquea.
    const comando = segmento.replace(VARIABLES_PERMITIDAS, '')
    if (CUALQUIER_VARIABLE.test(comando)) {
      return `Bloqueado: este agente no puede definir variables de entorno ("${segmento}"). Solo CI=1, CI=true y FORCE_COLOR=<dígito>.`
    }
    if (escribeArchivo(comando)) return `Bloqueado: este agente no puede escribir archivos por shell ("${segmento}").`
    // Una redirección a /dev/null no escribe nada: se quita para que los patrones anclados (`$`) la acepten.
    const sinRedireccion = comando.replace(/\s*\d?>>?\s*\/dev\/null/g, '').trim()
    if (!permitidos.some((re) => re.test(sinRedireccion))) {
      return `Bloqueado: "${segmento}" no está permitido para este agente (perfil ${perfil}). Usá Read/Grep/Glob o los comandos de checks.`
    }
  }
  const bandera = motivoBandera(cmd)
  if (bandera) return `Bloqueado: ${bandera}`
  return null
}
