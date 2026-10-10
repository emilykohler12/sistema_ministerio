// @vitest-environment node
// Despachador de permisos por rol (.claude/hooks/roles.mjs), registrado en settings.json.
// Los hooks del frontmatter de .claude/agents no corren sin la confianza de la carpeta (0021):
// este hook global lee agent_type y aplica el perfil del subagente. Bloqueo = exit 2.
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

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

describe('roles: herramientas de escritura y rutas', () => {
  it('NotebookEdit usa notebook_path', () => {
    const entrada = (agent_type: string, notebook_path: string) => ({
      tool_name: 'NotebookEdit',
      agent_type,
      tool_input: { notebook_path },
    })
    expect(roles(entrada('critico', 'src/x.ipynb')).codigo).toBe(2)
    expect(roles(entrada('critico', 'docs/specs/padron/critica.md')).codigo).toBe(0)
  })

  it('MultiEdit cuenta como escritura', () => {
    expect(escribir('critico', 'src/x.ts', 'MultiEdit').codigo).toBe(2)
    expect(escribir('critico', 'docs/specs/padron/critica.md', 'MultiEdit').codigo).toBe(0)
  })

  it('un file_path vacío cae a notebook_path', () => {
    const r = roles({
      tool_name: 'NotebookEdit',
      agent_type: 'critico',
      tool_input: { file_path: '', notebook_path: 'src/x.ipynb' },
    })
    expect(r.codigo).toBe(2)
  })

  it.each([
    ['sin ruta', {}],
    ['ruta vacía', { file_path: '' }],
    ['ruta numérica', { file_path: 5 }],
    ['ruta como lista', { file_path: ['docs/specs/padron/critica.md'] }],
  ])('bloquea una escritura %s', (_nombre, tool_input) => {
    expect(roles({ tool_name: 'Write', agent_type: 'critico', tool_input }).codigo).toBe(2)
  })

  it('bloquea una escritura sin tool_input', () => {
    expect(roles({ tool_name: 'Write', agent_type: 'critico' }).codigo).toBe(2)
  })

  it.each([
    ['sin command', {}],
    ['command numérico', { command: 5 }],
    ['command como lista', { command: ['ls'] }],
  ])('bloquea un Bash %s', (_nombre, tool_input) => {
    expect(roles({ tool_name: 'Bash', agent_type: 'critico', tool_input }).codigo).toBe(2)
  })

  it.each([
    ['ruta absoluta fuera del proyecto', '/tmp/otra/critica.md'],
    ['ruta absoluta fuera con la forma de un permitido', '/tmp/docs/specs/padron/critica.md'],
    ['ruta con .. que sale del proyecto', '../fuera/docs/specs/padron/critica.md'],
    ['ruta con .. que cae en un archivo ajeno', 'docs/specs/padron/../../../src/x.ts'],
  ])('critico no puede escribir: %s', (_nombre, archivo) => {
    expect(escribir('critico', archivo).codigo).toBe(2)
  })

  it('una ruta absoluta dentro del proyecto sigue valiendo', () => {
    expect(escribir('critico', path.join(raiz, 'docs/specs/padron/critica.md')).codigo).toBe(0)
  })

  it.each([
    ['ruta absoluta fuera del proyecto', '/tmp/otra/x.test.ts'],
    ['ruta con .. que sale del proyecto', '../fuera/x.test.ts'],
    ['ruta con .. hacia un snapshot ajeno', '../fuera/__snapshots__/x.snap'],
  ])('test-writer no puede escribir: %s', (_nombre, archivo) => {
    expect(escribir('test-writer', archivo).codigo).toBe(2)
  })
})

describe('roles: agent_type con claves del prototipo', () => {
  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])('%s se trata como desconocido', (agente) => {
    expect(escribir(agente, 'src/x.ts').codigo).toBe(2)
    expect(bash(agente, 'node -e 1').codigo).toBe(2)
    expect(bash(agente, 'ls').codigo).toBe(0)
  })
})

