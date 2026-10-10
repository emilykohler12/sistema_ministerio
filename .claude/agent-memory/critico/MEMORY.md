# Memoria del crítico

Patrones recurrentes del proyecto. La mantiene el subagente; se revisa en los PRs.

- [Tipos v1 vs. "firma de hooks no cambia"](project_tipos-v1-vs-firma-hooks.md): resuelto en ADR 0012; no rehacer la discusión
- [Permisos de agentes vs. spec](project_permisos-agentes-vs-spec.md): specs suponen perfiles de hooks inexistentes; contrastar con agents/ y limitar-*.mjs
- [Bloqueos Bash: regex cruda, no segmentos](project_hooks-bash-regex-cruda.md): quitar comillas esconde `bash -c`; deny de settings gana sobre excepciones de hooks
- [Auditoría: fallar cerrado](project_auditoria-falla-cerrada.md): aceptado; reglas por corte (auditar, truncate) piden guardia global pgTAP
- [Trampas Supabase auth/RLS en cortes](project_supabase-auth-rls-trampas.md): signOut en callback, RLS antes que CHECK, form sin guarda, caché por rol, ids de ruta por pantalla, molde pgTAP
- [Trampas Postgres en RPC y triggers](project_postgres-rpc-triggers-trampas.md): alta al vuelo con CTE/dedupe, for share, execute por defecto, `details`, args RPC no nullable, pgTAP que no distingue, update concurrente mezcla
- [Patrones del frontend en cortes](project_frontend-cortes-patrones.md): isLoading vs isPending (sin red da "no encontrado"), enums vía Constants, mensajes DA00x repetidos, escalera de ruta del taller copiada
- [Trampas de Supabase Storage](project_supabase-storage-trampas.md): subida confirma antes de responder, contentType ignorado, trigger BEFORE vs RLS, delete probable con allow_delete_query, remove() mudo, no compensar ante error ambiguo
- [Archivo de crítica fijo](feedback_archivo-de-critica.md): solo puedo escribir critica.md; si piden otro nombre, agrego una sección ahí y aviso
