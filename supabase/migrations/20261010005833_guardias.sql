-- Guardias de privilegios por defecto.
-- TRUNCATE no dispara triggers de fila, así que saltearía la auditoría (auditar())
-- y tampoco pasa por RLS. Supabase da TRUNCATE a anon y authenticated en toda tabla
-- nueva de public; se quita por defecto para no depender de acordarse tabla por tabla.
-- Aplica a las tablas que cree el rol postgres (el de las migraciones).
alter default privileges for role postgres in schema public
  revoke truncate on tables from anon, authenticated;
