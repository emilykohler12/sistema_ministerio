-- Historial de operaciones (issue #20). La pantalla lee registro_operacion (el admin ya tiene SELECT, RLS existente) y necesita
-- los emails de quienes operaron, que viven en auth.users (no accesible por PostgREST). Esta migracion agrega los indices de los
-- filtros y una RPC definer que expone solo id y email, solo al admin.

-- Indices ------------------------------------------------------------------------------------
-- La pantalla ordena por id (unico y monotono: las filas de un mismo guardar_taller comparten fecha_hora) y filtra por rango de
-- fecha_hora y, opcionalmente, por tabla. Sin indices, cada filtro es un seq scan cuando la tabla crezca (cargas del padron).
create index registro_operacion_fecha_hora_idx on public.registro_operacion (fecha_hora);
create index registro_operacion_tabla_fecha_hora_idx on public.registro_operacion (tabla, fecha_hora);

-- usuarios_historial -------------------------------------------------------------------------
-- SECURITY DEFINER: el admin no lee auth.users. es_admin() lee el JWT, que no cambia dentro de un definer, y se evalua primero
-- (42501). plpgsql y no sql: el chequeo tiene que ejecutarse siempre y antes del select (una funcion SQL no puede lanzar el error
-- y su cuerpo se evalua de forma perezosa; mismo criterio que metricas_registros). Un usuario por usuario_id distinto de NULL
-- (las operaciones del sistema no tienen cuenta); `email::text` porque auth.users.email es varchar(255) y la tabla devuelta es
-- text (42804 en return query); se descartan las cuentas sin email (telefono). Un usuario baneado sigue saliendo (§10.1): el
-- historial conserva a quien operó. Orden por email.
create function public.usuarios_historial()
returns table (id uuid, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.es_admin()) then
    raise exception 'Solo el administrador puede consultar los usuarios del historial' using errcode = '42501';
  end if;

  return query
    select u.id, u.email::text
      from auth.users u
     where u.email is not null
       and exists (select 1 from public.registro_operacion r where r.usuario_id = u.id)
     order by u.email::text;
end;
$$;

revoke execute on function public.usuarios_historial() from public, anon, service_role;
grant execute on function public.usuarios_historial() to authenticated;
