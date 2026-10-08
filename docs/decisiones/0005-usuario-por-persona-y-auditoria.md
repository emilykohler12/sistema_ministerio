# 0005 · Un usuario por persona, rol único y auditoría por `auth.uid()`

- **Estado:** aceptada
- **Fecha:** 2026-10

## Contexto
La v1 usaba una cuenta compartida y compensaba la falta de identidad con nombre declarado,
`sesion_responsable`, `ultima_sesion_id` y un trigger (atribución frágil, sin revocación individual).
El referente solo pidió que no haya multirol: todos los admins pueden hacer todo.

## Opciones consideradas
- **Cuenta compartida (v1):** identidad declarada, cuatro piezas propias, atribución frágil.
- **Cuenta compartida + header `x-responsable`:** más simple, sigue siendo declarada y depende de PostgREST.
- **Un usuario de Supabase Auth por persona:** identidad real, sin piezas propias.

## Decisión
Un usuario por persona, un único rol. Una marca `app_metadata.admin = true` (no editable por el usuario)
distingue a un admin de cualquier cuenta que no debería existir; RLS la exige. Registro público deshabilitado.
Un **trigger genérico** de auditoría en todas las tablas gestionables guarda `auth.uid()`, `TG_OP`, tabla y diff.
La gestión de usuarios desde el panel (invitar por correo, desactivar, no dejar cero admins) entra en alcance
como feature posterior, vía la Edge Function `gestionar-usuarios`.

## Consecuencias
- Se eliminan `sesion_responsable`, `ultima_sesion_id`, el paso "declarar responsable" y el cambio de responsable.
- Recuperación de contraseña por correo personal; desactivar (ban) en vez de borrar conserva el historial.
