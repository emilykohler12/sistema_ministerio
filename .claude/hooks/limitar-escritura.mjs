// CLI de un perfil de escritura (Edit|Write): node limitar-escritura.mjs <tests|critico|revisor|qa>
// Las reglas viven en perfiles.mjs. En el flujo real las aplica roles.mjs desde settings.json (0021):
// los hooks del frontmatter de los agentes no corren sin la confianza de la carpeta.
import { block, readInput } from './lib.mjs'
import { motivoEscritura } from './perfiles.mjs'

const input = await readInput()
const motivo = motivoEscritura(process.argv[2], input.tool_input?.file_path)
if (motivo) block(motivo)
process.exit(0)
