// PreToolUse (Edit|Write): bloquea archivos sensibles o que no deben editarse a mano.
import { block, readInput, relPath, run } from './lib.mjs'

const input = await readInput()
const file = relPath(input.tool_input?.file_path)
if (!file) process.exit(0)

const name = file.split('/').pop()

if (name.startsWith('.env')) {
  block(`Bloqueado: ${file} contiene secretos. Editalo vos a mano o usá .claude/settings.local.json.`)
}

if (file === 'src/shared/types/database.ts') {
  block('Bloqueado: src/shared/types/database.ts es generado y se regenera con npm run db:types.')
}

if (name === 'package-lock.json') {
  block('Bloqueado: package-lock.json no se edita a mano. Usá npm install / npm uninstall.')
}

if (file.startsWith('supabase/migrations/')) {
  const tracked = run(`git ls-files --error-unmatch "${file}"`)
  if (tracked.ok) {
    block(`Bloqueado: ${file} ya está commiteada. Creá una migración nueva en lugar de editarla.`)
  }
}

process.exit(0)
