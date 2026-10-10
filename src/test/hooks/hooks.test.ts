// @vitest-environment node
// Contrato real de los hooks de .claude/hooks: se ejecutan como proceso (node + JSON por stdin).
// Bloqueo = exit code 2; permitido = exit code 0.
// Vive en src/test porque vitest ignora carpetas ocultas como .claude.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const raiz = path.resolve(import.meta.dirname, '../../..')

function ejecutar(hook: string, args: string[], toolInput: Record<string, string>) {
  const r = spawnSync('node', [path.join(raiz, '.claude/hooks', hook), ...args], {
    input: JSON.stringify({ tool_input: toolInput }),
    encoding: 'utf8',
    cwd: raiz,
    env: { ...process.env, CLAUDE_PROJECT_DIR: raiz },
  })
  return { codigo: r.status, stderr: r.stderr }
}

const bash = (hook: string, args: string[], command: string) => ejecutar(hook, args, { command })
const escribir = (hook: string, args: string[], file_path: string) => ejecutar(hook, args, { file_path })

describe('proteger-bash: acceso remoto de supabase', () => {
  it.each([
    'npx supabase db reset --linked',
    'supabase db reset --db-url postgres://x',
    'npm exec supabase db push',
    './node_modules/.bin/supabase link --project-ref x',
    'env X=1 npx supabase login',
    'npx supabase "link"',
    'npx supabase db reset "--linked"',
    'npx supabase db --debug push',
    'npx supabase db dump',
    'npx supabase migration repair 1 --status applied',
    'npx supabase inspect db locks',
    'npx supabase db reset --db-url=postgres://x',
    "bash -c 'npx supabase link'",
    'sudo bash -c "npx supabase db push"',
    "timeout 60 bash -c 'npx supabase login'",
    "npx -c 'supabase login'",
    'npx supabase $(echo link)',
  ])('bloquea "%s"', (cmd) => {
    expect(bash('proteger-bash.mjs', [], cmd).codigo).toBe(2)
  })

  it.each([
    'npx supabase start',
    'npx supabase db reset',
    'npx supabase test db',
    'npm run db:reset',
    'npx supabase migration new crear_link_tabla',
    'npx supabase gen types typescript --local > src/shared/types/database.ts',
    'npx supabase status',
    'git status',
  ])('permite el comando local "%s"', (cmd) => {
    expect(bash('proteger-bash.mjs', [], cmd).codigo).toBe(0)
  })
})

describe('limitar-bash perfil checks', () => {
  it.each(['npm run db:reset', 'npm run test:db'])('permite "%s"', (cmd) => {
    expect(bash('limitar-bash.mjs', ['checks'], cmd).codigo).toBe(0)
  })

  it.each([
    'npm run db:reset -- --db-url postgres://x',
    'npm run db:types',
    'npm run db:start',
    'docker ps',
  ])('bloquea "%s"', (cmd) => {
    expect(bash('limitar-bash.mjs', ['checks'], cmd).codigo).toBe(2)
  })

  it.each(['npm run lint', 'npx vitest run src/foo.test.ts'])('regresión: sigue permitiendo "%s"', (cmd) => {
    expect(bash('limitar-bash.mjs', ['checks'], cmd).codigo).toBe(0)
  })
})

describe('limitar-bash perfil qa', () => {
  it.each([
    'npm run test:e2e',
    'npm run test:e2e -- e2e/padron.spec.ts',
    'npm run test:e2e -- --grep "alta de institución"',
    'npm run test:e2e -- -g login --retries=1',
    'npx playwright test',
    'npx playwright test e2e/padron.spec.ts --project=chromium',
    'CI=1 npx playwright test --workers=1',
    'npm run db:reset',
    'npm run lint',
    'npm run typecheck',
    'npm test',
    'git status',
  ])('permite "%s"', (cmd) => {
    expect(bash('limitar-bash.mjs', ['qa'], cmd).codigo).toBe(0)
  })

  it.each([
    'rm -rf e2e',
    'rm src/foo.ts',
    'npm run test:e2e -- --config=otra.config.ts',
    'npm run test:e2e -- -c otra.config.ts',
    'npm run test:e2e -- --reporter=./mio.js',
    'npm run test:e2e -- --output=/etc',
    'npm run test:e2e -- --ui',
    'npm run test:e2e:x',
    'npm run test:e2e:watch -- e2e/a.spec.ts',
    'npx playwright test-foo',
    'npx playwright test --config otra.config.ts',
    'npx playwright test --reporter=html',
    'npx playwright install',
    'npx playwright show-report',
    'npx playwright codegen',
    'npm run db:reset -- --db-url postgres://x',
    'npm run db:start',
    'npm run db:types',
    'npm run dev',
    'npx playwright test > src/foo.ts',
    'echo x > e2e/a.ts',
    'docker ps',
  ])('bloquea "%s"', (cmd) => {
    expect(bash('limitar-bash.mjs', ['qa'], cmd).codigo).toBe(2)
  })
})

