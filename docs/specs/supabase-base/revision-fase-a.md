# Revisión: supabase-base, Fase A (entorno)

- **Rama:** `chore/supabase-entorno` (working tree sin commitear)
- **Fecha:** 2026-10-08
- **Alcance:** criterios 1 a 3 y el bullet "Diseño: Fase A" de `spec.md`. La Fase B queda fuera.

## Veredicto
**Cambios requeridos.** El criterio 3 no se cumple "en cualquier forma de invocación". Lo demás de la Fase A está bien
o es aceptable.

## Cumplimiento de la Fase A

| Ítem | Estado |
|---|---|
| C1: `db:start`, sin realtime ni analytics, Studio y Mailpit desde el host | Configurado (`config.toml:88`, `:390`, puertos en `devcontainer.json`). Falta verificarlo tras reconstruir el contenedor |
| C2: signup deshabilitado | Configurado (`config.toml:178`, `:223`). Falta verificarlo con `curl` |
| C3: bloqueo remoto en `proteger-bash.mjs` | **Parcial**: se puede evadir (ver B1) |
| devcontainer: DinD y puertos 54321/54323/54324 | OK. El volumen no se declara a mano, como pide la crítica |
| package.json: `supabase` y los scripts `db:*` / `test:db` locales | OK. Ningún script lleva `--linked` ni `--db-url`. `db:types` usa `--local` |
| `.gitignore` | OK (`.env.*`, `!.env.example`, `.temp`, `.branches`, `functions/.env`) |
| `limitar-bash` checks: solo `^npm run (db:reset\|test:db)$` | OK: anclado, y `test(?!:db)` evita que la regla vieja deje pasar `test:db -- ...` |
| `limitar-escritura` tests: `supabase/tests/*.sql` | OK (`relPath` normaliza `..`) |
| `proteger.mjs`: exceptúa solo `.env.example` y bloquea `database.ts` | OK: compara el nombre exacto, así que `.env.example.local` sigue bloqueado |
| Skill `supabase-rls` | OK: coherente con la spec (comandos, `app_metadata`, TRUNCATE, nube, sin nota de "pendiente") |

## Problemas

### Bloqueante

