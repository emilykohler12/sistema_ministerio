---
paths:
  - "src/features/**/consultas.ts"
  - "src/features/**/secuencias.ts"
  - "src/features/**/errores.ts"
  - "src/features/**/hooks/**"
---

# Acceso a datos (supabase-js + React Query)

Molde: `consultas.ts` (solo supabase) → `secuencias.ts` (orden entre base y Storage, 0016) → hooks delgados (0012).

## Trampas que ya se repitieron (las encontró el revisor o el crítico en varios cortes)

- supabase-js devuelve `{ error }`, pero **también lanza** (red, auth-js, storage-js). Cubrí los dos caminos y testeá el rechazo
  con `mockRejectedValue`, no solo el `{ error }`.
- Una baja o un reemplazo con archivo borra la ruta que **devuelve la base** (`.delete().select('ruta').single()` o el retorno de
  la RPC), nunca la de la caché.
- `details` de PostgREST puede venir `null`, y `Number(null) === 0`: validá antes de convertir.
- Invalidar ante un error (`onError` u `onSettled`): antes, seguí qué pantallas leen esa clave. Si una desmonta al componente que
  muestra el error, el mensaje nunca se ve: invalidá al cerrar (molde: `DescargaModal`). Si el mensaje promete recargar
  ("…actualizamos la lista"), todos los hooks que puedan recibir ese código invalidan en `onSettled` (molde: `useRecursos`).
- Un cambio cuyo núcleo es un filtro del query builder (`.eq(...)`, `.select(...)`) lleva su `consultas.test.ts` con `supabase.from`
  mockeado como cadena (molde: `descargas/consultas.test.ts`): los tests de hooks mockean `consultas` y no lo ven.
- Una mutación no mezcla escritura y lectura: mutación para escribir y `useQuery` habilitado para leer (con "Reintentar" = `refetch`).
- Un hook `use*` llama al menos un hook; si no, es una función común.
- Lo genérico (normalizar, ids de ruta, códigos de error, Storage) va en `src/shared/lib/`: un dominio no importa de otro dominio.
  Buscá ahí antes de escribir un helper.
