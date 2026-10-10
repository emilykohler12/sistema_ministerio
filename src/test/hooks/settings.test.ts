// @vitest-environment node
// Forma de .claude/settings.json: todo hook de PreToolUse lleva onFailure "block" (Claude Code >= 2.1.295),
// para que un crash, un timeout o una salida inválida del script bloqueen la llamada en vez de dejarla pasar (0021).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const raiz = path.resolve(import.meta.dirname, '../../..')
const settings = JSON.parse(readFileSync(path.join(raiz, '.claude/settings.json'), 'utf8'))

type Handler = { type: string; command?: string; onFailure?: string }
const handlers = (evento: string): Handler[] =>
  (settings.hooks[evento] as { hooks: Handler[] }[]).flatMap((grupo) => grupo.hooks)

describe('settings.json: onFailure de los hooks', () => {
  it('todo handler de PreToolUse es un comando con onFailure "block"', () => {
    const pre = handlers('PreToolUse')
    expect(pre).toHaveLength(3)
    for (const h of pre) {
      expect(h.type).toBe('command')
      expect(h.onFailure, h.command).toBe('block')
    }
  })

  it.each(['PostToolUse', 'Stop', 'SessionStart'])('%s no lleva onFailure', (evento) => {
    for (const h of handlers(evento)) expect(h.onFailure, h.command).toBeUndefined()
  })
})
