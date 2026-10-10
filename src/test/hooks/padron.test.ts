// @vitest-environment node
// Spec: docs/specs/padron/fase-b.md, criterio 8. Mismo contrato que hooks.test.ts: bloqueo = exit 2, permitido = exit 0.
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

describe('proteger-bash: carga del padrón contra la nube', () => {
  it.each([
    'npm run padron:importar -- datos.csv --aplicar --confirmar=abc.supabase.co',
    'npm run padron:importar -- datos.csv --confirmar=abc.supabase.co',
    'npm run padron:importar -- datos.csv --confirmar abc.supabase.co',
    'SUPABASE_URL=https://abc.supabase.co npm run padron:importar -- datos.csv',
    'SUPABASE_URL=https://abc.supabase.co SUPABASE_SERVICE_ROLE_KEY=k npm run padron:importar -- datos.csv --aplicar',
    'node scripts/importar-padron.ts datos.csv --confirmar=abc.supabase.co',
    'SUPABASE_URL=https://abc.supabase.co node scripts/importar-padron.ts datos.csv',
    'npx tsx scripts/importar-padron.ts datos.csv --confirmar=x',
    "bash -c 'npm run padron:importar -- datos.csv --confirmar=abc.supabase.co'",
    'env SUPABASE_URL=https://abc.supabase.co npm run padron:importar -- datos.csv',
    'export SUPABASE_URL=https://abc.supabase.co && npm run padron:importar -- datos.csv',
  ])('bloquea "%s"', (cmd) => {
    const r = proteger(cmd)
    expect(r.codigo).toBe(2)
    expect(r.stderr).toMatch(/padr[oó]n|importar/i)
  })

  it.each([
    'npm run padron:importar -- scripts/padron/ejemplo.csv',
    'npm run padron:importar -- scripts/padron/ejemplo.csv --aplicar',
    'node scripts/importar-padron.ts scripts/padron/ejemplo.csv',
    'node scripts/importar-padron.ts scripts/padron/ejemplo.csv --aplicar',
  ])('permite la corrida local "%s"', (cmd) => {
    expect(proteger(cmd).codigo).toBe(0)
  })

  it('no afecta a otros comandos', () => {
    expect(proteger('npx vitest run scripts').codigo).toBe(0)
    expect(proteger('npm run lint').codigo).toBe(0)
  })
})
