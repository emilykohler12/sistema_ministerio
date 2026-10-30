# Memoria del crítico

Patrones recurrentes del proyecto. La mantiene el subagente; se revisa en los PRs.

- [Tipos v1 vs. "firma de hooks no cambia"](project_tipos-v1-vs-firma-hooks.md): resuelto en ADR 0012; no rehacer la discusión
- [Permisos de agentes vs. spec](project_permisos-agentes-vs-spec.md): specs suponen perfiles de hooks inexistentes; contrastar con agents/ y limitar-*.mjs
- [Bloqueos Bash: regex cruda, no segmentos](project_hooks-bash-regex-cruda.md): quitar comillas esconde `bash -c`; deny de settings gana sobre excepciones de hooks
- [Auditoría: fallar cerrado](project_auditoria-falla-cerrada.md): aceptado; reglas por corte (auditar, truncate) piden guardia global pgTAP
- [Trampas Supabase auth/RLS en cortes](project_supabase-auth-rls-trampas.md): signOut en callback, RLS antes que CHECK, form sin guarda, caché por rol, ids de ruta por pantalla, molde pgTAP
- [Trampas Postgres en RPC y triggers](project_postgres-rpc-triggers-trampas.md): alta al vuelo, for share, execute anidado, WHEN con OLD en trigger combinado, args no nullable, update concurrente, RETURNS TABLE no nula, ruta "anterior" al conservar, collation, varchar antes que CHECK, es_admin en definer, return temprano saltea CHECK, asserts viejos al cambiar una RPC, grant por columna saltea la RPC, array_agg nulo; sin psql para el crítico
- [Patrones del frontend en cortes](project_frontend-cortes-patrones.md): la mayoría ya en rules/react.md y rules/datos.md (citar, no repetir); escaleras de ruta, mensaje por código sin onSettled, PGRST116 optimista, codigosDeError mal ubicado, useFocusTrap con onClose en deps, diálogo cerrable mientras guarda, role=status montado tarde
- [Trampas de Supabase Storage](project_supabase-storage-trampas.md): subida, contentType ignorado, trigger BEFORE vs RLS, remove() mudo, download=attachment, guardia de escritura por es_admin
- [Scripts de carga (Node + service_role)](project_scripts-de-carga.md): tsconfig, imports .ts, trim vs btrim, --confirmar, 23505, UTF-8 fatal, paginación por max_rows, guardia local copiada
- [Métricas y período (dashboard)](project_metricas-periodo-trampas.md): filtro en una auxiliar, TZ en date_trunc y en "hoy", cobertura vs vinculación, sin vincular por localidad; perform+limit en SRF, test anon/42501, placeholder
- [Lectura de la auditoría (historial)](project_historial-lectura-auditoria.md): diff vacío por updated_at, PGRST103 con count exact, mapa exhaustivo por Tables, helpers de fecha a shared; date sin espera, disabled en paginación pierde foco
- [auth-js: eventos y enlaces por correo](project_supabase-auth-eventos.md): INITIAL_SESSION antes que PASSWORD_RECOVERY, broadcast entre pestañas, hash en historial, signOut global, token_hash, sesión de verifyOtp tras fallo, mapeo de errores
- [Límite de frecuencia por IP](project_limite-frecuencia-trampas.md): rechazo vs no contar, encabezado del alojado, purga global, GUC '', e2e con IP compartida; tests de orden bajo el tope, andamiaje RED, e2e sin guardia de URL
- [Archivo de crítica fijo](feedback_archivo-de-critica.md): solo puedo escribir critica.md; si piden otro nombre, agrego una sección ahí y aviso
