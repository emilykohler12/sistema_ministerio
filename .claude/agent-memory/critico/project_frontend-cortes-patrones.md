---
name: frontend-cortes-patrones
description: Patrones recurrentes del frontend en los cortes Supabase (fases B de talleres, recursos y normativas): isLoading vs isPending, enums duplicados, mensajes copiados, piezas genéricas importadas de otro dominio, ruta de caché al borrar
metadata:
  type: project
---

En la crítica del código de la fase B de `talleres` (2026-10-10) no aparecieron fallas de visibilidad ni de caché. Lo que encontré
son patrones que es probable que se copien en recursos y normativas:
- **`isLoading` en lugar de `isPending`** (React Query 5): sin red, la primera carga queda `paused`, `isLoading` es false y `data`
  es undefined. Una pantalla de detalle cae en "no encontrado" y una lista no muestra nada. El molde bueno es el del formulario
  (`data === undefined` → error o skeleton). Revisar las pantallas del portal en cada corte.
- **Enums escritos a mano:** `db:types` genera `Constants.public.Enums.<enum>` (tupla `as const`). Sirve para `z.enum(...)` y para
  recorrer opciones. Las etiquetas van en un `Record<Enum, string>` con `satisfies` (exhaustivo); un array con `satisfies` no detecta
  que falte un valor.
- **Mensajes de SQLSTATE propios** (DA001/DA002) copiados como constantes en cada pantalla. Propuse un `mensajeDeError(error, generico)`
  en `errores.ts` (puro).
- Props agregadas "para no tocar un test" (`mostrarNivel`): aceptarlas solo si hay además una razón de UX.

En la fase B de recursos (2026-10-10) se adoptó `useCategoriaDeRuta`, pero la escalera del taller (id inválido / error / cargando /
de otra categoría) quedó copiada en `TallerFormPage` y `RecursosPage`. Propuse `useTallerDeRuta`; ver en la Respuesta si se aceptó.
Además, una página llamaba a `consultas` directamente (`urlFirmada`), contra `.claude/rules/react.md`.

En la fase B de normativas (2026-10-10, segundo dominio con pantallas) apareció el **acoplamiento entre dominios**: normativas importaba
`normalizar`, `idDeRuta` y `TallerBuscador` de talleres, y `NoEncontrado` de `pages/admin/talleres`. Además, `codigos()` (413/415) estaba
copiado en los `errores.ts` de recursos y normativas. Propuse mudarlos a `shared/`. También: la baja borraba la ruta de la caché, mientras
que la edición ya usaba la de la base. El molde bueno: que la firma reciba solo el id y que la ruta salga de la RPC o del `delete ... select`.
Hooks `use*` que no llaman a ningún hook.

En la fase B de descargas (2026-10-10, primer formulario del portal) apareció **una mutación que mezcla una escritura con una lectura**
(registrar + firmar). Para disparar sola la parte de lectura hace falta `useEffect` + ref contra el modo estricto, `datos?` opcional
con `throw`, y un render que lee `sessionStorage`. Propuse mutación (escritura) + `useQuery` habilitado (lectura, `gcTime: 0`,
`retry: 1`), con "Reintentar" = `refetch`. Además se repitió el enum a mano (`TIPOS_INSTITUCION`), y `codigoDe` llegó a la cuarta
copia, así que propuse llevarlo a `shared/lib`. Formularios con campos que se vacían (`setValue(..., undefined)`) terminan en
`as unknown as Resolver` + un segundo `parse`; el molde es `useForm<In, unknown, Out>` (`EstablecimientoFormPage`).

En el plan de `fix-ruta-recursos` (2026-10-16) se usó concurrencia optimista: `.eq('ruta_archivo', anterior)` + `.single()` →
PGRST116, que cuenta como rechazo y dispara `compensar`. Es correcta y no hace falta separarla de "RLS filtró" o "fila borrada", porque
en ningún caso hubo UPDATE. Lo que sí hay que mirar: **el `mensajeDeError*` del dominio lo comparten todas las mutaciones de la página**.
Un mensaje atado a un código ("…recargamos la lista") aparece también en flujos que no invalidan en error. El molde: `onSettled: invalidar`
en todo hook que pueda recibir ese código. `codigoDe` a mano iba por la quinta copia; propuse sumar `code` a `codigosDeError` (shared).
Además, los planes del carril chico a veces citan la 0023 con un criterio de más ("Storage de anon"): contrastarlos con el texto del ADR.
En la crítica de código (2026-10-16) se aceptó todo. `onSettled` del hook no desmonta `Pantalla` (data sigue definida) ni cierra
`DialogoRecurso`. Solo atrasa el `onError` de la llamada hasta que termina la recarga. `codigosDeError` ya lee `code`, pero sigue en
`erroresStorage.ts`: propuse renombrarlo a `shared/lib/errores.ts` y migrar las 4 copias de `.code` cuando se toque cada dominio.

**Promovido a reglas (2026-10-16):** `isPending`, enums vía `Constants`, mensajes DA00x en `errores.ts`, ruta de la base en las
bajas, mutación que no mezcla escritura y lectura, hooks que no son hooks e imports entre dominios (a `shared/`) están en
`.claude/rules/react.md` y `.claude/rules/datos.md`. No los repitas como hallazgo nuevo: si se incumplen, citá la regla.

**Why:** la fase B de cada corte copia el molde de la anterior, y estas tres cosas no las detecta el typecheck ni los tests.

**How to apply:** en la crítica de código de cada corte con pantallas del portal o enums nuevos, buscar `isLoading` seguido de
`!data` → "no encontrado", listas literales de un enum y constantes de mensajes repetidas. Ver la Respuesta en
`docs/specs/talleres/critica.md`. Relacionado: [[supabase-auth-rls-trampas]], [[postgres-rpc-triggers-trampas]].
