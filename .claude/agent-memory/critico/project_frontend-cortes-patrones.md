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

**Why:** la fase B de cada corte copia el molde de la anterior, y estas tres cosas no las detecta el typecheck ni los tests.

**How to apply:** en la crítica de código de cada corte con pantallas del portal o enums nuevos, buscar `isLoading` seguido de
`!data` → "no encontrado", listas literales de un enum y constantes de mensajes repetidas. Ver la Respuesta en
`docs/specs/talleres/critica.md`. Relacionado: [[supabase-auth-rls-trampas]], [[postgres-rpc-triggers-trampas]].
