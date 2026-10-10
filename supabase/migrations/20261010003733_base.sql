-- Migración base: piezas transversales que usan todos los dominios (ADR 0012).
-- No crea tablas de dominio.

-- Búsqueda sin tildes ------------------------------------------------------
-- unaccent() es STABLE, así que no sirve en índices ni columnas generadas.
-- Este wrapper lo declara IMMUTABLE (el diccionario no cambia en la práctica)
-- y fija el search_path para que no dependa de la sesión.
create extension if not exists unaccent with schema extensions;

create function public.inmutable_unaccent(text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, $1)
$$;

-- Rol de administrador -----------------------------------------------------
-- Lee app_metadata del JWT: solo el servidor puede modificarlo. Nunca
-- user_metadata, que el propio usuario puede editar. Se compara como texto
-- para que un valor que no sea booleano dé false en lugar de un error.
create function public.es_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'admin') = 'true', false)
$$;

grant execute on function public.es_admin() to anon, authenticated;

-- Auditoría ----------------------------------------------------------------
-- usuario_id NULL = operación del sistema (sin sesión).
-- registro_id es text y NULL en tablas sin columna "id" (claves compuestas);
-- la clave igual queda en datos_anteriores / datos_nuevos.
-- La FK a auth.users no lleva "on delete set null": los usuarios se banean,
-- no se borran (0005), y así no se confunde un usuario borrado con "sistema".
create table public.registro_operacion (
  id bigint generated always as identity primary key,
  usuario_id uuid references auth.users (id),
  operacion text not null check (operacion in ('INSERT', 'UPDATE', 'DELETE')),
  tabla text not null,
  registro_id text,
  datos_anteriores jsonb,
  datos_nuevos jsonb,
  fecha_hora timestamptz not null default now()
);

alter table public.registro_operacion enable row level security;

-- Append-only: Supabase da GRANT ALL por defecto y service_role saltea RLS,
-- así que se quitan los privilegios (incluido TRUNCATE). Solo el trigger
-- auditar() escribe, porque corre como dueño de la tabla.
revoke all on public.registro_operacion from anon, authenticated, service_role;
grant select on public.registro_operacion to authenticated;

create policy registro_operacion_select_admin
  on public.registro_operacion
  for select
  to authenticated
  using ((select public.es_admin()));

-- La secuencia del id también queda cerrada: nadie más que el trigger la usa.
revoke all on sequence public.registro_operacion_id_seq from anon, authenticated, service_role;

-- SECURITY DEFINER: el insert debe saltear la RLS y los revoke de arriba, y
-- nadie más tiene permiso de escribir. search_path vacío evita que un
-- objeto del esquema del usuario reemplace a los que usa la función.
-- Falla cerrada (definición §9.1): si la auditoría no se puede registrar, la
-- escritura también falla. Las tablas sin "id" (clave compuesta) no abortan
-- porque el id se lee con to_jsonb(...) ->> 'id', que da NULL si no existe.
create function public.auditar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.registro_operacion
    (usuario_id, operacion, tabla, registro_id, datos_anteriores, datos_nuevos)
  values (
    auth.uid(),
    tg_op,
    tg_table_name,
    to_jsonb(coalesce(new, old)) ->> 'id',
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );

  return coalesce(new, old);
end;
$$;

-- Los triggers no chequean EXECUTE al dispararse; nadie debe invocarla directo.
revoke execute on function public.auditar() from public, anon, authenticated, service_role;
