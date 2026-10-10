# Crítica de la spec: auth-configuracion

- **Crítico:** subagente `critico`
- **Fecha:** 2026-10-10
- **Leído:** spec, contexto, ADR 0004, 0005, 0007, 0012 y 0013, skill `supabase-rls`, `AuthContext`, `LoginPage`,
  `ConfiguracionPage`, `AdminLayout`, `AdminSidebar`, `PublicFooter`, migraciones y tests pgTAP.

## Veredicto
Hay mejoras. El diseño general es correcto y respeta los ADR. Lo más importante es la sesión: hoy tiene dos fuentes,
puede quedar trabada (deadlock) y el cierre de sesión tiene dos responsables. Además, hay tests pgTAP que esperan un
error que Postgres no va a dar, y una validación del formulario que choca con la fila inicial.

## Hallazgos

### 1. Sesión: dos fuentes, signOut dentro del callback y dos caminos de cierre (alta)
**Problema.** El `AuthContext` restaura con `getSession` y además se suscribe a `onAuthStateChange`. Así, dos fuentes
escriben el mismo estado y pueden hacerlo en cualquier orden. Además, "si encuentra una sesión sin la marca, la cierra"
lleva a llamar a `signOut()` desde el callback. supabase-js documenta que llamar a métodos de `supabase.auth` dentro de
ese callback puede trabar el cliente (deadlock), porque el callback corre mientras el cliente tiene tomado el lock de
la sesión. Por último, `iniciarSesion` también cierra la sesión cuando la cuenta no tiene la marca, así que hay dos
`signOut` para el mismo caso.

**Propuesta.**
- Que haya una sola fuente: solo `escucharSesion` (`onAuthStateChange`). En supabase-js 2.x el primer evento es
  `INITIAL_SESSION`, que reemplaza a `getSession`. `cargando` pasa a `false` en ese evento. Se quita `obtenerSesion`.
- `usuario` se deriva dentro del callback, sin efectos:
  `session && esAdmin(session.user) ? { id, email } : null`. Así, una sesión sin la marca nunca llega a ser `usuario`,
  ni siquiera por un render, y el criterio 3 ("se trata igual que si no hubiera sesión") se cumple solo.
- Un solo responsable del `signOut` de una sesión sin la marca: el callback, diferido con `setTimeout(() => cerrarSesion(), 0)`.
  `iniciarSesion` solo traduce el resultado: devuelve `'sin-permiso'` si `!esAdmin(data.user)` y no cierra nada.
- Agregarlo como regla en la spec: "no llamar a `supabase.auth.*` sincrónicamente dentro del callback".

**Qué se gana.** Una función menos, ninguna carrera, ningún deadlock y un solo camino de cierre que se puede testear.

### 2. pgTAP: el INSERT del admin no falla por el CHECK y el DELETE no da error (media)
**Problema.** El criterio 8 dice "admin: INSERT de una segunda fila falla (`CHECK id = 1`)". Como no hay política de
insert, Postgres evalúa el `WITH CHECK` de la RLS antes que los constraints, así que el error es `42501` (RLS) y nunca
llega al CHECK. Un `throws_ok` que espere `23514` va a quedar rojo, o el implementador lo va a "arreglar" de la forma
equivocada. Además, un DELETE sin política no da error: borra 0 filas. "DELETE no" tiene que verificarse contando
filas, no con `throws_ok`.

**Propuesta.** Escribir los esperados en el criterio:
- `anon`/`authenticated` sin marca/admin + INSERT → `42501`;
- DELETE de cualquier rol → la fila `id = 1` sigue existiendo;
- UPDATE sin marca → 0 filas y el valor sin cambios;
- el CHECK se prueba como dueño (`postgres`, que saltea la RLS): insertar `id = 2` → `23514`.

Para la política de update, seguir el patrón de la base: `to authenticated using ((select public.es_admin())) with check ((select public.es_admin()))`.
Si `tocar_updated_at()` es transversal, que lleve `set search_path = ''` y su línea en `funciones.test.sql`,
como las demás funciones base.

