// SessionStart (compact): después de compactar, recuerda rama, archivos modificados y spec activa.
// La spec activa sale de la rama (feat/<x> → docs/specs/<x>/). Si la rama no la indica,
// se usa la spec o el plan modificado más recientemente.
import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { projectDir, run } from './lib.mjs'

const rama = run('git branch --show-current').out.trim() || '(sin rama)'
const cambios = run('git status --short').out.trim() || '(sin cambios)'

const specsDir = path.join(projectDir, 'docs', 'specs')
const documentos = (dir) =>
  ['spec.md', 'plan.md'].map((f) => path.join(specsDir, dir, f)).filter((f) => existsSync(f))
const relativa = (f) => path.relative(projectDir, f).split(path.sep).join('/')

let spec = '(ninguna)'
const slug = rama.match(/^(?:feat|fix|chore)\/(.+)$/)?.[1]
const deRama = slug ? documentos(slug) : []

if (deRama.length > 0) {
  spec = `${relativa(deRama[0])} (por la rama)`
} else {
  try {
    const recientes = readdirSync(specsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .flatMap((d) => documentos(d.name))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    if (recientes.length > 0) spec = `${relativa(recientes[0])} (la más reciente; confirmala con la persona)`
  } catch {
    // sin docs/specs todavía
  }
}

process.stdout.write(
  [
    'Contexto reinyectado después de compactar:',
    `- Rama: ${rama}`,
    `- Spec o plan activo: ${spec}`,
    '- Archivos modificados:',
    cambios,
  ].join('\n') + '\n',
)
