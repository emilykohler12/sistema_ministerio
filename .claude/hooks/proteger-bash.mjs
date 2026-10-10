// PreToolUse (Bash), para todos los agentes: lo que proteger.mjs cuida en Edit/Write,
// también por shell. Sin esto, `cat .env` o `sed -i` sobre una migración se saltean la protección.
import { analizarComando, block, escribeArchivo, readInput, run } from './lib.mjs'

const input = await readInput()
const cmd = input.tool_input?.command ?? ''
if (!cmd) process.exit(0)

// .env, .env.local, .env.production... (no .env.example, ni process.env / import.meta.env)
for (const m of cmd.matchAll(/(?:^|[^\w.])\.env(?:\.([\w.-]+))?(?![\w-])/g)) {
  if (m[1] !== 'example') {
    block('Bloqueado: el comando accede a un archivo .env con secretos. Si hace falta un valor, pedíselo a la persona.')
  }
}

// Supabase solo local (CLAUDE.md: nunca conectar agentes a la base de producción).
// Una regex sobre el comando crudo: una invocación de `supabase` o de `npm run db:*`/`test:db`, seguida en el
// mismo comando simple de una marca remota (flag --linked/--db-url/--project-ref/--project-id, o un subcomando
// suelto link/login/push/pull/dump/repair/inspect). Cubre npx, npm exec, rutas a node_modules/.bin, variables
// de entorno, bash -c '...', comillas, `=` y $(...). Falso positivo aceptado: git commit -m "supabase link".
// Límite aceptado: `| xargs npx supabase` con argumentos por stdin no se puede detectar. La barrera real es que
// el contenedor no tenga credenciales remotas; bloquear login y link evita que el agente las consiga.
const SUPABASE_REMOTO =
  /(?:\bsupabase(?![\w-])|\bnpm\s+run\s+(?:db:|test:db))[^;&|\n]*?[\s"'=(](?:--(?:linked|db-url|project-ref|project-id)\b|(?:link|login|push|pull|dump|repair|inspect)(?![\w-]))/
if (SUPABASE_REMOTO.test(cmd)) {
  block(
    'Bloqueado: Supabase solo se usa en local. No se permiten --linked, --db-url, --project-ref, link, login, ' +
      'push, pull, dump, repair ni inspect: los agentes no se conectan a bases remotas. ' +
      'Usá los scripts npm db:* contra la base local.',
  )
}

// Carga del padrón (ADR 0019): solo contra el Supabase local. Un destino remoto se elige con SUPABASE_URL o se
// confirma con --confirmar=<host>; si el comando completo menciona el script y alguna de las dos, se bloquea
// (cubre `export SUPABASE_URL=... && npm run padron:importar`). La nube la carga una persona.
if (/padron:importar|importar-padron/.test(cmd) && /--confirmar|SUPABASE_URL/.test(cmd)) {
  block(
    'Bloqueado: la carga del padrón se corre solo contra el Supabase local. SUPABASE_URL y --confirmar apuntan ' +
      'a una base remota: esa carga la hace una persona, no un agente.',
  )
}

const { segmentos } = analizarComando(cmd)

// Escrituras por shell sobre archivos que no se editan a mano.
const muta = (s) => escribeArchivo(s) || /^(sed\s+.*-i|tee|rm|mv|cp|truncate)\b/.test(s)

for (const s of segmentos.filter(muta)) {
  if (/package-lock\.json/.test(s)) {
    block('Bloqueado: package-lock.json no se edita a mano. Usá npm install / npm uninstall.')
  }
  for (const [ruta] of s.matchAll(/supabase\/migrations\/[\w.-]+/g)) {
    if (run(`git ls-files --error-unmatch "${ruta}"`).ok) {
      block(`Bloqueado: ${ruta} ya está commiteada. Creá una migración nueva en lugar de modificarla.`)
    }
  }
}

process.exit(0)