**Qué se gana.** Tests que prueban lo que dicen y una política coherente con `registro_operacion`.

### 3. La fila inicial con `''` choca con el formulario (media)
**Problema.** La fila se inserta con `telefono`, `direccion` y `correo` en `''`. Pero el formulario actual exige
`telefono` min 1, `direccion` min 1 y `correo` como email. Entonces el paso 3 de la verificación ("editar la misión y
guardar") no pasa: el primer guardado obliga a completar tres campos que quizás todavía no se conocen (P-01 sigue
abierta por el contenido). Para la base `''` es un valor válido y para el formulario no: la spec no dice cuál de los
dos manda.

**Propuesta.** Elegir una sola regla. La más simple, y coherente con los fallbacks del portal (el footer ya oculta
teléfono y correo vacíos):
- en el formulario, `correo: z.union([z.literal(''), z.email()])`, y `telefono`/`direccion` sin mínimo;
- solo `nombre` es obligatorio, como en la base.

La alternativa es mantener el formulario estricto y corregir la verificación ("completar contacto y misión").

**Qué se gana.** La base y el formulario dicen lo mismo, y la verificación de punta a punta pasa tal como está escrita.

### 4. Faltan tests para los criterios 4 y 6, y la forma de montar `useAuth` (media)
**Problema.** La sección de tests no cubre el criterio 4 (skeleton y nada de redirigir mientras `cargando`) ni el 6
(portal con fallbacks si la consulta falla). Hoy ningún test renderiza páginas que usen la configuración, y
`renderConProviders` no incluye Auth, así que el test de `LoginPage` o de `AdminLayout` no tiene dónde montar `useAuth`.

**Propuesta.**
- `AdminLayout.test.tsx`: con `escucharSesion` mockeado que no emite, muestra el skeleton y no redirige. Con
  `INITIAL_SESSION` `null`, redirige.
- `PublicFooter.test.tsx` (o `HomePage`): con `obtenerConfiguracion` rechazada, se ven `'Sitio institucional'` y las
  iniciales.
- Escribir en la spec que estos tests usan el `AuthProvider` real con `vi.mock('@/features/auth/consultas')`. Es otra
  forma de hacer lo mismo que pide 0012 y no hace falta un "AuthProvider de test" aparte.

**Qué se gana.** Todos los criterios funcionales quedan verificables en `npm test`, sin depender de la verificación
manual.

### 5. Dos dominios en un PR: dividir en Fase A (cliente + auth) y Fase B (configuración) (media)
**Problema.** 0012 dice que se migra "un dominio por vez (…) en un solo PR". Esta spec mueve dos (`auth` y
`configuracion`), más la infraestructura del cliente. Son unos 20 archivos: migración, pgTAP, cliente, env, contexto,
login, layout, sidebar, dos formularios, tipos, consultas, hooks, cuatro pantallas y sus tests. Lo más riesgoso (la
sesión, hallazgo 1) queda mezclado con lo más mecánico (pasar a snake_case).

**Propuesta.** Mantener una sola spec con dos fases, como `supabase-base`:
- **Fase A**: `supabase.ts`, env, `auth/consultas.ts`, `AuthContext`, `LoginPage`, `AdminLayout`, `AdminSidebar` y
  los formularios con el email. Criterios 1 a 5. Se verifica con los usuarios del seed, sin migración.
- **Fase B**: migración, pgTAP, tipos, consultas, hooks y pantallas de configuración. Criterios 6 a 8.

**Qué se gana.** Cada PR se revisa en una sentada, la sesión se valida antes de construir encima y se respeta la letra
de 0012.

