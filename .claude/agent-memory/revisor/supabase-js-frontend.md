---
name: supabase-js-frontend
description: Cómo revisar la integración de supabase-js en el frontend del DAM; las trampas repetidas ya son reglas (rules/react.md, rules/datos.md); quedan técnicas de revisión, huecos de proceso y datos de la librería para no dar falsos positivos
metadata:
  type: project
---

**Promovido a reglas (2026-10-16).** Las trampas que encontré entre 6 y 9 veces (de auth-configuracion a descargas) ahora están en
`.claude/rules/react.md` y `.claude/rules/datos.md`, que se cargan al implementador cuando toca esos archivos: `isPending`, rama
`isError` con test (incluidas las queries secundarias), formulario de edición sin carga, error lanzado vs `{ error }`, ruta de Storage
de la base y no de la caché, `Number(null)`, `invalidateQueries` en `onError`. Ya no las describas de nuevo: verificá que se cumplan
y, si una regla se incumple, citala ("incumple rules/datos.md: …"). Si aparece una trampa nueva por segunda vez, proponé sumarla a la regla.

**Obsoleto:** "la verificación en el navegador no quedó anotada en `notas.md`" (9 veces). Desde 0020 la hace el `qa` y queda en
`qa.md`; en el carril chico sin qa, el coordinador corre `test:e2e` (0023). No lo reportes salvo que el flujo no haya corrido el qa.

## Técnicas de revisión que siguen valiendo
- En cada `useX(id)` que devuelve `null` si no existe, buscá con grep **todos** los consumidores y revisá las tres ramas:
  `undefined` por error, `null` y un id que es de otro padre (p. ej. `:categoriaId` que no es del `:nivelId`).
- `idDeRuta` acepta cualquier entero seguro: un id fuera de `int4`/`smallint` da `400 22003` y `ErrorFallback` en lugar de
  "no encontrado". Se prueba con un GET anon de solo lectura `?id=eq.99999999999`.
- Handlers `async` en `onClick` sin `try/finally`, o `void promesa()` dentro de un `setTimeout`: rechazo sin capturar.
- UI de lotes (subidas): archivos descartados sin aviso durante un lote en curso y errores del lote anterior que siguen visibles.
- Cuando un fix vive en el query builder (`.eq('ruta_archivo', anterior)`, `.select('ruta_archivo')`), revertir la línea deja todo
  verde si solo hay tests de hooks (mockean `consultas`) y un e2e de una pestaña: pedí `consultas.test.ts` (fix-ruta-recursos,
  2026-10-16; ya está en `rules/datos.md`). `codigosDeError` incluye `code`; `StorageApiError` trae `code` tipo `EntityTooLarge`, que no
  choca con `'413'`/`'415'`. Con `onSettled: invalidar` en `RecursosPage` el aviso no se desmonta (vive en `Pantalla`).
- Un criterio de la spec reescrito durante la implementación que no figura en los desvíos de `notas.md`: `git diff main -- spec.md`.
- Con entregas en fases, `docs/arquitectura.md` y el "Estado actual" de `CLAUDE.md` quedan desactualizados en `main`. Se repitió en dashboard
  (2026-10-16): faltó la migración en "Base de datos" de arquitectura y no existía `notas.md`, aunque la spec mandaba cosas ahí. Revisá siempre las
  dos cosas.
- Un desvío de la spec que es un debounce o un `replace` de URL: el debounce puede quedar cubierto de forma indirecta (un test que falla con la
  consulta intermedia), pero el `replace`/`push` casi nunca tiene test. Pedí `useNavigationType()` en el componente sonda de la URL.
- El script de la API en el scratchpad (24 comprobaciones de RLS por REST) sirve de molde: `.single()` para PATCH bloqueados
  (406/PGRST116) y 23505/23514/22001/23503 por REST.

## Datos de la librería, para no reportar falsos positivos
- Con `onSuccess: () => invalidateQueries(...)`, React Query mantiene `isPending` hasta que termina el refetch: no hay ventana de
  datos viejos entre el éxito y la recarga.
- En el working tree, la mayoría de los archivos de `src/` tiene CRLF (vienen de Windows), aunque el índice está en LF y
  `.gitattributes` tiene `eol=lf`. El warning "CRLF will be replaced" no indica un problema: compará con `git ls-files --eol`.
- En auth-js 2.117.3, `signOut()` borra la sesión local aunque `/logout` falle por red y devuelve `{ error }` sin lanzar, pero
  **solo con el access token vigente**. Si está vencido y el refresh falla, no borra nada (ver [[temporizadores-sesion]]). `flowType`
  por defecto es `implicit`: no se escriben claves `-code-verifier`.
- El bundle contiene el string `sb_secret_` porque supabase-js detecta el prefijo de la clave: no es una fuga. Para buscar una
  clave real, usá `sb_secret_[A-Za-z0-9_-]{6,}` y JWT `eyJ…\.…`.
- Para verificar la clave publishable sin leer `.env*`, pasá `npx supabase status -o json` por stdin a un script de Node en el
  scratchpad que haga `/auth/v1/token` y `rpc/es_admin` sin imprimir la clave. Los hooks bloquean cualquier comando que mencione `.env`.

**Why:** los criterios del DAM dicen "cualquier otro error muestra un mensaje genérico", y la evidencia tiene que ser un test.
**How to apply:** primero verificá las reglas de `rules/react.md` y `rules/datos.md`; después aplicá las técnicas de arriba.
Ver también [[supabase-privilegios-y-tests]] y [[formularios-rhf-a11y]].
