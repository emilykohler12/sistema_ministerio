# 0014 · La caché de React Query se limpia cuando cambia el usuario

- **Estado:** aceptada
- **Fecha:** 2026-10

## Contexto
Desde `niveles-categorias`, una misma consulta devuelve filas distintas según el rol (RLS): anon ve solo las categorías activas y el admin
ve todas. Talleres (borradores) va a repetir el patrón. La caché solo se limpiaba en `SIGNED_OUT`. Por eso, quien pasaba por el portal y después
iniciaba sesión en la misma pestaña veía, durante el `staleTime`, los datos de anon en el panel.

## Opciones consideradas
- **Rol en la clave de cada query** (`['categorias', rol]`): cada hook tiene que leer `useAuth`, y es fácil olvidarlo en el próximo corte.
- **Limpiar en cada `SIGNED_IN`**: supabase-js lo vuelve a emitir al recuperar el foco con la misma sesión, y vaciaría la caché sin motivo.
- **Limpiar cuando cambia el usuario derivado** (id del admin o `null`), en un solo lugar (`AuthContext`).

## Decisión
La tercera opción. `AuthContext` guarda en un `useRef` el id anterior y llama a `queryClient.clear()` cuando cambia, salvo en `INITIAL_SESSION`.
Las claves de las queries no llevan el rol.

## Consecuencias
- Los cortes siguientes no hacen nada por rol en sus hooks: una sola clave por dominio (0012) sigue alcanzando.
- Al entrar o salir del panel se vuelven a pedir los datos. Para el volumen del DAM, el costo es despreciable.
- Si aparece un segundo rol con datos distintos, el id derivado tiene que incluirlo.