### 6. LoginPage: navegar cuando hay `usuario`, no después del `await` (media)
**Problema.** `navigate(from)` justo después de `await iniciarSesion()` supone que el `setState` del callback de
`onAuthStateChange` ya se aplicó cuando `AdminLayout` se renderiza. Eso depende de que supabase-js espere a los
suscriptores antes de resolver `signInWithPassword` y de cómo agrupe React los renders. Si cambia alguno de los dos,
`AdminLayout` ve `usuario = null` y `cargando = false` y devuelve al login.

**Propuesta.** En `LoginPage`, `if (usuario) return <Navigate to={from} replace />`. `iniciarSesion` solo devuelve el
error para mostrarlo. Así también se resuelve el caso de entrar a `/admin/login` con la sesión ya iniciada.

**Qué se gana.** Una sola regla de navegación que se deriva del estado, sin depender del orden interno de la librería.

### 7. Clave: `VITE_SUPABASE_PUBLISHABLE_KEY` en vez de `ANON_KEY` (baja)
**Problema.** El CLI 2.120 ya trae las claves publishable (`sb_publishable_…`): el binario las expone junto con las
legacy (`ANON_KEY`). Supabase está retirando las claves JWT legacy, y el proyecto de demos de la nube (0011) se va a
crear más adelante, así que puede que solo ofrezca publishable. supabase-js 2.117 acepta las dos.

**Propuesta.** Nombrar la variable `VITE_SUPABASE_PUBLISHABLE_KEY` y cargar la publishable que muestra
`npx supabase status`. Antes de cerrar la spec, confirmar que `auth.jwt()`/`es_admin()` funcionan igual con esa clave
en local (el gateway la traduce al rol `anon`). No contradice 0004: es la misma clave pública por diseño y la RLS sigue
siendo la barrera.

**Qué se gana.** No hay que renombrar `.env.example`, `vite-env.d.ts`, `supabase.ts` y la documentación cuando llegue
la nube.

### 8. `test.env` en `vite.config.ts` sobra y además esconde errores (baja)
**Problema.** Con `vi.mock('../consultas')` (0012), ningún test de la spec importa `supabase.ts`. Si alguno lo importa
es porque se olvidó el mock. Hoy eso falla con "falta `VITE_SUPABASE_URL`", que es justo la señal que hace falta. Con
valores ficticios en `test.env`, el mismo olvido pasa a ser un `fetch` a una URL inexistente, con errores confusos o
tests que se cuelgan.

**Propuesta.** No agregar `test.env`. Si algún día un test necesita el cliente real, se agrega ahí, con su motivo.

**Qué se gana.** Una configuración menos, y el error de import refuerza la regla de 0012 en lugar de taparla.

### 9. `ConfiguracionEditable`: derivarlo, no escribirlo (baja)
**Problema.** Un `Omit<Configuracion, 'id' | 'updated_at' | 'logo_ruta'>` hecho a mano es una lista más para mantener
cuando se sume el logo, y exige que el tipo del formulario coincida exactamente, nulabilidad incluida.

**Propuesta.** En `types.ts`, usar `export type ConfiguracionCambios = TablesUpdate<'configuracion'>` (ya lo genera
`database.ts`) para el parámetro de `guardarConfiguracion`. Es parcial, así que el formulario manda lo que edita.

**Qué se gana.** Un tipo menos escrito a mano, y cuando vuelva el logo no hay que tocar nada.

### 10. Al cerrar sesión, limpiar la caché de React Query (baja)
**Problema.** La spec "deja armado el patrón" de sesión. Hoy la configuración es pública, pero en los próximos cortes
(dashboard, historial, borradores) la caché va a guardar datos que solo ve el admin, y van a seguir ahí después de
`signOut`, en la misma pestaña.

**Propuesta.** En el callback, ante `SIGNED_OUT`, hacer `queryClient.clear()`. Agregar al criterio 5: "después de
cerrar sesión no quedan consultas del admin en caché".

**Qué se gana.** El patrón que copian los cortes siguientes ya viene seguro, y es una línea.

