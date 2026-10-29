-- #31: una etiqueta que ya no usa ningun taller ni normativa se borra sola.
-- Las etiquetas son una tabla compartida (talleres y normativas) y sin delete para el admin (ver el comentario de
-- etiqueta en <ts>_talleres.sql, que quedo atras): sin esta migracion, una etiqueta quitada de su ultimo taller o
-- normativa seguia sugiriendose para siempre.

-- borrar_etiquetas_huerfanas ---------------------------------------------------------
-- Funcion de trigger de sentencia (tabla de transicion `borradas` = las filas recien borradas del puente). Borra de
-- etiqueta solo los ids que aparecen ahi y no quedaron en ninguno de los dos puentes. Limitarse a esos ids evita borrar
-- una etiqueta recien creada por resolver_etiquetas que todavia no se vinculo (guardar_taller y guardar_normativa
-- resuelven las etiquetas antes de sincronizar el puente).
-- SECURITY DEFINER: etiqueta no tiene politica ni grant de delete para el admin; el borrado lo hace solo esta funcion.
-- El trigger auditar() de etiqueta sigue registrando cada borrado, con el auth.uid() de quien guardo.
-- search_path vacio. Ningun rol de la API la ejecuta directamente: los triggers no chequean EXECUTE al dispararse.
create function public.borrar_etiquetas_huerfanas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.etiqueta e
   where e.id in (select b.etiqueta_id from borradas b)
     and not exists (select 1 from public.taller_etiqueta te where te.etiqueta_id = e.id)
     and not exists (select 1 from public.normativa_etiqueta ne where ne.etiqueta_id = e.id);

  return null;
end;
$$;

revoke execute on function public.borrar_etiquetas_huerfanas() from public, anon, authenticated, service_role;

-- Triggers -----------------------------------------------------------------------------
-- De sentencia, para mirar todas las filas borradas juntas. Cubren editar un taller, editar una normativa y la baja de
-- una normativa (el on delete cascade de normativa_etiqueta tambien dispara el trigger de sentencia).
create trigger taller_etiqueta_borrar_huerfanas
  after delete on public.taller_etiqueta
  referencing old table as borradas
  for each statement execute function public.borrar_etiquetas_huerfanas();

create trigger normativa_etiqueta_borrar_huerfanas
  after delete on public.normativa_etiqueta
  referencing old table as borradas
  for each statement execute function public.borrar_etiquetas_huerfanas();

-- Limpieza inicial -------------------------------------------------------------------------
-- Las huerfanas que ya existen no pasan por ningun trigger: se borran una sola vez. La migracion corre sin sesion, asi
-- que auditar() las registra con usuario_id nulo ("Sistema" en el historial).
delete from public.etiqueta e
 where not exists (select 1 from public.taller_etiqueta te where te.etiqueta_id = e.id)
   and not exists (select 1 from public.normativa_etiqueta ne where ne.etiqueta_id = e.id);
