# Contexto: auth-configuracion

Relevado por `Explore` el 2026-10-10. Hechos del código, sin recomendaciones.

## Auth (simulada)
- `src/features/auth/AuthContext.tsx`: `{ isAuthenticated, responsable, login(responsable), logout() }`. Guarda el nombre en
  `sessionStorage['dam-responsable']`. Es síncrono: no hay carga, ni email, ni uid, ni token.
- Consumidores:
  - `AppProviders.tsx:17` monta el provider.
  - `LoginPage.tsx:23` usa `login`.
  - `AdminLayout.tsx:9` usa `isAuthenticated`. Es la guarda: si no hay sesión, hace `<Navigate to="/admin/login" state={{from}}/>`.
  - `AdminSidebar.tsx:14-20` usa `logout` y navega al login.
  - `TallerFormPage.tsx:35,168` y `NormativaFormPage.tsx:32,135` muestran `responsable` en un input deshabilitado ("Nombre del encargado de subir").
- `LoginPage.tsx`: usa zod + RHF. El campo `correo` es `type=text`, con validación min 1. Tiene un checkbox "Recordarme" que se ignora y un
  enlace `#recuperar` sin efecto. Acepta cualquier credencial y redirige a `state.from` o `/admin`.
- No hay tests de auth.

## Configuración (mock)
- `types.ts`: `ConfiguracionInstitucional`, en camelCase (`logoUrl`, `quienesSomos`). No tiene `id` ni `updated_at`.
- `useConfiguracion()` (`['configuracion']`) y `useGuardarConfiguracion()` (`setQueryData` en onSuccess) leen el mock, que tiene todos los campos en `''`.
- Consumidores:
  - `ConfiguracionPage.tsx` (229 l.): zod. `nombre` min 2, `telefono` y `direccion` min 1, `correo` tiene que ser un email, y el resto es libre.
    El logo es una URL `blob:` temporal, sin subida. No maneja el error de la mutation.
  - `HomePage.tsx:18-53` usa `nombre` (con fallback 'Sitio institucional'), `quienesSomos`, `mision` y `vision`.
  - `PublicHeader.tsx:16` usa `nombre` y `logoUrl`. Si no hay logo, muestra las iniciales.
  - `PublicFooter.tsx:6` usa `nombre`, `logoUrl`, `telefono`, `correo`, `facebook` e `instagram`.
  - Nadie maneja el estado de error.

## Infraestructura
- No están instalados `@supabase/supabase-js` (última versión: 2.117.3) ni `src/shared/lib/supabase.ts`, ni existen `src/vite-env.d.ts` y `.env.example`.
- `tsconfig.app.json` tiene `types: ["vite/client"]`. `.gitignore` ignora `.env*`, salvo `!.env.example`.
- `supabase/config.toml`:
  - Puertos: API 54321, Studio 54323, Mailpit 54324.
  - `site_url` es `http://localhost:5173`, `enable_signup=false`, `jwt_expiry=3600` y la confirmación de correo está apagada.
- `scripts/seed-usuarios.mjs` crea `admin@dam.local` / `admin-dam-local` (con `app_metadata.admin`) y
  `sin-permiso@dam.local` / `sin-permiso-dam-local`.
- `database.ts` solo tiene `registro_operacion`.
- Migraciones: `base` y `guardias`. Tests pgTAP: `auditar`, `auditoria_global`, `es_admin`, `funciones`, `registro_operacion`, `rls_global` y `truncate_global`.
- Tests del frontend: `src/test/utils.tsx` tiene `crearWrapperQuery()` y `renderConProviders()`, este último con QueryClient y MemoryRouter, sin Auth.
  Para hooks, el patrón es `useTalleres.test.ts`, con `vi.mock` del módulo de datos. Ningún test renderiza páginas que usen configuración.

## Restricciones de los hooks de Claude
- `proteger.mjs` bloquea Edit/Write sobre `.env*` (incluido `.env.example`), `database.ts`, `package-lock.json` y las migraciones ya commiteadas.
- `proteger-bash.mjs` bloquea los comandos que mencionan `.env`. Por eso **la persona crea `.env.example` y `.env.local`**.
- Perfil `tests`: `*.test.ts(x)` y `supabase/tests/*.sql`.

## Definición y ADR
- §8.1/§8.3: `configuracion` es una sola fila (`CHECK (id = 1)`) con las columnas `nombre`, `logo_ruta`, `telefono`, `correo`, `direccion`, `facebook`,
  `instagram`, `quienes_somos`, `mision`, `vision` y `updated_at`. `logo_ruta` apunta a un bucket público.
- §5.2: login por persona, recuperación por correo y cierre a los 30 min de inactividad. Estas dos últimas quedan diferidas (ver spec).
- 0005: un usuario por persona; se elimina el "responsable declarado". 0007: lectura pública y escritura admin. 0012: snake_case y `consultas.ts`.