## Lo que está bien así
- `tocar_updated_at()` transversal: §8.3 pone `updated_at` en todas las tablas, así que se reutiliza desde el próximo
  corte. `moddatetime` serviría igual, pero suma una extensión y no ahorra nada.
- El error tipado `'credenciales' | 'sin-permiso' | 'red'`: hay tres mensajes distintos en los criterios 2 y 3.
  Conviene escribir el mapeo: `error.code === 'invalid_credentials'` → `credenciales`; cualquier otro error → `red`.
- `update … .select().single()`: convierte el "0 filas por RLS" en error. Es correcto y evita el falso "Cambios guardados".
- Que `esAdmin` en el cliente sea solo UX está bien, porque la barrera es `es_admin()` en la RLS. Conviene decirlo en una
  línea de la spec para que nadie lo tome como control de seguridad.

## Respuesta

1. **Acepto.** Una sola fuente: el evento `INITIAL_SESSION` de `onAuthStateChange`. `usuario` se deriva con `esAdmin` y
   el `signOut` lo hace solo el callback, diferido. Se quita `obtenerSesion` y la regla queda escrita en la spec.
2. **Acepto.** Los resultados esperados (42501, conteo de filas, CHECK probado como `postgres`) quedan en el criterio.
   La política se escribe `to authenticated` con `(select public.es_admin())` y `tocar_updated_at()` lleva su línea en `funciones.test.sql`.
3. **Acepto relajar el formulario.** P-01 sigue abierta por el contenido. Obligar a completar el contacto para poder
   guardar la misión no protege nada, y el footer ya oculta los campos vacíos.
4. **Acepto.** Se agregan `AdminLayout.test.tsx` y `PublicFooter.test.tsx`, con el `AuthProvider` real y `consultas` mockeado.
5. **Acepto.** Va una sola spec con dos fases y dos PRs, como `supabase-base`. La Fase A se valida contra los usuarios del seed
   sin escribir ninguna migración.
6. **Acepto.** La navegación se deriva del estado. También cubre entrar al login con la sesión ya iniciada.
7. **Acepto**, con una condición: en la Fase A se verifica que el login y el JWT con `app_metadata` funcionen con la clave publishable.
   Si no funcionan, se vuelve a `ANON_KEY` y se anota en `notas.md`.
8. **Acepto.** Que el import falle es la señal correcta de que falta un mock.
9. **Acepto en parte.** `guardarConfiguracion` recibe `TablesUpdate<'configuracion'>`. El tipo del formulario sale de
   `z.infer` de su schema (lo que se edita), no de un `Omit` escrito a mano.
10. **Acepto.** Al recibir `SIGNED_OUT` se hace `queryClient.clear()`. Es barato y es el patrón que copian los cortes siguientes.

No hay desacuerdos con el crítico.

# Crítica de código: Fase A

- **Crítico:** subagente `critico`
- **Fecha:** 2026-10-10
- **Leído:** `supabase.ts`, `vite-env.d.ts`, `auth/consultas.ts`, `AuthContext.tsx`, `LoginPage.tsx`, `AdminLayout.tsx`,
  `AdminSidebar.tsx`, los dos formularios, los cuatro tests, `src/test/utils.tsx`, `notas.md` y `signOut`,
  `_emitInitialSession` y el lock de `@supabase/auth-js` 2.117.3 en `node_modules`.

## Veredicto
Hay mejoras, todas chicas. El diseño de sesión acordado (hallazgos 1, 6 y 10) quedó bien aplicado y no encontré
carreras ni bucles. Lo que conviene corregir antes de que los cortes siguientes copien el patrón está en los tests y en
el cierre de sesión. Un detalle de los tests revierte sin querer el hallazgo 8, y el cierre de sesión navega dos veces.

## Hallazgos

