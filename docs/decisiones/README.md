# Índice de decisiones (ADR)

Leé esta tabla y abrí **solo** los ADR cuya columna "Leer si vas a tocar…" coincide con tu tarea.
Al crear un ADR con `/decision`, agregá su fila acá.

| N.° | Decisión | Estado | Leer si vas a tocar… |
|---|---|---|---|
| [0001](0001-supabase-plataforma-unica.md) | Supabase para base de datos, Auth y Storage, sin capa de abstracción de proveedor | aceptada | Infraestructura, proveedor de datos, almacenamiento de archivos |
| [0002](0002-arquitectura-de-agentes.md) | Claude Code con agente principal y cinco subagentes, orquestación plana | aceptada | Agentes, hooks, skills, flujo de trabajo |
| [0003](0003-dev-container.md) | Todo el desarrollo corre en un Dev Container | aceptada | Entorno, dependencias, `.devcontainer/`, comandos |
| [0004](0004-supabase-directo-sin-api-propia.md) | Supabase directo desde el frontend con RLS y Edge Functions; sin API propia | aceptada | Hooks de datos, seguridad, RLS, Edge Functions, despliegue |
| [0005](0005-usuario-por-persona-y-auditoria.md) | Un usuario de Supabase Auth por persona, rol único, auditoría por `auth.uid()` | aceptada | Login, sesión, `auth`, historial de operaciones, gestión de usuarios |
| [0006](0006-descarga-formulario-y-enlaces.md) | Un formulario por taller y luego un enlace firmado por recurso | aceptada (a validar) | `DescargaModal`, detalle del taller, `registro_descarga`, Edge Function `descargar-taller` |
| [0007](0007-normativas-y-configuracion.md) | Normativas con descarga directa y etiquetas compartidas; configuración editable | aceptada | Normativas, etiquetas, configuración, Home |
| [0008](0008-niveles-educativos.md) | Cinco niveles fijos; la categoría pertenece a un nivel; sin "todos" | aceptada | Niveles, categorías, navegación del catálogo, filtros |
| [0009](0009-videos-como-enlace.md) | Recursos de tipo `ENLACE` (YouTube) además de archivos | aceptada | Recursos, carga de archivos, tipos de archivo, videos |
| [0010](0010-padron-de-establecimientos.md) | Padrón de establecimientos; formulario cargo → localidad → institución | aceptada | Formulario de descarga, establecimientos, instituciones sin vincular, métricas por institución |
| [0011](0011-supabase-local-docker-in-docker.md) | Supabase local con Docker-in-Docker; proyecto en la nube para demos | aceptada | Supabase local, migraciones, tests de RLS, `.devcontainer/` |
| [0012](0012-tipos-derivados-y-consultas-por-dominio.md) | Tipos del dominio derivados de la base (snake_case), `consultas.ts` por dominio, migración por cortes verticales | aceptada | Tipos del dominio, hooks de datos, tests de hooks, integración de un dominio con Supabase |
| [0013](0013-auditoria-falla-cerrada-y-guardias-globales.md) | `auditar()` falla cerrada; guardias globales pgTAP de RLS, auditoría, TRUNCATE y `updated_at` que heredan todos los cortes | aceptada | Migraciones, tablas nuevas, triggers de auditoría, privilegios, tests de base de datos |
| [0014](0014-cache-se-limpia-al-cambiar-usuario.md) | La caché de React Query se limpia cuando cambia el usuario derivado; las claves no llevan el rol | aceptada | `AuthContext`, claves de queries, dominios cuyos datos varían por rol (RLS) |
| [0015](0015-enum-o-check-para-listas.md) | Listas cerradas usadas como tipo → enum de Postgres; listas con "Otro" o texto libre → varchar + CHECK | aceptada | Migraciones con listas de valores (estados, tipos), tipos derivados, `z.enum` |
| [0016](0016-consistencia-base-y-storage.md) | Base y Storage consistentes por orden de operaciones; se compensa solo ante rechazo del servidor; huérfanos como único modo de falla | aceptada | Subida, reemplazo o borrado de archivos, buckets, recursos, normativas, logo |
| [0017](0017-contadores-anonimos-sin-auditoria.md) | El UPDATE que solo cambia un contador anónimo no se audita ni toca `updated_at` (`WHEN` en los triggers); el contador solo cambia por una RPC definer con grant por columna | aceptada | Contadores, RPC anónimas, triggers `auditar()`/`tocar_updated_at()`, métricas |
| [0018](0018-duplicados-por-nombre-de-constraint.md) | Con más de un único por tabla, el 23505 se atribuye a un campo por el nombre explícito de la constraint en `message`, fijado con `throws_ok`; un 23505 desconocido es un error general | aceptada | Constraints únicas, `errores.ts`, formularios con duplicados, tests pgTAP de unicidad |
| [0019](0019-script-de-carga-del-padron.md) | Carga del padrón por script en fase B (tras la muestra): upsert por CUE sin desactivar, simulación por defecto, local por defecto y `--confirmar=<host>` para la nube | aceptada (carga real pendiente de C-08) | Script de importación, padrón, `scripts/`, `proteger-bash`, service_role |
