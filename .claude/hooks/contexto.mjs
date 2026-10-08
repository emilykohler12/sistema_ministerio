// SessionStart (compact): después de compactar, recuerda rama, archivos modificados y spec activa.
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { projectDir, run } from './lib.mjs'

const rama = run('git branch --show-current').out.trim() || '(sin rama)'
const cambios = run('git status --short').out.trim() || '(sin cambios)'

let spec = '(ninguna)'
try {
  const specsDir = path.join(projectDir, 'docs', 'specs')
  const candidatas = readdirSync(specsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(specsDir, d.name, 'spec.md'))
    .filter((f) => {
      try {
        return statSync(f).isFile()
      } catch {
        return false
      }
    })
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  if (candidatas.length > 0) spec = path.relative(projectDir, candidatas[0]).split(path.sep).join('/')
} catch {
  // sin docs/specs todavía
}

process.stdout.write(
  [
    'Contexto reinyectado después de compactar:',
    `- Rama: ${rama}`,
    `- Spec más reciente: ${spec}`,
    '- Archivos modificados:',
    cambios,
  ].join('\n') + '\n',
)
