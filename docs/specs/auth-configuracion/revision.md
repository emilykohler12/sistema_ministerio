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

# Revisión: Fase B

- **Revisor:** subagente `revisor`
- **Fecha:** 2026-10-10
- **Alcance:** diff de `feat/configuracion-supabase` contra `main`, sin commitear, incluidos los 6 archivos nuevos.
  Lo comparé con los criterios 6 a 9, con "Diseño → Fase B" y con las respuestas 2, 3 y 9 de `critica.md`.

## Veredicto
**Aprobado con un cambio importante antes del PR.**

La base está bien:
- RLS correcta.
- `registro_operacion` no se puede escribir.
- `tocar_updated_at` tiene `search_path` vacío y EXECUTE revocado.
- El `id` no se puede cambiar.
- `database.ts` coincide con el generado.
- Las respuestas 2, 3 y 9 de la crítica están aplicadas.

El hueco está en `ConfiguracionPage`: si falla la *carga*, la pantalla no avisa nada (problema 1). Además, falta la verificación en el navegador (problema 2).

## Criterios → evidencia

| Criterio | Evidencia | Estado |
|---|---|---|
| 6. Portal lee sin sesión; fallbacks si falla | API: GET anónimo 200 con la fila. `PublicFooter.test.tsx`: consulta rechazada → "Sitio institucional". Header y Home: solo lectura del código (`config?.nombre \|\| 'Sitio institucional'`, ícono `School` con iniciales vacías). Sin test, pero la spec solo pedía el del footer | Cumple |
| 7. Admin edita; solo `nombre` obligatorio; portal se actualiza; fila en `registro_operacion`; error si falla | `ConfiguracionPage.test.tsx` (6 casos: solo nombre, nombre vacío, correo inválido, correo vacío, fallo → `role="alert"` sin "Cambios guardados", sin control de logo). `useConfiguracion.test.ts`: `setQueryData` con la fila devuelta y la caché intacta si falla. pgTAP y API: fila `UPDATE`/`'1'`/uid del admin. **Falta en el navegador** (paso 3 de la verificación de punta a punta) | Cumple, falta la verificación manual |
| 8. pgTAP | `configuracion.test.sql`, 24 asserts: SELECT de anon y de la cuenta sin marca; UPDATE con 0 filas y el valor sin cambios; INSERT 42501 (anon, sin marca y admin); DELETE de los tres que deja la fila; `id = 2` como postgres → 23514; `updated_at`; auditoría con `usuario_id`. `funciones.test.sql` con `tocar_updated_at` (search_path y tipo trigger). Guardias en verde | Cumple |
| 9. typecheck, lint, test, build, test:db; sin `configuracion.mock.ts` | Todo en verde (ver Evidencia). La carpeta `mocks/` del dominio ya no existe | Cumple |
| Crítica 2 | Esperados 42501 / conteo / 23514 como postgres. Política `to authenticated` con `(select public.es_admin())`. `tocar_updated_at` en `funciones.test.sql` | Aplicada |
| Crítica 3 | `correo: z.union([z.literal(''), z.email()])`; `telefono` y `direccion` sin mínimo; `nombre` con `trim().min(1)` (coincide con `btrim(nombre) <> ''`) | Aplicada |
| Crítica 9 | `ConfiguracionCambios = TablesUpdate<'configuracion'>`; el formulario usa `z.infer` | Aplicada |

Seguridad, verificada contra la base local (psql y API real con la clave publishable, sin leer `.env*`):

| Caso | Resultado |
|---|---|
| GET anónimo | 200, fila `id = 1` |
| PATCH anónimo / `sin-permiso@dam.local` | 200 `[]` (0 filas) |
| POST `sin-permiso` / POST admin `id = 2` | 403 `42501` (RLS) |
| PATCH admin `mision` | 200, 1 fila, `updated_at` actualizado |
| PATCH admin `id = 2` | 400 `23514` (`configuracion_id_check`) |
| PATCH admin `nombre = '  '` | 400 `23514` (`configuracion_nombre_check`) |
| DELETE admin | 200 `[]`, la fila sigue |
| `registro_operacion` como admin | 1 fila `UPDATE`, `registro_id = '1'`, `usuario_id` = uid del admin |
| POST/PATCH/DELETE `registro_operacion` como admin | 403 `42501` (sin privilegio) |
| GET/POST `registro_operacion` anónimo | 401 `42501` |

Privilegios en `pg_class`/`pg_proc`:
- `configuracion`: anon y authenticated `arwdxtm`, sin TRUNCATE. Lo esperado según la skill: la RLS es la barrera.
- `registro_operacion`: solo `authenticated=r`. Su secuencia queda solo para postgres.
- `tocar_updated_at`: `proacl = {postgres=X}`, `search_path=""`, no es SECURITY DEFINER.
- Como `authenticated`, `CREATE TRIGGER ... execute function public.tocar_updated_at()` da 42501 por el EXECUTE revocado, y `CREATE FUNCTION` en `public` también da 42501.

