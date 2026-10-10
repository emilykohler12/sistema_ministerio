# 0016 · Consistencia entre la base y Storage por orden de operaciones

- **Estado:** aceptada
- **Fecha:** 2026-10

## Contexto
Una fila de la base y su archivo en Storage no comparten transacción. Supabase bloquea el `DELETE` SQL sobre `storage.objects`, y borrar
la fila tampoco borraría el archivo, así que ningún trigger puede limpiar Storage. Surgió en el corte recursos (`docs/specs/recursos/`), y
normativas y logo van a tener el mismo problema.

## Opciones consideradas
- **Edge Function que orqueste todo:** contradice 0004, que reserva las funciones para la descarga y la gestión de usuarios.
- **Trigger que lea `storage.objects`** para validar que el archivo exista y tomar su tamaño: corre antes que la RLS (un anon recibe
  ese error en lugar de `42501`), no distingue "no existe" de "no lo veo" y acopla la base a internals de storage-api.
- **Orden de operaciones en el cliente, con compensación:** sin infraestructura nueva, y se puede probar con `vi.mock('./consultas')`.

## Decisión
- Invariante: ninguna operación de la app deja una fila apuntando a un archivo inexistente. Único modo de falla aceptado: un archivo huérfano.
- Orden: **alta** sube y después inserta; **reemplazo** sube el nuevo, actualiza la fila y borra el viejo; **baja** borra la fila y después el archivo.
- Se compensa (se borra el archivo recién subido) **solo si el servidor rechazó la escritura** (`code` no vacío). Ante un corte de red la
  escritura pudo confirmarse: no se borra nada y se avisa con `console.warn`. Un `remove()` que devuelve `data: []` cuenta como falla.
- El bucket se crea por migración y es la autoridad de formato y tamaño. La base no consulta `storage.objects`; el cliente informa `file.size`.

## Consecuencias
- Pueden quedar huérfanos en Storage. Su limpieza está pendiente (Brechas en `arquitectura.md`).
- Cada dominio con archivos reutiliza el molde `secuencias.ts` y la sección Storage de la skill `supabase-rls`.
