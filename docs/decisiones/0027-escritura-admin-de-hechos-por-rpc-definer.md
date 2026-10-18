# 0027 · El admin escribe tablas de hechos solo por una RPC definer que valida

- **Estado:** aceptada
- **Fecha:** 2026-10

## Contexto
Para vincular las instituciones "Otra" (#19), el admin tiene que completar `registro_descarga.establecimiento_id`, pero solo con un establecimiento
activo de la misma localidad (`DA005`). El patrón de los cortes de catálogo es otro: RPC invoker, grant de UPDATE por columna y política
`es_admin()`. Con ese patrón, el mismo admin puede hacer el UPDATE por PostgREST y saltear la RPC: vincular a un inactivo, cambiar filas `PADRON` o desvincular.

## Opciones consideradas
- **Invoker con grant y política:** igual que `guardar_taller`. La validación quedaría en la RPC y se podría saltear, o habría que duplicarla en un trigger.
- **Invoker con trigger que valida:** cierra el agujero, pero reparte la regla entre dos objetos y el grant sigue abriendo columnas de un hecho histórico.
- **Definer sin grant ni política:** la RPC es la única vía de escritura.

## Decisión
En las tablas de hechos (`registro_descarga` y las que vengan, como eventos o límites de frecuencia), el admin escribe **solo** por una RPC `security definer`.
La RPC empieza con `es_admin()` → `42501`, tiene `search_path` vacío y revoca EXECUTE a `public`, `anon` y `service_role`. Valida y bloquea lo que lee (`for share`).
No hay grant de escritura ni política de UPDATE para `authenticated`: un pgTAP fija que el UPDATE directo da `42501`.
Es el mismo molde que 0017 y 0022, ahora también para el admin. Las tablas de catálogo siguen con el patrón invoker.

## Consecuencias
- La regla vive en un solo lugar y no hay forma de escribir que la evite. `auditar()` sigue registrando con el `auth.uid()` del admin.
- Cada RPC definer tiene que probar en pgTAP que `es_admin()` se evalúa antes que la validación y que no tiene EXECUTE para `public`, `anon` ni `service_role`.
- Desvincular o corregir una vinculación necesitará su propia RPC.
