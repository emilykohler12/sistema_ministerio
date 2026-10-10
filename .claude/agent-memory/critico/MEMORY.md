# Memoria del crítico

Patrones recurrentes del proyecto. La mantiene el subagente; se revisa en los PRs.

- [Tipos v1 vs. "firma de hooks no cambia"](project_tipos-v1-vs-firma-hooks.md): resuelto en ADR 0012; no rehacer la discusión
- [Permisos de agentes vs. spec](project_permisos-agentes-vs-spec.md): specs suponen perfiles de hooks inexistentes; contrastar con agents/ y limitar-*.mjs
- [Bloqueos Bash: regex cruda, no segmentos](project_hooks-bash-regex-cruda.md): quitar comillas esconde `bash -c`; deny de settings gana sobre excepciones de hooks
- [Auditoría: fallar cerrado](project_auditoria-falla-cerrada.md): aceptado; reglas por corte (auditar, truncate) piden guardia global pgTAP
- [Trampas Supabase auth/RLS en cortes](project_supabase-auth-rls-trampas.md): signOut en callback, RLS antes que CHECK, form sin guarda, caché por rol, ids de ruta por pantalla, molde pgTAP
- [Trampas Postgres en RPC y triggers](project_postgres-rpc-triggers-trampas.md): alta al vuelo, for share, execute anidado, WHEN con OLD en trigger combinado, args no nullable, update concurrente, RETURNS TABLE no nula, ruta "anterior" al conservar, collation, varchar antes que CHECK
- [Patrones del frontend en cortes](project_frontend-cortes-patrones.md): isLoading vs isPending, enums vía Constants, mensajes repetidos, escaleras de ruta, imports entre dominios (a shared), ruta de caché en bajas
- [Trampas de Supabase Storage](project_supabase-storage-trampas.md): subida, contentType ignorado, trigger BEFORE vs RLS, remove() mudo, download=attachment, guardia de escritura por es_admin
- [Scripts de carga (Node + service_role)](project_scripts-de-carga.md): tsconfig, imports .ts, trim vs btrim, --confirmar, 23505, UTF-8 fatal, paginación por max_rows, guardia local copiada
- [Archivo de crítica fijo](feedback_archivo-de-critica.md): solo puedo escribir critica.md; si piden otro nombre, agrego una sección ahí y aviso
