# Plan: limpieza de archivos huérfanos en Storage (#28)

**Objetivo.** Un script de mantenimiento que detecta y borra los objetos de Storage que ninguna fila referencia (0016 acepta el huérfano como único modo de falla). Opción A elegida: sigue el molde del importador del padrón (0019), sin pantalla ni superficie de borrado en el navegador.

**Uso.**
- `npm run storage:limpiar` simula: imprime el informe y no borra nada.
- `npm run storage:limpiar -- --aplicar` borra en el Supabase local.
- Nube: `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run storage:limpiar -- --aplicar --confirmar=<host>` (`resolverDestino` de `scripts/lib/entorno.ts`; la corre una persona).
- `--edad-minima=<minutos>` (por defecto 60): un objeto más joven no se toca, porque el alta sube primero e inserta después y una subida en curso parece huérfana.

**Qué es un huérfano.** Un objeto del bucket `talleres` cuya ruta no está en `recurso.ruta_archivo`, o del bucket `normativas` cuya ruta no está en `normativa.ruta_archivo`, con más de la edad mínima. Los objetos con ruta referenciada nunca se borran. Falla cerrada: si cualquier consulta o listado falla, no se borra nada y sale con código 1.

**Archivos.**
- `scripts/storage/planificar.ts` (puro, con `planificar.test.ts`): recibe los objetos listados (`bucket`, `ruta`, `creado`, `tamanio`), las rutas referenciadas por bucket y el reloj; devuelve `{ huerfanos, conservados, jovenes }` por bucket. Sin imports de supabase.
- `scripts/limpiar-storage.ts`: argumentos, conexión (copia el patrón de `importar-padron.ts`: `resolverDestino` y `supabaseLocal`), listado recursivo del bucket por páginas (`talleres` tiene una carpeta por taller), lectura paginada de las rutas referenciadas (`recurso` solo con `ruta_archivo` no nula), informe (conteo, bytes y rutas por bucket) y borrado por lotes con `storage.remove`. Un `remove()` que devuelve menos objetos de los pedidos cuenta como error.
- `package.json`: script `storage:limpiar`.
- `.claude/hooks/proteger-bash.mjs` (+ su test, si existe): bloquear `storage:limpiar` con `--confirmar` o `SUPABASE_URL`, igual que el padrón: la nube la limpia una persona.
- `docs/arquitectura.md`: Entorno (el script) y la brecha de huérfanos; nota en `docs/decisiones/0016` (consecuencia: ya existe la limpieza).

**Pasos (test primero).**
1. Tests de `planificar`: ruta referenciada se conserva; sin referencia y vieja se marca; sin referencia y joven (< edad mínima) se salta; bucket sin objetos; referencia sin objeto (fila sin archivo) se informa pero no se toca; rutas con carpeta.
2. Implementar `planificar.ts`.
3. Script con simulación y aplicación; conservar la salida 1 ante errores.
4. Hook y documentación.

**Verificación.** `npx vitest run scripts` (¿el include de vitest toma `scripts/`? verificarlo), `npm run lint`, `npm run typecheck` (`tsconfig.node.json` tipa los scripts). Toca Storage: `qa` después del revisor, contra el Supabase local: sembrar un huérfano viejo, uno joven y uno referenciado en cada bucket, comprobar que la simulación no borra, que `--aplicar` borra solo el viejo y que el referenciado sigue descargable. Después `npm run db:reset`. Sin e2e de navegador (no hay pantalla).

**Fuera de alcance.** Pantalla del admin, ejecución programada, dar de baja las filas sin archivo (solo se informan), el logo (bucket aún inexistente), subida reanudable (#29), y borrar huérfanos de la nube desde un agente (lo bloquea el hook).
