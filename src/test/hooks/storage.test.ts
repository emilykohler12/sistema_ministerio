// @vitest-environment node
// Spec: docs/specs/limpieza-huerfanos/plan.md. Mismo contrato que padron.test.ts: bloqueo = exit 2, permitido = exit 0.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const raiz = path.resolve(import.meta.dirname, '../../..')

function proteger(command: string) {
  const r = spawnSync('node', [path.join(raiz, '.claude/hooks/proteger-bash.mjs')], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: 'utf8',
    cwd: raiz,
    env: { ...process.env, CLAUDE_PROJECT_DIR: raiz },
  })
  return { codigo: r.status, stderr: r.stderr }
}

describe('proteger-bash: limpieza de huérfanos de Storage contra la nube', () => {
  it.each([
    'npm run storage:limpiar -- --aplicar --confirmar=abc.supabase.co',
    'npm run storage:limpiar -- --confirmar=abc.supabase.co',
    'npm run storage:limpiar -- --confirmar abc.supabase.co',
    'SUPABASE_URL=https://abc.supabase.co npm run storage:limpiar',
    'SUPABASE_URL=https://abc.supabase.co SUPABASE_SERVICE_ROLE_KEY=k npm run storage:limpiar -- --aplicar',
    'node scripts/limpiar-storage.ts --confirmar=abc.supabase.co',
    'SUPABASE_URL=https://abc.supabase.co node scripts/limpiar-storage.ts',
    "bash -c 'npm run storage:limpiar -- --confirmar=abc.supabase.co'",
    'env SUPABASE_URL=https://abc.supabase.co npm run storage:limpiar',
    'export SUPABASE_URL=https://abc.supabase.co && npm run storage:limpiar -- --aplicar',
  ])('bloquea "%s"', (cmd) => {
    const r = proteger(cmd)
    expect(r.codigo).toBe(2)
    expect(r.stderr).toMatch(/storage|hu[eé]rfanos/i)
  })

  it.each([
    'npm run storage:limpiar',
    'npm run storage:limpiar -- --aplicar',
    'npm run storage:limpiar -- --aplicar --edad-minima=0',
    'node scripts/limpiar-storage.ts --aplicar',
  ])('permite la corrida local "%s"', (cmd) => {
    expect(proteger(cmd).codigo).toBe(0)
  })
})