### 1. `esAdmin` en `consultas.ts` obliga a mockear el cliente en los cuatro tests (media)
**Problema.** `esAdmin` es una función pura, pero vive en `consultas.ts` (`consultas.ts:5`), junto a los envoltorios
que importan `supabase.ts`. Para usar el `esAdmin` real, los tests hacen `importActual` de `consultas`. Eso carga
`supabase.ts`, que falla sin variables. Por eso los cuatro archivos agregan `vi.mock('@/shared/lib/supabase', () => ({ supabase: {} }))`
(`consultas.test.ts:6`, `AuthContext.test.tsx:22-28`, `LoginPage.test.tsx:24-30`, `AdminLayout.test.tsx:19-25`).
Así se pierde lo que aceptamos en el hallazgo 8: si a un test le falta el mock de `consultas`, ya no aparece el error
claro "falta `VITE_SUPABASE_URL`", sino un `Cannot read properties of undefined (reading 'onAuthStateChange')`.
Los cortes siguientes van a copiar ese `supabase: {}` sin saber por qué está.

**Propuesta.** Mover `esAdmin` a un módulo sin imports, por ejemplo `src/features/auth/esAdmin.ts` (o `permisos.ts`),
junto con su test. Así `consultas.ts` queda solo con envoltorios de `supabase.auth`, como pide 0012. Los tests mockean
`consultas` con una factory simple, sin `importActual` ni mock del cliente:
`vi.mock('@/features/auth/consultas', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn(), escucharSesion: vi.fn() }))`.

**Qué se gana.** Se van cuatro mocks del cliente y tres `importActual`. Además, el test que olvide el mock vuelve a
fallar con el mensaje correcto.

### 2. La plomería de sesión está copiada en tres tests y viene una cuarta copia (baja)
**Problema.** `AuthContext.test.tsx`, `LoginPage.test.tsx` y `AdminLayout.test.tsx` repiten lo mismo: los mocks
`hoisted`, la captura de `callback` en `escucharSesion`, `emitir` con `act`, las sesiones de ejemplo y el árbol
`QueryClientProvider > AuthProvider`. `TallerFormPage` y `NormativaFormPage` ya usan `useAuth`, así que sus tests van a
ser la cuarta y la quinta copia.

**Propuesta.** Crear `src/test/auth.tsx`, aparte de `utils.tsx`, con:
- `simularSesion()`: configura `vi.mocked(escucharSesion)` para capturar el callback y devuelve
  `emitir(evento, session)`, que ya envuelve la llamada en `act`;
- `sesionAdmin` y `sesionSinMarca`;
- `ConAuth({ children })`: arma `QueryClientProvider` (el de `crearQueryClient`) con `AuthProvider`. Cada test pone el
  router que necesita: `MemoryRouter` o un data router si usa `useMatches`.

`vi.mock(...)` sigue en cada archivo, porque Vitest lo eleva al principio de cada archivo. Tiene que ir aparte de
`utils.tsx`: si `utils.tsx` importara `AuthProvider`, todos los tests que usan `renderConProviders` cargarían
`consultas` sin mock.

**Qué se gana.** Unas 25 líneas menos por archivo, una sola definición de "sesión de admin" y un patrón listo para
los tests de formularios.

### 3. Cerrar sesión navega dos veces (baja)
**Problema.** `AdminSidebar.tsx:17-20` hace `await cerrarSesion()` y después `navigate('/admin/login')`. Pero
`signOut` emite `SIGNED_OUT`, `usuario` pasa a `null` y `AdminLayout.tsx` ya redirige con su `<Navigate>`. Quedan dos
navegaciones al login, cuyo orden depende de cuándo React aplica el estado. El hallazgo 6 corrigió lo mismo en el login;
acá vuelve a pasar en el cierre de sesión. Además, `cerrarSesion` en el contexto (`AuthContext.tsx:57-59`) es un
envoltorio que no agrega nada.

**Propuesta.**
- En el sidebar, `onClick={() => void cerrarSesion()}`. La redirección queda a cargo de `AdminLayout`, que ya la hace.
- En el contexto, exponer directamente `cerrarSesion: cerrarSesionConsulta`.
- El criterio 5 ("después, volver a `/admin` redirige") se cubre con un caso en `AdminLayout.test.tsx`: admin y después
  `SIGNED_OUT` llevan al login.

