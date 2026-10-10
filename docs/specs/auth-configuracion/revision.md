# Revisión: auth-configuracion

# Revisión 1 (Fase A)

- **Revisor:** subagente `revisor`
- **Fecha:** 2026-10-10
- **Alcance:** diff de `feat/auth-configuracion` contra `main` (con los cambios sin commitear y los archivos nuevos),
  comparado con los criterios 1 a 5, "Diseño → Fase A" y las respuestas de `critica.md`. La Fase B queda afuera.

## Veredicto
**Cambios necesarios (menores).** El diseño acordado con la crítica está bien implementado:
- una sola fuente (`INITIAL_SESSION`);
- `usuario` derivado con `esAdmin`;
- el `signOut` diferido con `setTimeout`, que solo hace el callback;
- `queryClient.clear()` ante `SIGNED_OUT`;
- la navegación derivada del estado;
- la clave publishable verificada.

No hay problemas críticos ni de seguridad. Falta registrar la evidencia de una parte de los criterios 1 y 5, y en un
caso poco probable el criterio 2 no muestra el mensaje genérico.

## Criterios → evidencia

| # | Criterio | Implementación | Evidencia |
|---|---|---|---|
| 1 | Login a `state.from` o `/admin`; recarga mantiene, cierre pierde (`sessionStorage`); `/admin/login` con sesión redirige | `LoginPage.tsx` (`<Navigate>` si hay `usuario`), `supabase.ts` (`auth.storage = sessionStorage`) | `LoginPage.test.tsx`: "ya iniciada redirige a /admin", "redirige a state.from", "tras un login correcto… redirige". **Recarga/cierre:** sin test (depende del navegador) y sin registro de la verificación manual (ver problema 1) |
| 2 | `invalid_credentials` → "Correo o contraseña incorrectos"; otro error → genérico | `AuthContext.iniciarSesion` + `MENSAJES_ERROR` | `AuthContext.test.tsx` (credenciales/red), `LoginPage.test.tsx` (credenciales, red). Un error *lanzado* no muestra el genérico (problema 2) |
| 3 | `sin-permiso` → aviso y la sesión se cierra; nunca llega a ser `usuario` | Callback: `usuario` derivado + `setTimeout(cerrarSesion, 0)`; `iniciarSesion` devuelve `'sin-permiso'` sin cerrar | `AuthContext.test.tsx`: INITIAL_SESSION y SIGNED_IN sin marca (no es `usuario`, cierre diferido, no sincrónico); `LoginPage.test.tsx`: aviso. Verificación real: JWT de `sin-permiso` sin `admin` |
| 4 | `/admin/*` sin sesión → login; skeleton hasta `INITIAL_SESSION` | `AdminLayout.tsx` (`role="status"` mientras `cargando`) | `AdminLayout.test.tsx`: sin evento, skeleton y sin redirección; `null`, redirige; admin, renderiza el hijo |
| 5 | "Cerrar sesión": `signOut`, limpia la caché, va al login; volver a `/admin` redirige | `AdminSidebar.handleLogout` → `cerrarSesion` → `SIGNED_OUT` → `clear()` | `AuthContext.test.tsx`: SIGNED_OUT limpia `usuario` y la caché. **El botón** (llama a `cerrarSesion` y navega) no tiene test ni verificación manual registrada (problema 1) |

Diseño de la Fase A, punto por punto:
- `@supabase/supabase-js@2.117.3`: OK.
- `supabase.ts` falla con un mensaje claro si falta alguna variable: OK.
- `vite-env.d.ts` está y no se agregó `test.env`: OK.
- `.env.example` tiene las claves sin valores: OK.
- `consultas.ts` tiene los tres envoltorios y `esAdmin`, documentado como "solo UX": OK.
- `LoginPage` usa `type=email`, `z.email()` y `noValidate`, y ya no tiene "Recordarme" ni "¿Olvidaste…?": OK.
- Los formularios muestran `usuario.email`: OK.
- Los tests usan el `AuthProvider` real con `consultas` mockeado: OK.

## Problemas

1. **[importante]** `docs/specs/auth-configuracion/notas.md`: no hay registro de la verificación manual de punta a
   punta de la Fase A (paso A de la spec). Sin ese registro, dos partes de los criterios quedan sin evidencia:
   - del criterio 1, que la sesión siga al recargar y se pierda al cerrar el navegador;
   - del criterio 5, el botón "Cerrar sesión".

   `AdminSidebar` no tiene test, así que si alguien quita el `await cerrarSesion()` o el `navigate`, `npm test` sigue
   en verde.

   **Arreglo:** correr el paso A en el navegador y anotar el resultado en `notas.md`. Para el criterio 5, conviene
   además un `AdminSidebar.test.tsx` corto: el clic en "Cerrar sesión" llama a `cerrarSesion` y termina en el login.

