// PreToolUse global (settings.json): aplica el perfil de permisos del subagente que hace la llamada (0021).
// Los hooks del frontmatter de .claude/agents no corren sin la confianza de la carpeta (sesiones del SDK o -p),
// así que el rol se lee de `agent_type` en la entrada. Falla cerrada: cualquier error sale con exit 2.
//   sin agent_type (agente principal) o rol libre → sin restricción (siguen proteger.mjs y proteger-bash.mjs)
//   rol con perfil → el de perfiles.mjs · rol desconocido → no escribe y solo lee por bash
// Los imports son dinámicos y dentro del try: un import estático que falla saldría con exit 1, que no bloquea.

function bloquear(motivo) {
  process.stderr.write(motivo + '\n')
  process.exit(2)
}

const ROLES = {
  critico: { escritura: 'critico', bash: 'lectura' },
  revisor: { escritura: 'revisor', bash: 'checks' },
  'test-writer': { escritura: 'tests', bash: 'checks' },
  qa: { escritura: 'qa', bash: 'qa' },
  Explore: { escritura: 'ninguno', bash: 'lectura' },
}
const LIBRES = new Set(['implementador', 'general-purpose', 'claude', 'Plan', 'claude-code-guide', 'statusline-setup'])
const DESCONOCIDO = { escritura: 'ninguno', bash: 'lectura' }
const ESCRITURA = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit'])

try {
  const { motivoBash, motivoEscritura } = await import('./perfiles.mjs')
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  const input = JSON.parse(raw)
  const agente = input.agent_type
  if (!agente || LIBRES.has(agente)) process.exit(0)

  const rol = ROLES[agente] ?? DESCONOCIDO
  const herramienta = input.tool_name
  let motivo = null
  if (ESCRITURA.has(herramienta)) {
    motivo = motivoEscritura(rol.escritura, input.tool_input?.file_path ?? input.tool_input?.notebook_path)
  } else if (herramienta === 'Bash') {
    motivo = motivoBash(rol.bash, input.tool_input?.command ?? '')
  }
  if (motivo) bloquear(`${motivo} (rol ${agente})`)
  process.exit(0)
} catch (e) {
  bloquear(`Bloqueado: roles.mjs no pudo evaluar la llamada (${e?.message ?? e}). Falla cerrada.`)
}
