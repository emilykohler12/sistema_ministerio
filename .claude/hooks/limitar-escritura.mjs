// PreToolUse (Edit|Write) de subagentes: cada uno solo escribe los archivos de su rol.
//   node limitar-escritura.mjs tests     → test-writer: *.test.ts(x) y snapshots
//   node limitar-escritura.mjs critico   → su memoria y docs/specs/<feature>/critica.md
//   node limitar-escritura.mjs revisor   → su memoria y docs/specs/<feature>/revision.md
import { block, readInput, relPath } from './lib.mjs'

const PERFILES = {
  tests: [/\.test\.tsx?$/, /\/__snapshots__\//],
  critico: [/^\.claude\/agent-memory\/critico\//, /^docs\/specs\/[^/]+\/critica\.md$/],
  revisor: [/^\.claude\/agent-memory\/revisor\//, /^docs\/specs\/[^/]+\/revision\.md$/],
}

const perfil = process.argv[2]
const permitidos = PERFILES[perfil]
if (!permitidos) block(`limitar-escritura: perfil desconocido "${perfil}".`)

const input = await readInput()
const file = relPath(input.tool_input?.file_path)
if (!file) process.exit(0)

if (!permitidos.some((re) => re.test(file))) {
  block(`Bloqueado: con el perfil "${perfil}" no podés escribir "${file}". Ese archivo es de otro rol.`)
}

process.exit(0)