- **B1** `.claude/hooks/proteger-bash.mjs:21-26`: hay varias formas triviales de saltear el bloqueo, y el criterio 3
  pide "cualquier forma de invocación". Ninguna está cubierta por los tests:
  - **Argumentos entre comillas.** `analizarComando` reemplaza todo lo entrecomillado por `Q`, y el chequeo sin
    anidamiento solo mira los segmentos. Por eso `npx supabase "link"`, `npx supabase db reset "--linked"` y
    `npx supabase "db" push` pasan.
  - **Un flag entre `db` y `push`.** Cobra acepta flags antes del subcomando, así que `npx supabase db --debug push`
    funciona y no matchea `db\s+push`. Además, `db push` apunta por defecto al proyecto vinculado.
  - **Continuación de línea.** `npx supabase db \⏎push` y `npx supabase \⏎link` se parten en `\n`, y el segmento
    que trae `link`/`push` ya no contiene `supabase`.
  - **Sustitución y pipes.** `npx supabase $(echo link)` (el lookahead `(?=\s|$)` falla con el `)`),
    `echo link | xargs npx supabase` y `echo "npx supabase link" | bash` (es `bash` sin `-c`, así que no cuenta como
    anidado).
  - **Arreglo sugerido:** evaluar `remoto()` sobre segmentos a los que solo se les sacan las comillas, conservando el
    contenido (`'x'`→`x`). Antes de partir, unir las líneas que terminan en `\`. Para `push`, usar algo como
    `\bdb\b.*\bpush\b`. Y bloquear `$(`, backticks y `| (ba|z|da)?sh` / `xargs` cuando el comando nombra `supabase`.
    Hay que agregar un test por cada forma.

### Importante

- **I1** `.claude/hooks/proteger-bash.mjs:21-22`: la lista negra no cubre otros caminos remotos. Algunos subcomandos
  usan el proyecto vinculado por defecto, sin `--linked`: `db dump`, `db pull`, `migration list`, `migration repair`
  e `inspect db`. Otros apuntan a un proyecto con `--project-ref` o `--project-id`: `gen types --project-id`,
  `functions deploy`, `secrets`, `config push`, `projects` y `branches`. Hoy no hay token ni `project-ref`
  (`supabase/.temp` está ignorado y `login`/`link` están bloqueados). Pero si una persona hace `supabase login` o
  `link` en su contenedor para las demos, un agente llega a la nube sin ninguno de los cinco patrones. **Arreglo:**
  bloquear `--project-ref`/`--project-id` y esos subcomandos, o pasar a una lista blanca de subcomandos locales
  (`start`, `stop`, `status`, `db reset`, `test db`, `migration new`, `gen types --local`).
- **I2** `tsconfig.app.json:7`: se agregó `"node"` a los `types` del código de navegador para tipar
  `src/test/hooks/hooks.test.ts`. Eso hace que `process`, `Buffer` y `node:*` typecheckeen en todo `src/`, y un
  `process.env.X` en un componente pasaría `tsc` pero rompería en el navegador. El cambio está fuera de la spec.
  **Arreglo:** excluir `src/test/hooks/**` de `tsconfig.app.json` e incluirlo en `tsconfig.node.json`, que ya tiene
  `types: ["node"]`, o en un tsconfig propio de los tests de hooks.

### Menor

- **M1** `.claude/settings.json:21,23`: el `deny` `Read/Edit(./.env.*)` sigue bloqueando `.env.example`, así que la
  excepción de `proteger.mjs` hoy no tiene efecto. **Es aceptable para la Fase A**, porque `.env.example` es del primer
  corte de dominio y el deny no admite excepciones. Conviene dejarlo anotado en `contexto.md` o en la spec del primer
  corte, para que una persona lo cree a mano o se reemplace el comodín por las variantes explícitas.
- **M2** `supabase/config.toml:72`: `sql_paths = ["./seed.sql"]` apunta a un archivo que no existe, porque el seed va
  por script Node (Fase B). `db reset` solo debería avisar, pero conviene apagar `[db.seed]` o vaciar `sql_paths` para
  que no haya ruido en C1 ni en el primer `db:reset`.
- **M3** `.claude/hooks/limitar-bash.mjs:30` (preexistente, ahora toca los `db:*`): las variables al inicio se sacan
  antes de aplicar el ancla, así que `CUALQUIER=valor npm run db:reset` pasa. No conozco ninguna variable del CLI que
  apunte `db reset` a una base remota, pero el ancla "sin argumentos extra" se puede rodear así. Se puede exigir que
  el segmento completo sea exactamente `npm run db:reset` o `npm run test:db`.
- **M4** `package.json:17` (afecta a la Fase B): si `supabase gen types` falla, la redirección `>` ya truncó
  `database.ts`, y además `src/shared/types/` todavía no existe. Para tenerlo en cuenta en la Fase B: generar a un
  temporal y mover.
- **M5** `supabase/config.toml:160`: `site_url = http://127.0.0.1:3000`, pero Vite corre en el 5173. No afecta a la
  Fase A, pero sí a los enlaces de los correos de Auth (Mailpit) cuando se integre el login.

## Sobre lo que reportó el implementador
- **`settings.json` sin cambios:** aceptable (M1).
- **`"node"` en `tsconfig.app.json`:** no es aceptable tal como está (I2). Tiene un arreglo barato.
- **C1 y C2 sin Docker:** aceptable. Hay que verificarlos tras reconstruir el contenedor y antes de mergear el PR A
  (`npm run db:start`, `npx supabase status`, Studio/Mailpit desde el host y `curl -X POST .../auth/v1/signup`).

## Calidad de los tests (`src/test/hooks/hooks.test.ts`)
Prueban el contrato real: el proceso, el stdin JSON y el exit code. Cubren los cinco patrones del criterio 3, los
comandos locales permitidos y las regresiones de cada perfil. Les faltan los casos de evasión de B1 y los de I1, y un
caso de `npm run test:db -- --db-url x` en `limitar-bash`.

## Evidencia
- `npm run lint`: 0 errores y 4 warnings, todos preexistentes en `src/features` y `src/pages` (`incompatible-library`
  y `only-export-components`).
- `npm run typecheck` (`tsc -b`): sin errores.
- `npm test`: 4 archivos y 33 tests en verde (vitest 5.0.3).
- Encontré B1 leyendo el código: el perfil del revisor no puede ejecutar los hooks directamente. Cada caso sale de
  aplicar `analizarComando` y las regex de las líneas 21-25 a mano.
