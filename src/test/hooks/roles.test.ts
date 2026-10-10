// @vitest-environment node
// Despachador de permisos por rol (.claude/hooks/roles.mjs), registrado en settings.json.
// Los hooks del frontmatter de .claude/agents no corren sin la confianza de la carpeta (0021):
// este hook global lee agent_type y aplica el perfil del subagente. Bloqueo = exit 2.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const raiz = path.resolve(import.meta.dirname, '../../..')

function roles(entrada: string | Record<string, unknown>) {
  const r = spawnSync('node', [path.join(raiz, '.claude/hooks/roles.mjs')], {
    input: typeof entrada === 'string' ? entrada : JSON.stringify(entrada),
    encoding: 'utf8',
    cwd: raiz,
    env: { ...process.env, CLAUDE_PROJECT_DIR: raiz },
  })
  return { codigo: r.status, stderr: r.stderr }
}

const escribir = (agent_type: string | undefined, file_path: string, tool_name = 'Write') =>
  roles({ hook_event_name: 'PreToolUse', tool_name, agent_type, tool_input: { file_path } })
const bash = (agent_type: string | undefined, command: string) =>
  roles({ hook_event_name: 'PreToolUse', tool_name: 'Bash', agent_type, tool_input: { command } })

describe('roles: agente principal y roles libres', () => {
  it.each([undefined, '', 'implementador', 'general-purpose'])('agent_type %j no restringe', (agente) => {
    expect(escribir(agente, 'src/features/talleres/types.ts').codigo).toBe(0)
    expect(bash(agente, 'node -e 1').codigo).toBe(0)
  })
})

describe('roles: escritura por rol', () => {
  it.each([
    ['critico', 'docs/specs/padron/critica.md'],
    ['revisor', 'docs/specs/padron/revision.md'],
    ['test-writer', 'src/features/talleres/filtrar.test.ts'],
    ['qa', 'e2e/padron.spec.ts'],
    ['qa', 'docs/specs/padron/qa.md'],
  ])('%s puede escribir %s', (agente, archivo) => {
    expect(escribir(agente, archivo).codigo).toBe(0)
  })

  it.each([
    ['critico', 'src/x.ts'],
    ['critico', 'docs/specs/padron/spec.md'],
    ['revisor', 'docs/specs/padron/revision-fase-b.md'],
    ['test-writer', 'src/features/talleres/filtrar.ts'],
    ['qa', 'src/x.ts'],
    ['qa', 'playwright.config.ts'],
    ['Explore', 'docs/specs/padron/contexto.md'],
  ])('%s no puede escribir %s', (agente, archivo) => {
    const r = escribir(agente, archivo)
    expect(r.codigo).toBe(2)
    expect(r.stderr).toMatch(/bloquead/i)
  })

  it('Edit y NotebookEdit cuentan como escritura', () => {
    expect(escribir('critico', 'src/x.ts', 'Edit').codigo).toBe(2)
    expect(escribir('critico', 'src/x.ipynb', 'NotebookEdit').codigo).toBe(2)
  })
})

describe('roles: bash por rol', () => {
  it.each([
    ['critico', 'ls docs/specs'],
    ['Explore', 'git log --oneline -3'],
    ['revisor', 'npm test'],
    ['test-writer', 'npx vitest run src/x.test.ts'],
    ['qa', 'npm run test:e2e -- e2e/padron.spec.ts'],
  ])('%s puede correr %s', (agente, comando) => {
    expect(bash(agente, comando).codigo).toBe(0)
  })

  it.each([
    ['critico', 'node -e 1'],
    ['critico', 'cat > docs/x.md <<EOF'],
    ['Explore', 'npm test'],
    ['revisor', 'node -e 1'],
    ['revisor', 'npm run test:e2e'],
    ['test-writer', 'mkdir src/nuevo'],
    ['qa', 'rm -rf src'],
  ])('%s no puede correr %s', (agente, comando) => {
    expect(bash(agente, comando).codigo).toBe(2)
  })
})

describe('roles: falla cerrada', () => {
  it('un JSON inválido bloquea', () => {
    expect(roles('{no es json').codigo).toBe(2)
  })

  it('un subagente desconocido no escribe y solo lee por bash', () => {
    expect(escribir('agente-nuevo', 'src/x.ts').codigo).toBe(2)
    expect(bash('agente-nuevo', 'node -e 1').codigo).toBe(2)
    expect(bash('agente-nuevo', 'ls').codigo).toBe(0)
  })

  it('las herramientas de lectura pasan siempre', () => {
    expect(roles({ tool_name: 'Read', agent_type: 'critico', tool_input: { file_path: 'src/x.ts' } }).codigo).toBe(0)
  })
})
