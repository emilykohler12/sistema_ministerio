# Memoria del crítico

Patrones recurrentes del proyecto. La mantiene el subagente; se revisa en los PRs.

- [Tipos v1 vs. "firma de hooks no cambia"](project_tipos-v1-vs-firma-hooks.md): resuelto en ADR 0012; no rehacer la discusión
- [Permisos de agentes vs. spec](project_permisos-agentes-vs-spec.md): specs suponen perfiles de hooks inexistentes; contrastar con agents/ y limitar-*.mjs
- [Bloqueos Bash: regex cruda, no segmentos](project_hooks-bash-regex-cruda.md): quitar comillas esconde `bash -c`; deny de settings gana sobre excepciones de hooks
- [Auditoría: fallar cerrado](project_auditoria-falla-cerrada.md): "nunca aborta" se leyó como tragar errores; redactar criterios sin absolutos
- [Archivo de crítica fijo](feedback_archivo-de-critica.md): solo puedo escribir critica.md; si piden otro nombre, agrego una sección ahí y aviso
