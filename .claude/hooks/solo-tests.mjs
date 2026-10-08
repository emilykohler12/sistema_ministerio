// PreToolUse del subagente test-writer: solo puede escribir archivos de test.
import { block, readInput, relPath } from './lib.mjs'

const input = await readInput()
const file = relPath(input.tool_input?.file_path)
if (!file) process.exit(0)

if (!/\.test\.tsx?$/.test(file)) {
  block(`Bloqueado: el test-writer solo escribe archivos *.test.ts(x). "${file}" es código de producción.`)
}

process.exit(0)