describe('roles: bash, evasiones por comillas y banderas peligrosas', () => {
  it.each([
    ['critico', 'find . -maxdepth 0 -exec echo x {} +'],
    ['critico', 'find . -maxdepth 0 "-exec" echo x {} +'],
    ['critico', "find . -maxdepth 0 -ex''ec echo x {} +"],
    ['critico', 'find . -maxdepth 0 -ex\\ec echo x {} +'],
    ['critico', "find . '-execdir' echo x {} +"],
    ['critico', 'find . "-delete"'],
    ['critico', 'find . -ok echo x {} ;'],
    ['critico', 'find . -fprint salida.txt'],
    ['critico', 'find . "-fprintf" salida.txt x'],
    ['critico', 'find . -fls salida.txt'],
    ['Explore', 'find . "-exec" echo x {} +'],
    ['revisor', 'find . "-exec" echo x {} +'],
    ['critico', 'rg --pre echo -l . archivo'],
    ['critico', 'rg "--pre" echo -l . archivo'],
    ['critico', "rg --pr''e echo -l . archivo"],
    ['critico', 'rg --pre-glob "*.md" foo'],
    ['critico', 'rg --hostname-bin echo foo'],
    ['critico', 'git diff --ext-diff main'],
    ['critico', 'git diff "--ext-diff" main'],
    ['critico', "git diff --ext-di''ff main"],
    ['critico', 'git log --textconv'],
    ['critico', 'git -c core.pager=echo log'],
    ['critico', 'GIT_EXTERNAL_DIFF=echo git diff --ext-diff main'],
    ['critico', 'GIT_EXTERNAL_DIFF=echo git diff main'],
    ['revisor', 'NODE_OPTIONS=--require=./x.js npm test'],
    ['revisor', 'PW_TEST_REPORTER=./x.js npm test'],
    ['revisor', 'CI=1 NODE_OPTIONS=--require=./x.js npm test'],
    ['qa', 'NODE_OPTIONS=--require=./x.js npm run test:e2e'],
    ['qa', 'FOO=bar npx playwright test'],
    ['revisor', 'CI="1" npm test'],
    ['revisor', 'CI=1; npm test'],
    ['revisor', 'FORCE_COLOR=x npm test'],
    ['critico', 'find . -$X echo x {} +'],
    ['critico', 'find . "-${X}" echo x {} +'],
    ['critico', 'find . -e{x,x}ec echo x {} +'],
  ])('%s no puede correr %s', (agente, comando) => {
    expect(bash(agente, comando).codigo).toBe(2)
  })

  it.each([
    ['revisor', 'npm run lint -- --fix'],
    ['revisor', 'npm run lint -- "--fix"'],
    ['revisor', "npm run lint -- --fi''x"],
    ['revisor', 'npx oxlint --fix'],
    ['revisor', "npx oxlint --fi''x"],
    ['revisor', 'npx oxlint "--fix-dangerously"'],
    ['test-writer', 'npx oxlint "--fix"'],
    ['qa', 'npm run lint -- "--fix"'],
    ['qa', 'npm run test:e2e -- "--config=otra.config.ts"'],
    ['qa', "npx playwright test --repor''ter=./mio.js"],
    ['qa', 'npx playwright test "-c" otra.config.ts'],
    ['qa', 'npx playwright test "--ui"'],
    ['qa', 'npm run test:e2e -- "--output=/etc"'],
  ])('%s no puede correr %s', (agente, comando) => {
    expect(bash(agente, comando).codigo).toBe(2)
  })

  it.each([
    ['critico', 'sort -o salida.txt package.json'],
    ['critico', 'sort -ro salida.txt package.json'],
    ['critico', 'sort "-o" salida.txt package.json'],
    ['critico', 'sort --output=salida.txt package.json'],
    ['critico', 'sort --compress-program=echo package.json'],
    ['critico', 'tree -o salida.txt'],
    ['critico', 'tree -L 2 -o salida.txt'],
    ['critico', 'git diff --stat --output=salida.txt main'],
    ['critico', 'git log --output=salida.txt'],
    ['critico', 'git show "--output=salida.txt" HEAD'],
    ['critico', 'uniq entrada.txt salida.txt'],
    ['critico', 'uniq -c entrada.txt salida.txt'],
  ])('%s no puede escribir con %s', (agente, comando) => {
    expect(bash(agente, comando).codigo).toBe(2)
  })

  it.each([
    ['critico', 'git branch nueva'],
    ['critico', 'git branch -d vieja'],
    ['critico', 'git branch -D vieja'],
    ['critico', 'git branch "-D" vieja'],
    ['critico', 'git branch -m vieja nueva'],
    ['critico', 'git branch -M vieja nueva'],
    ['critico', 'git branch -f rama HEAD'],
    ['critico', 'git branch -c rama copia'],
    ['critico', 'git branch --delete vieja'],
    ['critico', 'git branch --force rama HEAD'],
    ['critico', 'git branch --set-upstream-to=origin/main'],
    ['critico', 'git branch --list -D vieja'],
    ['critico', 'git branch --merged -D vieja'],
    ['critico', 'git branch -v nueva'],
  ])('%s no puede correr %s', (agente, comando) => {
    expect(bash(agente, comando).codigo).toBe(2)
  })

  it.each([
    ['critico', 'git branch'],
    ['critico', 'git branch -a'],
    ['critico', 'git branch -r'],
    ['critico', 'git branch -v'],
    ['critico', 'git branch -vv'],
    ['critico', 'git branch --list'],
    ['critico', 'git branch --list "feat/*"'],
    ['critico', 'git branch --merged'],
    ['critico', 'git branch --merged main'],
    ['critico', 'git branch --no-merged main'],
    ['critico', 'git branch --show-current'],
    ['critico', 'git branch --contains HEAD'],
    ['critico', 'git branch 2>/dev/null'],
    ['Explore', 'git branch --merged main'],
    ['critico', 'git diff main'],
    ['critico', 'git diff --stat main'],
    ['critico', 'sort package.json'],
    ['critico', 'sort -u package.json'],
    ['critico', 'cat package.json | sort | uniq -c'],
    ['critico', 'uniq entrada.txt'],
    ['critico', 'tree -L 2 src'],
    ['critico', 'find . -name x'],
    ['critico', 'find . -name a -o -name b'],
    ['critico', 'grep -rn foo src'],
    ['critico', 'rg foo src'],
    ['critico', 'git log --oneline -3'],
    ['revisor', 'CI=1 npm test'],
    ['revisor', 'CI=true npm test'],
    ['revisor', 'FORCE_COLOR=0 npm test'],
    ['revisor', 'CI=1 FORCE_COLOR=0 npm test'],
    ['revisor', 'npm run lint'],
    ['revisor', 'npm run typecheck'],
    ['revisor', 'npx vitest run src/x.test.ts --reporter=dot'],
    ['qa', 'CI=1 npx playwright test --workers=1'],
    ['qa', 'npm run test:e2e -- --grep "alta de institución"'],
    ['qa', 'npm run test:e2e -- -g login --retries=1'],
  ])('%s puede correr %s', (agente, comando) => {
    expect(bash(agente, comando).codigo).toBe(0)
  })
})