Efecto lateral: `AdminLayout` guarda `state.from`, así que el próximo login vuelve a la última pantalla en lugar de
`/admin`. Si no se quiere ese comportamiento, se puede dejar el `navigate` del sidebar con `{ replace: true }`.

**Qué se gana.** Una sola regla de navegación (se deriva del estado), un envoltorio menos y el criterio 5 testeado.

## Lo que está bien así
- **Sesión sin bucles.** Una sesión sin la marca produce `setTimeout(signOut)`, después `SIGNED_OUT` con `null`, y ahí
  se corta, porque `null` no dispara otro cierre. Un `signOut` doble (por ejemplo `SIGNED_IN` y `TOKEN_REFRESHED` antes
  de que corra el timeout) es inofensivo: solo emite otro `SIGNED_OUT`. En 2.117, `_signOut` borra la sesión local
  aunque falle la red, así que el botón nunca deja la sesión colgada.
- **StrictMode.** El primer efecto se desuscribe de forma sincrónica, antes del `INITIAL_SESSION` asíncrono, y
  `_emitInitialSession` busca el callback por `id` (`stateChangeEmitters.get(id)?.`). Por eso la suscripción
  descartada no recibe nada y no quedan timeouts sueltos. Si falla la carga, `INITIAL_SESSION` llega igual con `null`,
  así que `cargando` nunca queda trabado.
- **`setTimeout` en el callback.** En 2.117 el cliente ya no usa lock por defecto ("lockless coordination"), así que el
  deadlock del hallazgo 1 ya no aplica. Igual conviene dejarlo: no cuesta nada y protege si alguien configura `lock`.
- **Entre `SIGNED_IN` y el render.** `LoginPage` deriva la navegación de `usuario` y el `setErrorSesion` posterior cae
  en un componente desmontado, lo que en React 19 es inofensivo. Con `TOKEN_REFRESHED`/`USER_UPDATED`, si a alguien le
  quitan la marca, el próximo refresh lo saca del panel, que es lo correcto.
- **`only-export-components`.** Ya estaba en `main` (`useAuth` se exportaba igual). Para separarlo hacen falta tres
  archivos (contexto, provider y hook), y lo único que se gana es fast refresh en un archivo que casi no se toca. Se
  puede tolerar. Si molesta el warning, alcanza con `allowExportNames: ["useAuth"]` en `.oxlintrc.json`.
- `supabase.ts`, `vite-env.d.ts` y el mapeo de errores en el contexto son mínimos y siguen la spec.

## Respuesta (Fase A)

1. **Acepto.** `esAdmin` pasa a `auth/esAdmin.ts`, un módulo puro. Así los tests mockean `consultas` con una factory simple y se
   recupera el error claro por variable faltante (hallazgo 8 de la spec).
2. **Acepto.** Los helpers van en `src/test/auth.tsx`, aparte de `utils.tsx`, y el `vi.mock` se mantiene en cada test.
3. **Acepto.** El botón solo llama a `cerrarSesion()` y la redirección se deriva del estado en `AdminLayout`. Tomamos el efecto
   lateral (al volver a entrar se va a la última pantalla) como algo aceptable: la RLS protege los datos, no la navegación. Se agrega un
   caso en `AdminLayout.test.tsx`: admin → `SIGNED_OUT` → login.

Revisión (`revision.md`):
- 2 (`signInWithPassword` que lanza) y 3 (promesas sin capturar): **acepto**. `try/catch` → `'red'`, test con
  `mockRejectedValue`, y `cerrarSesion` sin rechazos sueltos.
- 4 (docs desactualizadas): **acepto**; lo hace el agente principal.
- 1 (verificación manual de recarga, cierre del navegador y logout): **acepto**. Necesita un navegador; la hace la persona antes del PR
  y queda anotada en `notas.md`.

