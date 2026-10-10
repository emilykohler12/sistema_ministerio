-- Guardia global de Storage: toda politica de storage.objects que escribe (INSERT, UPDATE, DELETE o ALL) debe ser
-- solo para {authenticated} y mencionar es_admin en qual o with_check. Cubre al anon, a public, a un authenticated
-- sin la marca de admin y a las politicas for all. Cada bucket nuevo queda cubierto sin acordarse de nada.
-- Las politicas de SELECT quedan fuera: un bucket publico se lee sin RLS y uno privado lee con la del admin.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select is_empty(
  $$select policyname from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
       and not (roles = array['authenticated']::name[]
                and (coalesce(qual, '') like '%es_admin%' or coalesce(with_check, '') like '%es_admin%'))$$,
  'toda politica de escritura de storage.objects es solo authenticated y exige es_admin');

-- Autoverificacion: la consulta detecta cada tipo de politica mala
create policy zz_authenticated_sin_admin on storage.objects for insert to authenticated
  with check (bucket_id = 'zz');
select isnt_empty(
  $$select policyname from pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname = 'zz_authenticated_sin_admin'
       and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
       and not (roles = array['authenticated']::name[]
                and (coalesce(qual, '') like '%es_admin%' or coalesce(with_check, '') like '%es_admin%'))$$,
  'la consulta del guardia detecta una politica de authenticated sin es_admin');

create policy zz_anon_con_admin on storage.objects for delete to anon
  using (bucket_id = 'zz' and (select public.es_admin()));
select isnt_empty(
  $$select policyname from pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname = 'zz_anon_con_admin'
       and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
       and not (roles = array['authenticated']::name[]
                and (coalesce(qual, '') like '%es_admin%' or coalesce(with_check, '') like '%es_admin%'))$$,
  'la consulta del guardia detecta una politica de escritura para anon');

create policy zz_all_sin_admin on storage.objects for all to authenticated
  using (bucket_id = 'zz');
select isnt_empty(
  $$select policyname from pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname = 'zz_all_sin_admin'
       and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
       and not (roles = array['authenticated']::name[]
                and (coalesce(qual, '') like '%es_admin%' or coalesce(with_check, '') like '%es_admin%'))$$,
  'la consulta del guardia detecta una politica for all sin es_admin');

-- Una politica de lectura no es de escritura: no debe marcarse
create policy zz_select_publico on storage.objects for select to public using (bucket_id = 'zz');
select is_empty(
  $$select policyname from pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname = 'zz_select_publico'
       and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
       and not (roles = array['authenticated']::name[]
                and (coalesce(qual, '') like '%es_admin%' or coalesce(with_check, '') like '%es_admin%'))$$,
  'la consulta del guardia ignora las politicas de select');

select * from finish();
rollback;