describe('roles: principal y libres no dependen de perfiles.mjs', () => {
  // Copia roles.mjs junto a un perfiles.mjs roto: si el hook lo importara antes de mirar agent_type, fallaría.
  const dir = mkdtempSync(path.join(tmpdir(), 'roles-'))
  copyFileSync(path.join(raiz, '.claude/hooks/roles.mjs'), path.join(dir, 'roles.mjs'))
  writeFileSync(path.join(dir, 'perfiles.mjs'), 'esto no es javascript valido {{{')
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  const conPerfilesRoto = (entrada: string | Record<string, unknown>) => {
    const r = spawnSync('node', [path.join(dir, 'roles.mjs')], {
      input: typeof entrada === 'string' ? entrada : JSON.stringify(entrada),
      encoding: 'utf8',
      cwd: raiz,
      env: { ...process.env, CLAUDE_PROJECT_DIR: raiz },
    })
    return r.status
  }
  const llamada = (agent_type: string | undefined) => ({
    tool_name: 'Bash',
    agent_type,
    tool_input: { command: 'ls' },
  })

  it.each([undefined, '', 'implementador', 'general-purpose', 'Plan', 'statusline-setup'])(
    'agent_type %j sigue pasando con perfiles.mjs roto',
    (agente) => {
      expect(conPerfilesRoto(llamada(agente))).toBe(0)
    },
  )

  it('un rol con perfil falla cerrado si perfiles.mjs está roto', () => {
    expect(conPerfilesRoto(llamada('critico'))).toBe(2)
  })

  it('un JSON roto sigue bloqueando aunque perfiles.mjs esté roto', () => {
    expect(conPerfilesRoto('{no es json')).toBe(2)
  })
})

describe('roles: falla cerrada', () => {
  it('stdin vacío bloquea', () => {
    expect(roles('').codigo).toBe(2)
  })

  it.each(['null', '5', '"texto"', '[]'])('un JSON %s bloquea', (json) => {
    expect(roles(json).codigo).toBe(2)
  })

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
