// CLI de un perfil de bash (lista blanca): node limitar-bash.mjs <lectura|checks|qa>
// Las reglas viven en perfiles.mjs. En el flujo real las aplica roles.mjs desde settings.json (0021):
// los hooks del frontmatter de los agentes no corren sin la confianza de la carpeta.
import { block, readInput } from './lib.mjs'
import { motivoBash } from './perfiles.mjs'

const input = await readInput()
const motivo = motivoBash(process.argv[2], input.tool_input?.command ?? '')
if (motivo) block(motivo)
process.exit(0)
