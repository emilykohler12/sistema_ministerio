# 0029 · Las etiquetas sin uso se borran por un trigger acotado

- **Estado:** aceptada
- **Fecha:** 2026-10

## Contexto
`etiqueta` es una tabla compartida por talleres y normativas (0007) y no tenía delete: una etiqueta que ningún taller ni normativa usaba seguía
sugiriéndose en los formularios (#31). Las etiquetas se vinculan por `taller_etiqueta` y `normativa_etiqueta`, y la baja de una normativa borra su puente por
cascada sin pasar por ninguna RPC. `guardar_taller` y `guardar_normativa` crean las etiquetas nuevas (`resolver_etiquetas`) antes de sincronizar los puentes.

## Opciones consideradas
- **A. Trigger de sentencia** `after delete` en los dos puentes, con tabla de transición, que llama a una función `security definer`.
- **B. Mostrar solo las etiquetas en uso** (vista o RPC): no borra nada, sin carrera ni auditoría extra, pero la tabla acumula basura y el issue pedía borrar.
- **C. Botón "Limpiar etiquetas"** en el panel: control explícito, pero agrega pantalla y RPC, y depende de que alguien lo use.

## Decisión
Opción A. `borrar_etiquetas_huerfanas()` es `security definer`, `search_path` vacío, `returns trigger` y sin EXECUTE para nadie: solo la dispara el trigger. Borra
de `etiqueta` únicamente los ids que aparecen en las filas recién borradas y ya no están en ningún puente, nunca una barrida de toda la tabla: así no toca una etiqueta
recién creada que todavía no se vinculó. El admin sigue sin política ni grant de `delete` sobre `etiqueta`. La misma migración borró las huérfanas existentes.

## Consecuencias
- Cubre editar un taller, editar una normativa y la baja de una normativa (cascada) en un solo lugar; el cliente solo invalida `['etiquetas']` al dar de baja.
- Cada borrado queda en `registro_operacion` (con el admin que guardó, o nulo para la limpieza inicial).
- Ventanas conocidas, sin inconsistencia: un guardado que resuelve una etiqueta mientras otro le quita el último vínculo falla por la FK y se reintenta; dos guardados
  simultáneos que quitan los dos últimos vínculos pueden dejarla sin borrar.
- Cualquier tabla nueva que vincule etiquetas debe agregar su propio trigger, o sus etiquetas nunca se limpiarán.
