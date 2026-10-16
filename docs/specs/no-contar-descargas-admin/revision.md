# Revisión 1

## Veredicto
Aprobado. Los dos hallazgos son menores y no bloquean, pero conviene corregirlos antes del PR.

## Requisitos del plan

| Paso / requisito | Estado |
|---|---|
| Migración nueva con `create or replace` de las dos RPC, con `security definer` y `search_path = ''` repetidos | Cumple. El cuerpo de `registrar_descarga` es idéntico al de `20261010180000_descargas.sql`, salvo el `return`. La firma no cambia, así que los grants (`revoke ... from public`, EXECUTE para anon y authenticated) se conservan y `database.ts` no cambia |
| `registrar_descarga`: `if public.es_admin() then return; end if;` después de `DA004` y antes del `insert`, con comentario | Cumple (`no_contar_admin.sql:47-50`). El comentario de cabecera explica por qué los CHECK no se evalúan para el admin |
| `contar_descarga_normativa` sigue en `language sql` con `and not (select public.es_admin())` | Cumple (`no_contar_admin.sql:60-69`) |
| `normativas.test.sql:635-638` espera 1 y `:397-399` cambia la descripción | Cumple |
| `descargas.test.sql`: `results_eq` de la localidad 7 (sin marca registra), admin válido con `count = 0` en la localidad 8, `DA003` y `DA004` para el admin, `plan(98)` | Cumple. El `results_eq` de la localidad 7 se lee en el bloque admin porque el usuario sin marca no tiene SELECT. Es correcto |
| Orden `DA003` → `DA004` → return del admin | Fijado por los tests: si el `return` estuviera antes de alguna de las dos validaciones, el `throws_ok` del admin fallaría |
| Docs: sacar la brecha de Descargas y Dashboard y anotar la regla | Cumple en `arquitectura.md` |
| Fuera de alcance (cliente, `metricas_*`, e2e) | Sin cambios en `src/`, en `metricas_*` ni en `e2e/` |

**Distingue `es_admin()` de rol o uid (descargas).** Sí. En `descargas.test.sql` el usuario "sin marca" y el admin son el mismo `sub` (`7777...`) con el mismo rol `authenticated`, y solo cambia `app_metadata`. Un filtro por `auth.uid()` o por rol dejaría la localidad 7 en 0 y el test fallaría.

**Seguridad.** Un anon no puede falsificar la marca. `es_admin()` lee `app_metadata` del JWT, que firma Supabase y que solo se edita con service_role. `request.jwt.claims` lo fija PostgREST a partir del token verificado. El error posible va hacia el lado inocuo: un JWT de admin deja de contar, y ningún rol gana capacidad de escribir. Con service_role, `es_admin()` da falso y cuenta, como dice el comentario.

## Problemas

- **[menor]** `supabase/tests/normativas.test.sql:330-368` — Para `contar_descarga_normativa`, los tests no distinguen "filtra por `es_admin()`" de "filtra por rol o uid". Solo comparan anon (cuenta) con admin (no cuenta), así que `where id = p_id and auth.uid() is null` o `and auth.role() = 'anon'` también darían verde. En descargas este caso está cubierto con la localidad 7, pero acá no. **Arreglo:** en el bloque "authenticated sin marca", agregar un `lives_ok` de `contar_descarga_normativa(current_setting('test.contador')::int)` y pasar el esperado de `:638` a `(2, true)`, con la descripción "anon y sin marca; el admin no cuenta". El UPDATE del contador no se audita por el `WHEN`, así que el assert de `:631-634` (0 filas UPDATE) sigue valiendo.
- **[menor]** `supabase/tests/descargas.test.sql:24-28` y `supabase/tests/normativas.test.sql:26-28` — Los bloques CONTRATO de la cabecera siguen diciendo "4. Inserta." y "Suma 1 a normativa.descargas" sin la excepción del admin. Son la especificación que leen los implementadores y ahora contradicen la migración. **Arreglo:** agregar "con sesión de admin (`es_admin()`), vuelve sin insertar después de DA004" y "con sesión de admin no suma".

## Evidencia

- `npm run test:db`: 18 archivos, 602 tests, **PASS**. Se corrió antes y después de `npm run db:reset`. El reset aplicó `20261016130000_no_contar_admin.sql` desde cero sin errores y volvió a sembrar `admin@dam.local` y `sin-permiso@dam.local`, así que la base quedó limpia.
- `npm run lint`: salida 0 y 4 warnings previos (`AuthContext.tsx`, `ConfiguracionPage.tsx`, `TallerFormPage.tsx`, `DescargaModal.tsx`), ninguno en archivos de este cambio.
- `npm run typecheck` (`tsc -b`): sin errores.
- `npm test`: 68 archivos, 1172 tests, todos en verde.