describe('limitar-bash perfil checks: sin pruebas e2e', () => {
  it('bloquea npm run test:e2e (es del agente qa)', () => {
    expect(bash('limitar-bash.mjs', ['checks'], 'npm run test:e2e').codigo).toBe(2)
  })

  it('bloquea npx playwright test', () => {
    expect(bash('limitar-bash.mjs', ['checks'], 'npx playwright test').codigo).toBe(2)
  })
})

describe('limitar-escritura perfil qa', () => {
  it.each([
    'e2e/padron.spec.ts',
    'e2e/helpers.ts',
    'docs/specs/padron/qa.md',
    '.claude/agent-memory/qa/MEMORY.md',
  ])('permite escribir %s', (f) => {
    expect(escribir('limitar-escritura.mjs', ['qa'], f).codigo).toBe(0)
  })

  it.each([
    'src/features/talleres/types.ts',
    'src/foo.test.ts',
    'playwright.config.ts',
    'package.json',
    'supabase/migrations/x.sql',
    'docs/specs/padron/spec.md',
    'docs/specs/padron/revision.md',
    'docs/specs/padron/qa.md.bak',
    'docs/specs/padron/qa/captura-listado.png',
    '.claude/agent-memory/revisor/MEMORY.md',
    'e2e-otro/x.ts',
  ])('bloquea escribir %s', (f) => {
    expect(escribir('limitar-escritura.mjs', ['qa'], f).codigo).toBe(2)
  })
})

describe('limitar-escritura perfil tests', () => {
  it('permite escribir supabase/tests/base.test.sql', () => {
    expect(escribir('limitar-escritura.mjs', ['tests'], 'supabase/tests/base.test.sql').codigo).toBe(0)
  })

  it.each(['supabase/migrations/x.sql', 'src/foo.ts'])('sigue bloqueando %s', (f) => {
    expect(escribir('limitar-escritura.mjs', ['tests'], f).codigo).toBe(2)
  })

  it.each([
    '../fuera/foo.test.ts',
    '../../fuera/src/foo.test.tsx',
    '../fuera/__snapshots__/foo.snap',
    '/tmp/otra/foo.test.ts',
    '/tmp/otra/__snapshots__/foo.snap',
  ])('bloquea rutas fuera del proyecto: %s', (f) => {
    expect(escribir('limitar-escritura.mjs', ['tests'], f).codigo).toBe(2)
  })

  it('una ruta absoluta dentro del proyecto sigue valiendo', () => {
    expect(escribir('limitar-escritura.mjs', ['tests'], path.join(raiz, 'src/foo.test.ts')).codigo).toBe(0)
  })

  it('regresión: permite src/foo.test.ts', () => {
    expect(escribir('limitar-escritura.mjs', ['tests'], 'src/foo.test.ts').codigo).toBe(0)
  })
})

describe('proteger (Edit/Write)', () => {
  it.each(['.env', '.env.local'])('sigue bloqueando %s', (f) => {
    expect(escribir('proteger.mjs', [], f).codigo).toBe(2)
  })

  it('bloquea src/shared/types/database.ts', () => {
    expect(escribir('proteger.mjs', [], 'src/shared/types/database.ts').codigo).toBe(2)
  })

  it('regresión: permite src/foo.ts', () => {
    expect(escribir('proteger.mjs', [], 'src/foo.ts').codigo).toBe(0)
  })
})
