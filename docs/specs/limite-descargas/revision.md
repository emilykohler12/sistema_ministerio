# Revisión 1

## Veredicto
Cambios necesarios (solo un test; la migración está bien)

## Problemas
- **[importante]** `supabase/tests/limite_descargas.test.sql:218-227`: los `throws_ok` de `DA003` y `DA004` dicen "se evalúa antes que el
  tope", pero corren con **29** intentos sembrados. Si el tope se moviera antes de `DA003`/`DA004`, con 29 la RPC no vuelve: inserta el
  intento, lanza `DA003`/`DA004` y el intento se revierte. Los asserts siguen en verde, así que el orden que exige el criterio 2 no tiene test.
  Con el orden invertido, una IP topeada que descarga un taller despublicado recibiría "bien" en lugar de `DA003`, y el modal no mostraría
  "no disponible". La migración tiene el orden correcto (`20261029130000_limite_descargas.sql:62-79`, antes del bloque de la IP).
  **Arreglo:** en el caso A, con `10.0.0.1` ya topeada (30 intentos), agregar `throws_ok` de `DA003` (taller en borrador) y de `DA004`
  (establecimiento de otra localidad). Hay que subir el `plan`.

## Observaciones (no bloquean)
- El contrato del test (línea 7) y el diseño piden revocar los privilegios de la **secuencia** `intento_descarga_id_seq`. La migración lo hace
  (línea 17), pero ningún assert lo fija: los de las líneas 126-133 solo miran la tabla. No se puede explotar (la columna es `generated always` y
  PostgREST no expone `nextval`). Si se quiere fijar, alcanza con un `has_sequence_privilege` para anon y authenticated.
- La verificación 4 de la spec (`x-real-ip` en el Supabase alojado) sigue pendiente y es **bloqueante para desplegar** la migración. Conviene
  dejarla escrita en el PR.

## Verificación por criterio
| # | Implementación | Test |
|---|---|---|
| 1 | `>= c_tope` → `return` sin insertar (migración 92-97) | Caso A (30 → no registra, siguen 30); C1 (9:59 cuenta), C2 (10:00 no cuenta), C3 (vencidos no cuentan) |
| 2 | El intento se inserta en la misma transacción, antes del registro; el admin sale antes del bloque de la IP | D (CHECK 23514 revierte el intento: siguen 29), A (topeada no suma), E (admin sin intento). **El orden DA003/DA004 → tope no está probado** (ver arriba) |
| 3 | `ip_cliente()` = `nullif(current_setting('request.headers', true), '')::json ->> 'x-real-ip'` | Caso 0 (sin HTTP), G (`''`, sin `x-real-ip`, solo XFF), H (XFF falso no cambia la IP contada) |
| 4 | `sha256(convert_to(ip,'UTF8'))`, purga global `fecha_hora < now() - 10 min` | I (purga otra IP, conserva recientes), 32 bytes y hash exacto |
| 5 | `pg_advisory_xact_lock(hashtextextended(v_ip, 0))` **antes** de la purga, el conteo y el insert (líneas 86-99). La función es volátil y en READ COMMITTED cada sentencia toma una foto nueva, así que el conteo posterior al lock ve los intentos ya confirmados de la llamada anterior de la misma IP. Correcto (verificado leyendo el código) | No aplica (pgTAP no prueba dos sesiones) |
| 6 | `revoke all` de la tabla y la secuencia a anon y authenticated, RLS sin políticas; `revoke execute` de `ip_cliente()` a public, anon, authenticated y service_role; excepción `('intento_descarga', 28)` justificada en `auditoria_global` | 42501 de anon, authenticated y admin en SELECT, INSERT y DELETE (authenticated sin DELETE, cubierto por `has_table_privilege`); `ip_cliente()` 42501 para los tres; `has_function_privilege` de los tres roles; guardias globales en verde |
| 7 | `git diff main --stat -- src/features/descargas` vacío | `npm test` en verde sin tocar los tests del dominio |

## Seguridad
- `registrar_descarga`: misma firma (conserva los grants), repite `security definer` y `set search_path = ''`, y el cuerpo es idéntico al de
  `20261016130000_no_contar_admin.sql:10-57` más el bloque del tope. Los tests fijan `prosecdef`, `proconfig` y el EXECUTE de anon.
- `ip_cliente()` es invoker y la llama el definer como dueño (postgres). Ningún rol de la API la ejecuta.
- `e2e/global-setup.ts` usa `supabaseLocal()`, que exige `http:` con `localhost`/`127.0.0.1` (`esUrlLocal`, por hostname y no por prefijo).
  No puede apuntar a la nube. `service_role` conserva sus privilegios sobre la tabla (no se le revocan), como pide el diseño.
- Nunca se guarda la IP: la única columna con datos es `bytea` de 32 bytes.

## Evidencia
- `npm run db:reset`: aplica `20261029130000_limite_descargas.sql` y siembra los usuarios.
- `npm run test:db`: `Files=22, Tests=790`, `All tests successful`, `Result: PASS` (`limite_descargas.test.sql ... ok`, plan 93).
- `npm test`: `Test Files 89 passed (89)`, `Tests 1533 passed (1533)`.
- `npm run lint`: exit 0, 0 errores, 4 warnings ya existentes (`TallerFormPage`, `DescargaModal:133`, `ConfiguracionPage`, `AuthContext`), ninguno en archivos del cambio.
- `npm run typecheck`: exit 0.
- No se corrieron los e2e (los corre qa). La base quedó reseteada con `npm run db:reset` al terminar.
