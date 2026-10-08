# Arquitectura del sistema

Mapa breve del DAM. Actualizarlo al cerrar una feature que cambie la estructura.

## Capas

```
pages/ (pantallas)  →  features/<dominio>/hooks (React Query)  →  mocks hoy · Supabase mañana
        ↓
shared/components/ui  (UI base reutilizable)
```

## Dominios (`src/features/`)

| Dominio | Qué contiene |
|---|---|
| `talleres` | Niveles, categorías, talleres y sus recursos. Catálogo público y gestión admin |
| `normativas` | Normativas con número, año, etiquetas y archivo |
| `descargas` | Modal de descarga: escuela, localidad y rol del solicitante |
| `dashboard` | KPIs y métricas para el administrador |
| `configuracion` | Ajustes generales del sitio |
| `auth` | Sesión del administrador (hoy simulada con sessionStorage) |

## Rutas

- Públicas: `/`, `/talleres`, `/talleres/:id`, `/normativas`, `/contacto`
- Admin: `/admin/login`, `/admin` (dashboard), `/admin/talleres/...`, `/admin/normativas`, `/admin/configuracion`

## Pendiente

- Integrar Supabase (Auth del admin, tablas del catálogo, Storage para archivos, registro de descargas).
