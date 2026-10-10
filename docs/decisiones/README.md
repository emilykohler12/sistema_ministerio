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
| [0013](0013-auditoria-falla-cerrada-y-guardias-globales.md) | `auditar()` falla cerrada; guardias globales pgTAP de RLS, auditoría y TRUNCATE que heredan todos los cortes | aceptada | Migraciones, tablas nuevas, triggers de auditoría, privilegios, tests de base de datos |
