// PostToolUse (Edit|Write): aplica los arreglos automáticos de oxlint al archivo editado.
// Nunca bloquea: los errores de lint los frena checks-stop.mjs al final del turno.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { projectDir, readInput, relPath, run } from './lib.mjs'

const input = await readInput()
const file = relPath(input.tool_input?.file_path)
if (!/\.(ts|tsx|js|jsx|mjs)$/.test(file) || file.startsWith('.claude/')) process.exit(0)

const bin = path.join(projectDir, 'node_modules', '.bin', process.platform === 'win32' ? 'oxlint.cmd' : 'oxlint')
if (existsSync(bin)) run(`"${bin}" --fix "${file}"`)

process.exit(0)
