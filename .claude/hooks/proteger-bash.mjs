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

// Escrituras por shell sobre archivos que no se editan a mano.
const { segmentos } = analizarComando(cmd)
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
