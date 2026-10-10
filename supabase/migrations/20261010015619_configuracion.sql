-- Corte configuracion (ADR 0007, 0012): datos institucionales del sitio, una sola fila.

-- updated_at automático ----------------------------------------------------
-- Función transversal: la reutilizan los dominios que llevan updated_at.
-- search_path vacío por higiene, igual que el resto de las funciones base.
create function public.tocar_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Los triggers no chequean EXECUTE al dispararse; nadie debe invocarla directo.
revoke execute on function public.tocar_updated_at() from public, anon, authenticated, service_role;

-- Tabla --------------------------------------------------------------------
-- Una sola fila (CHECK id = 1). Solo "nombre" es obligatorio y no vacío; el
-- resto de los textos parte de '' y el portal oculta los que estén vacíos.
-- logo_ruta queda NULL hasta que se implemente la subida del logo.
create table public.configuracion (
  id smallint primary key default 1 check (id = 1),
  nombre varchar not null check (btrim(nombre) <> ''),
  logo_ruta varchar,
  telefono varchar not null default '',
  correo varchar not null default '',
  direccion varchar not null default '',
  facebook varchar not null default '',
  instagram varchar not null default '',
  quienes_somos text not null default '',
  mision text not null default '',
  vision text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.configuracion (id, nombre)
values (1, 'Ministerio de Educación de Misiones');

-- RLS ----------------------------------------------------------------------
-- Lectura pública (la usa el portal sin sesión). Solo el admin actualiza. Sin
-- políticas de insert ni delete: la fila única no se crea ni se borra desde la API.
alter table public.configuracion enable row level security;

create policy configuracion_select_publico
  on public.configuracion
  for select
  to anon, authenticated
  using (true);

create policy configuracion_update_admin
  on public.configuracion
  for update
  to authenticated
  using ((select public.es_admin()))
  with check ((select public.es_admin()));

-- Triggers -----------------------------------------------------------------
create trigger configuracion_auditar
  after insert or update or delete on public.configuracion
  for each row execute function public.auditar();

create trigger configuracion_tocar_updated_at
  before update on public.configuracion
  for each row execute function public.tocar_updated_at();
