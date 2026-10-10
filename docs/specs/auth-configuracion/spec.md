# auth-configuracion: primer corte vertical

- **Estado:** implementada (v2; Fase A en PR #5, Fase B en `feat/configuracion-supabase`)
- **Autor:** Joa Sanchez + Claude
- **Fecha:** 2026-10-10

## Objetivo
Conectar el frontend con Supabase por primera vez. El corte agrega el login real de cada administrador (0005) y migra el dominio `configuracion`
(0007, 0012) de punta a punta. Deja armado el patrón (cliente, sesión, `consultas.ts`, tipos derivados, RLS y auditoría) que copian los cortes siguientes.
Se entrega en **dos PRs**: Fase A (cliente + auth) y Fase B (configuración).

## Criterios de aceptación
**Fase A: cliente y auth**
1. Con `admin@dam.local`, el login lleva a `state.from` o a `/admin`. Si se recarga la pestaña, la sesión sigue. Si se cierra el navegador, se pierde (`sessionStorage`).
   Si se entra a `/admin/login` con la sesión ya iniciada, redirige al panel.
2. Con una contraseña incorrecta (`invalid_credentials`), el login muestra "Correo o contraseña incorrectos" y no entra. Cualquier otro error muestra un mensaje genérico.
3. Con `sin-permiso@dam.local`, aparece "Tu cuenta no tiene permisos de administrador" y la sesión se cierra. Una sesión sin la marca nunca llega a ser `usuario`,
   ni restaurada ni por un render.
4. Al entrar a `/admin/*` sin sesión, redirige al login. Hasta que llega `INITIAL_SESSION`, muestra un skeleton y no redirige.
5. "Cerrar sesión" hace `signOut`, limpia la caché de React Query y lleva al login. Después, volver a `/admin` redirige al login.

**Fase B: configuración**

6. El portal público (header, footer y Home) lee la configuración sin sesión. Si la consulta falla, se ven los fallbacks ('Sitio institucional'; el header mantiene su ícono).
7. El admin edita y guarda; solo `nombre` es obligatorio. El portal muestra los cambios y queda una fila en `registro_operacion` con su `usuario_id`,
   `operacion = 'UPDATE'` y `registro_id = '1'`. Si guardar falla, el formulario muestra un error y no "Cambios guardados".
8. pgTAP (`supabase/tests/configuracion.test.sql`):
   - anon y authenticated sin marca: SELECT sí; UPDATE no (0 filas y el valor sin cambios); INSERT da `42501`.
   - admin: UPDATE sí; INSERT da `42501`.
   - Ningún rol de la API puede hacer DELETE: la fila `id = 1` sigue existiendo.
   - Como `postgres`, insertar `id = 2` da `23514`.
   - `updated_at` se actualiza solo. Las guardias globales y `funciones.test.sql` siguen en verde.
9. En cada fase pasan `npm run typecheck`, `lint`, `test` y `build`, y en la B también `test:db`. Al cerrar no queda `configuracion.mock.ts`.

## Diseño
**Fase A**
- **Cliente**:
  - `npm i @supabase/supabase-js`.
  - `src/shared/lib/supabase.ts`: `createClient` con `auth.storage = sessionStorage`. Si falta `VITE_SUPABASE_URL` o `VITE_SUPABASE_PUBLISHABLE_KEY`, falla con un mensaje claro.
    Primero se verifica que el login y `app_metadata` funcionen con la clave publishable; si no, se usa `ANON_KEY` y se anota en `notas.md`.
  - `src/vite-env.d.ts`: tipa esas variables. No se agrega `test.env`: si un test importa el cliente, es que le falta un mock.
  - **La persona crea** `.env.example` (las claves, sin valores) y `.env.local` (con `npx supabase status`), porque los hooks bloquean `.env*`.
- **Auth** (`src/features/auth/`):
  - `consultas.ts`:
    - `iniciarSesion`, `cerrarSesion` y `escucharSesion` (envoltorios de `supabase.auth`);
    - `esAdmin(user)`, función pura: `app_metadata.admin === true`. Es solo UX: la barrera es `es_admin()` en la RLS.
  - `AuthContext`: expone `{ usuario: { id, email } | null, cargando, iniciarSesion(correo, pass), cerrarSesion() }`.
    - Hay **una sola fuente**: `onAuthStateChange`. `INITIAL_SESSION` pone `cargando = false`.
    - Se calcula `usuario = session && esAdmin(user) ? … : null`.
    - Si hay una sesión sin la marca, el callback hace `setTimeout(cerrarSesion, 0)`. Regla: **nunca llamar a `supabase.auth.*` sincrónicamente dentro del callback**.
    - Ante `SIGNED_OUT`, hace `queryClient.clear()`.
    - `iniciarSesion` no navega ni cierra la sesión. Devuelve `'credenciales' | 'sin-permiso' | 'red' | null`.
  - `AdminLayout`: muestra un skeleton mientras `cargando` y redirige si no hay `usuario`.
  - `LoginPage`:
    - si hay `usuario`, `<Navigate to={from} replace/>`;
    - el campo `correo` pasa a `type=email` con `z.email()`;
    - se quitan "Recordarme" y "¿Olvidaste tu contraseña?".
  - `AdminSidebar` usa `cerrarSesion`. `TallerFormPage` y `NormativaFormPage` muestran `usuario.email` como encargado.
- **Tests**:
  - `esAdmin`;
  - `AuthContext`: restaurar la sesión, una sesión sin la marca y `SIGNED_OUT`;
  - `LoginPage`: éxito, credenciales, sin permiso y ya logueado;
  - `AdminLayout.test.tsx`: sin evento muestra el skeleton; con `null` redirige.
  - Todos usan el `AuthProvider` real con `vi.mock('@/features/auth/consultas')`.

**Fase B**
- **Base**: `supabase/migrations/<ts>_configuracion.sql`.
  - Tabla según §8.1. Textos `not null default ''`, salvo `nombre` (not null, sin vacío) y `logo_ruta` (nullable). `CHECK (id = 1)`.
  - Inserta la fila `id = 1` con `nombre = 'Ministerio de Educación de Misiones'`.
  - RLS:
    - `select` para anon y authenticated `using (true)`;
    - `update` `to authenticated using/with check ((select public.es_admin()))`;
    - sin políticas de insert ni delete.
  - Triggers:
    - `configuracion_auditar` (`auditar()`);
    - `tocar_updated_at()`: función transversal, `search_path = ''`, con su línea en `funciones.test.sql`.
  - Después se corre `npm run db:types`.
- **Dominio**:
  - `types.ts`: `Configuracion = Tables<'configuracion'>` y `ConfiguracionCambios = TablesUpdate<'configuracion'>`.
  - `consultas.ts`:
    - `obtenerConfiguracion()`: `.eq('id',1).single()`;
    - `guardarConfiguracion(cambios)`: `update…eq('id',1).select().single()`. Si la RLS bloquea, sale como error.
  - Hooks: misma firma. El onSuccess hace `setQueryData` con la fila devuelta.
- **Pantallas**:
  - pasan a snake_case;
  - `ConfiguracionPage`:
    - el tipo del formulario sale de `z.infer`;
    - solo `nombre` es obligatorio, y `correo` es `'' | email`;
    - se oculta el control del logo y se muestra el error de la mutation.
  - Header y footer usan las iniciales mientras `logo_ruta` sea null.
- **Tests**:
  - hooks de configuración, con `vi.mock('../consultas')`;
  - `PublicFooter.test.tsx`, con la consulta rechazada → fallbacks.
  - No se mockea supabase-js (0012).

**Decisiones de la entrevista**: el logo se difiere; `sessionStorage`; recuperación e inactividad van en otro corte; la cuenta sin marca se cierra con aviso.

## Fuera de alcance
- Subir el logo y su bucket. Recuperación de contraseña. Cierre por inactividad. Gestión de usuarios.
- Quitar `responsable` de los tipos `Taller` y `Normativa`, que va con su corte. Proyecto en la nube y despliegue.

## Verificación de punta a punta
1. **A:** con `.env.local` cargado, correr `npm run dev`.
   - Sin sesión, `/admin` redirige al login.
   - Con una clave incorrecta, aparece el error.
   - Con `sin-permiso@dam.local`, aparece el aviso.
   - Con `admin@dam.local`, se entra. Al recargar sigue logueado; con "Cerrar sesión" vuelve al login.
2. **B:** `npm run db:reset && npm run test:db && npm run db:types && npm run typecheck && npm run lint && npm test && npm run build` → verde.
3. **B:** editar solo la misión y guardar. El cambio se ve en `/`, y en Studio la fila de `registro_operacion` tiene el uid del admin.
