# Arquitectura del sistema

Mapa breve del DAM: **cómo está el código hoy**. El qué está en `docs/definicion-dam.md` (v2) y el
por qué en `docs/decisiones/`. Actualizarlo al cerrar una feature que cambie la estructura.

## Capas

```
pages/ (pantallas)  →  features/<dominio>/hooks (React Query)  →  mocks hoy · Supabase directo mañana
        ↓
shared/components/ui  (UI base reutilizable)
```

Destino (0012): `pages → hooks → features/<dominio>/consultas.ts → supabase-js`, con `types.ts` derivado
de `src/shared/types/database.ts` (generado). Se migra un dominio por vez.

Destino (decisión 0004): sin API propia. Los hooks llaman a Supabase con supabase-js y RLS protege
los datos. Solo la descarga de talleres (y luego la gestión de usuarios) pasa por Edge Functions.

## Dominios (`src/features/`)

| Dominio | Qué contiene |
|---|---|
| `talleres` | Niveles, categorías, talleres y sus recursos. Catálogo público y gestión admin |
| `normativas` | Normativas con número, año, etiquetas y archivo |
| `descargas` | Modal de descarga. Hoy: escuela, localidad y rol. Destino (0010): cargo, localidad, institución del padrón |
| `dashboard` | KPIs y métricas para el administrador |
| `configuracion` | Ajustes generales del sitio |
| `auth` | Sesión del administrador (hoy simulada con sessionStorage; destino: un usuario de Supabase Auth por persona, 0005) |

## Rutas

- Públicas: `/`, `/talleres`, `/talleres/:id`, `/normativas`, `/contacto`
- Admin: `/admin/login`, `/admin` (dashboard), `/admin/talleres/...`, `/admin/normativas`, `/admin/configuracion`

## Entorno

Todo el desarrollo corre en el Dev Container (`.devcontainer/`, decisión 0003): Node, dependencias,
tests (Vitest + jsdom + Testing Library, setup en `src/test/`), hooks y Claude Code.
Supabase local corre con Docker-in-Docker (0011): `npm run db:start`, `db:reset` (migraciones + seed de
usuarios con `scripts/seed-usuarios.mjs`), `test:db` (pgTAP en `supabase/tests/`) y `db:types`
(genera `src/shared/types/database.ts`, no se edita a mano).

## Base de datos (`supabase/`)

- `migrations/<ts>_base.sql`: piezas transversales, sin tablas de dominio. `es_admin()` (lee
  `app_metadata` del JWT), `inmutable_unaccent()` para búsquedas sin tildes, `registro_operacion`
  (append-only, solo SELECT para el admin) y el trigger `auditar()`, que falla cerrada.
- Cada corte de dominio agrega su migración, sus tablas con RLS, el trigger `auditar()` y sus tests.

## Brechas entre el código y la definición v2

- Integrar Supabase: la base transversal está lista; faltan tablas de dominio, supabase-js, Auth por persona en el
  frontend, Storage y la Edge Function `descargar-taller` (0004–0006).
- Niveles: quitar "todos" y el `nivel` duplicado en `Taller` (0008).
- Quitar los contadores `descargas` de `Taller`; el portal debe filtrar talleres publicados.
- Recursos: id, ruta/url, tamaño, orden, tipos PPTX/DOCX/ENLACE y límite de 50 MB (0009).
- Formulario de descarga y modal con lista de enlaces (0006, 0010).
- Nuevas pantallas: establecimientos, instituciones sin vincular, historial; luego usuarios.
- Búsqueda: incluir descripción e ignorar tildes. Mejoras del dashboard (definición §5.4).
