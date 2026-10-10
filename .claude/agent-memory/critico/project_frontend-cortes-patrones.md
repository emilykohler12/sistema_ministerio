---
name: frontend-cortes-patrones
description: Patrones recurrentes del frontend en los cortes Supabase (fase B de talleres, 2026-10-10): isLoading vs isPending, enums duplicados en vez de Constants, mensajes de error copiados por pantalla
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

**Why:** la fase B de cada corte copia el molde de la anterior, y estas tres cosas no las detecta el typecheck ni los tests.

**How to apply:** en la crítica de código de cada corte con pantallas del portal o enums nuevos, buscar `isLoading` seguido de
`!data` → "no encontrado", listas literales de un enum y constantes de mensajes repetidas. Ver la Respuesta en
`docs/specs/talleres/critica.md`. Relacionado: [[supabase-auth-rls-trampas]], [[postgres-rpc-triggers-trampas]].
