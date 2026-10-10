# Notas de implementación: auth-configuracion

## Fase A

### Verificación de la clave publishable (hallazgo 7)
Con Supabase local levantado, `POST http://127.0.0.1:54321/auth/v1/token?grant_type=password` con el header
`apikey: <PUBLISHABLE_KEY de npx supabase status -o json>`:

| Cuenta | HTTP | `app_metadata` en el JWT |
|---|---|---|
| `admin@dam.local` / `admin-dam-local` | 200 | `{"admin":true,...}`, rol `authenticated` |
| `sin-permiso@dam.local` | 200 | sin `admin` |
| `admin@dam.local` con clave incorrecta | 400 | `error_code = invalid_credentials` |

Conclusión: la clave publishable funciona igual que la anon. Se usa `VITE_SUPABASE_PUBLISHABLE_KEY` en todos lados.

### Desvíos
- La verificación se hizo con `fetch` de Node en vez de `curl`, para extraer la clave de `status -o json` sin imprimirla. El request es el mismo.
- `AuthContext` exporta además los tipos `UsuarioAdmin` y `ErrorInicioSesion` (este último lo usa `LoginPage` para mapear los mensajes).

### Ronda de correcciones (crítica de código y revisión de la Fase A)
Aplicado: `esAdmin` pasa a `auth/esAdmin.ts` (módulo puro) y su test a `esAdmin.test.ts`; los tests mockean `consultas` con una
factory simple y sin mock del cliente; helpers en `src/test/auth.tsx` (`simularSesion`, `sesionAdmin`, `sesionSinMarca`, `ConAuth`);
el contexto expone `cerrarSesion` directo y el sidebar solo la llama (la redirección la hace `AdminLayout`, con test admin → `SIGNED_OUT` → login);
`iniciarSesion` devuelve `'red'` si la consulta lanza (tests en `AuthContext` y `LoginPage`); sin promesas rechazadas sueltas (`.catch(() => {})`).

Desvíos:
- `crearQueryClient` en `src/test/utils.tsx` ahora se exporta, para que `ConAuth` lo reutilice (`utils.tsx` no importa `auth.tsx`).
- `ConAuth` acepta un `client` opcional: `AuthContext.test.tsx` necesita espiar `client.clear`.
- `simularSesion()` devuelve `{ emitir, desuscribir }` (no solo `emitir`) y deja `cerrarSesion` resolviendo, porque el `.catch` exige una promesa.
- Se agregaron dos tests no pedidos: el cierre diferido que rechaza no deja promesas sueltas, y el contexto expone la `cerrarSesion` de las consultas.
- Los mocks usan `as never` en `mockResolvedValue` de `iniciarSesion`, porque los tests devuelven solo `{ code?, message }` en vez de un `AuthError` completo.
- Verificación manual (revisión, problema 1): hecha por Joa Sanchez el 2026-10-10 con `npm run dev` y Supabase local, todo OK.
  - `/admin` sin sesión redirige al login.
  - Mensajes: contraseña incorrecta, `sin-permiso@dam.local` sin permiso y `admin@dam.local` entra.
  - La sesión sigue al recargar y se pierde al cerrar el navegador.
  - "Cerrar sesión" lleva al login y `/admin` vuelve a redirigir.