Convenciones:
- zod + RHF, con `Input`, `Textarea`, `FieldError` y `Button` de `ui/`.
- `database.ts` solo lo importa `features/configuracion/types.ts`, y las páginas usan `Configuracion` (0012).
- `database.ts` es idéntico a `supabase gen types typescript --local`.
- La migración todavía no está commiteada, así que no se pudo editar después del commit.
- Commit con Conventional Commits: pendiente.

Proceso (ediciones por shell):
- El diff de `HomePage.tsx` son solo las 2 líneas de `quienes_somos`, y el de `ConfiguracionPage.tsx` queda limpio y en LF. No quedan restos (`.bak`, `.orig`) ni archivos sin trackear de más.
- `HomePage`, `PublicHeader` y `PublicFooter` tienen CRLF en el working tree, pero ya lo tenían antes: 60 de 85 archivos de `src/` están igual. El índice está en LF y `.gitattributes` (`eol=lf`) lo normaliza al commitear. No es un problema de esta fase.

## Problemas

1. **[importante]** `src/pages/admin/ConfiguracionPage.tsx:30` y `:70-77`: no se maneja el error de *carga*. Si `useConfiguracion` falla, `isLoading` pasa a `false` y se renderiza el formulario vacío, sin aviso. El admin no puede distinguir "falló la consulta" de "la configuración está vacía". Si completa el nombre y guarda, el PATCH manda los 9 campos (`onSubmit` envía `values` completo) y probablemente pise con `''` la misión, la visión y el contacto reales. Arreglo: tomar `isError` de `useConfiguracion`, mostrar un mensaje con `role="alert"` y no renderizar el formulario (o deshabilitar "Guardar cambios") mientras no haya `data`. Sumar un caso a `ConfiguracionPage.test.tsx` con `obtenerConfiguracion` rechazada.
2. **[importante, proceso]** `docs/specs/auth-configuracion/notas.md:68`: falta el paso 3 de la verificación de punta a punta. Hay que editar la misión en `/admin/configuracion`, ver el cambio en `/` y ver la fila en Studio. Es la única evidencia de que el portal muestra los cambios en una app real: la sesión del navegador, la publishable y la caché entre la pantalla del admin y el portal. La tiene que hacer la persona antes del PR y anotarla en `notas.md`, como en la Fase A.
3. **[menor]** `docs/specs/auth-configuracion/spec.md:24`: cambió el texto del criterio 6 ("e iniciales" → "el header mantiene su ícono") y el cambio no figura en los desvíos de `notas.md` ni en `critica.md`. El cambio es correcto, porque sin nombre no hay iniciales y el footer muestra un recuadro vacío decorativo (`aria-hidden`). Igual conviene anotarlo. También hay que actualizar la línea **Estado** (`spec.md:3`) a "Fase B implementada" al cerrar.
4. **[menor]** `supabase/tests/configuracion.test.sql:98-121`: no hay un assert de que el admin no pueda cambiar el `id`. Lo protege el `CHECK (id = 1)`, y lo verifiqué por la API (`PATCH {id: 2}` da 23514), pero el test solo prueba el INSERT como postgres. Un `throws_ok($$update public.configuracion set id = 2 where id = 1$$, '23514', ...)` dentro del bloque admin lo fija.
5. **[menor]** `supabase/tests/funciones.test.sql`: no hay un assert de que `tocar_updated_at()` tenga EXECUTE revocado (`has_function_privilege('authenticated', 'public.tocar_updated_at()', 'execute')` = false). Es lo que bloquea un `CREATE TRIGGER` con esa función. `auditar()` tampoco lo tiene, así que es coherente con la base, pero si alguien saca el `revoke` en un corte futuro, nada falla.

Docs:
- `docs/arquitectura.md` y `CLAUDE.md` ("Estado actual") son coherentes con el código.
- La fila `configuracion` de la tabla de dominios y el párrafo de la migración describen lo implementado.
- "Brechas" ya no menciona supabase-js ni Auth como pendientes.
- Detalle sin impacto: el diagrama de capas (`arquitectura.md:9`) sigue diciendo "mocks hoy · Supabase directo mañana". Para el resto de los dominios todavía es cierto.

## Evidencia

```
npm run db:reset   → aplica base, guardias y configuracion; siembra admin y sin-permiso
npm run test:db    → Files=8, Tests=83, Result: PASS (configuracion.test.sql ok, funciones.test.sql ok, guardias ok)
npm test           → Test Files 11 passed (11) · Tests 92 passed (92)
npm run typecheck  → tsc -b sin errores
npm run lint       → 0 errores, 4 warnings preexistentes (only-export-components en AuthContext; incompatible-library
                     por watch() de RHF en ConfiguracionPage:57, DescargaModal y TallerFormPage; el watch ya estaba en main)
npm run build      → ✓ built (aviso de chunk > 500 kB, preexistente)
supabase gen types typescript --local  ≡  src/shared/types/database.ts (diff vacío)
```

Al terminar se corrió `npm run db:reset` para dejar la base limpia.