2. **[importante]** `src/features/auth/AuthContext.tsx:51` y `src/pages/admin/LoginPage.tsx:44`: si
   `iniciarSesionConsulta` **lanza** en lugar de devolver `{ error }`, el error se escapa. En 2.117.3,
   `signInWithPassword` relanza los errores que no son `AuthError`, por ejemplo un fallo de `sessionStorage.setItem`
   en `_saveSession`.

   En ese caso `handleSubmit` de RHF relanza el error: queda una promesa rechazada sin capturar y no aparece el mensaje
   genérico. El criterio 2 dice "cualquier otro error muestra un mensaje genérico". Es poco probable, pero es justo el
   caso que el criterio cubre.

   **Arreglo:** en `AuthContext.iniciarSesion`, envolver la llamada en `try/catch` y devolver `'red'` en el `catch`.
   Agregar un test con `mocks.iniciarSesion.mockRejectedValue(...)`.

3. **[menor]** `src/shared/components/layout/AdminSidebar.tsx:17-20` y `src/features/auth/AuthContext.tsx:40`: hay
   promesas sin capturar:
   - `onClick={handleLogout}` es async y no tiene `try`;
   - `setTimeout(() => void cerrarSesionConsulta(), 0)` descarta el rechazo.

   El impacto real es bajo. En 2.117.3, `_signOut` borra la sesión local aunque `/logout` falle y devuelve
   `{ error }` sin lanzar, así que el `SIGNED_OUT` llega igual y el cierre funciona aunque no haya red. Que
   `consultas.cerrarSesion` ignore ese `{ error }` está bien. Solo rechazaría un error de lock o de storage, y en ese
   caso no se navega y queda un rechazo sin manejar.

   **Arreglo:** en `handleLogout`, usar `try { await cerrarSesion() } finally { navigate('/admin/login') }`, y en el
   `setTimeout`, `cerrarSesionConsulta().catch(() => {})`.

4. **[menor]** `docs/arquitectura.md:29` y `:53`, y `CLAUDE.md:15`: con esta fase quedan desactualizados.
   - La fila `auth` dice "hoy simulada con sessionStorage".
   - Las brechas listan "supabase-js, Auth por persona en el frontend" como pendientes.
   - `CLAUDE.md` dice "Supabase … NO integrado todavía".

   La Fase A se mergea sola a `main`, así que hay que actualizarlos en este PR:
   - `auth`: Supabase Auth con sesión en `sessionStorage`, `src/shared/lib/supabase.ts`;
   - sacar supabase-js y Auth de las brechas;
   - en `CLAUDE.md`, aclarar que auth ya está integrado y que los demás dominios siguen con mocks.

Lo revisado sin problemas:
- **Clave pública:** no hay secret ni service key en `src/`, `.env.example` ni `dist/`. Las coincidencias de
  `sb_secret_` en el bundle son el detector de prefijos de supabase-js, no una clave. En `dist/` no hay ningún JWT.
- **Sin `user_metadata`:** `esAdmin` usa solo `app_metadata.admin === true`, y hay tests que rechazan la marca en
  `user_metadata` y el string `"true"`.
- **Sin fugas en las alertas:** `role="alert"` muestra textos fijos de `MENSAJES_ERROR`, nunca `error.message`.
- **Accesibilidad:** el skeleton tiene `role="status"` con `aria-label` y los campos tienen `autoComplete`.
- **Alcance:** no cambió nada fuera de la Fase A, y se mantiene `responsable` en los tipos, como pide la spec.

## Evidencia

- `npm test`: **8 archivos, 75 tests, todos en verde** (3,0 s).
- `npm run typecheck` (`tsc -b`): sin errores.
- `npm run lint` (oxlint): 0 errores y 4 advertencias, todas previas a la rama.
  - 3 son `incompatible-library` de RHF `watch`, en `DescargaModal`, `ConfiguracionPage` y `TallerFormPage`.
  - 1 es `only-export-components` en `AuthContext.tsx:68` (`useAuth`, que ya se exportaba en `main`).
- `npm run build`: OK en 2,4 s. Solo avisa que un chunk pasa los 500 kB (`index` pesa 745 kB y ahora incluye
  supabase-js); no es un requisito.
- **Clave publishable** contra Supabase local. La clave se leyó de `npx supabase status -o json` por stdin, sin
  imprimirla y sin leer `.env*`.

  | Cuenta | `/auth/v1/token` | JWT | `rpc/es_admin` con ese JWT |
  |---|---|---|---|
  | `admin@dam.local` | 200 | `role=authenticated`, `app_metadata.admin=true` | `true` |
  | `sin-permiso@dam.local` | 200 | sin `admin` | `false` |
  | `admin@dam.local` con clave incorrecta | 400 `invalid_credentials` | — | — |
  | sin JWT (anon) | — | — | `false` |

  Confirma lo que dice `notas.md` y, además, que `es_admin()` lee la marca a través del gateway con la publishable.
