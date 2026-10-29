# Revisión 1

## Veredicto
Aprobado

## Problemas
No encontré problemas críticos ni importantes.

Cómo revisé cada punto del foco:

- **Seguridad del security definer.** `borrar_etiquetas_huerfanas()` es `returns trigger`. Postgres no deja llamar una función de trigger
  fuera de un trigger, y `CREATE TRIGGER` exige EXECUTE sobre la función, aunque authenticated tenga el privilegio TRIGGER sobre las tablas
  de `public` por los defaults de Supabase. El EXECUTE está revocado a `public`, `anon`, `authenticated` y `service_role`, con un assert por
  rol. Lleva `search_path = ''`, todo calificado, y `borradas` es una tabla de transición: no se resuelve por esquema. Las filas de
  `borradas` solo salen de un DELETE sobre los puentes. Para anon y para authenticated sin marca, la RLS deja ese DELETE en 0 filas, así que
  la función no recibe ids y no hay forma de que borre etiquetas arbitrarias. `etiqueta` sigue sin política ni grant de delete (assert:
  admin, delete directo = 0 filas, Etiq B sigue).
- **Borrado limitado a las filas borradas.** El `where e.id in (select ... from borradas)` y los dos `not exists` hacen ese recorte.
  `guardar_taller` y `guardar_normativa` sincronizan por diferencia (`etiqueta_id <> all (v_ids)`), así que una etiqueta que se conserva
  nunca entra en `borradas`. Los dos tests que importan distinguen esta versión de una que borre todas las huérfanas: "Etiq H2" (huérfana
  ajena) sobrevive, y T3 pasa de G a "Etiq Nueva". Con una variante "borrar todas", "Etiq Nueva" se borraría entre el DELETE y el INSERT
  del puente, y el `lives_ok` fallaría por la FK.
- **Limpieza inicial.** Solo hay dos FK hacia `etiqueta` (`taller_etiqueta` y `normativa_etiqueta`, sin otras referencias en
  `migrations/`). El `delete` exige que no haya fila en ninguna de las dos, así que no puede borrar una etiqueta en uso. Si se borrara una
  referenciada, la FK sin cascada haría fallar la migración, no la dejaría inconsistente. Una etiqueta creada en un guardado concurrente
  todavía no confirmado no la ve el delete de la migración. `db:reset` aplica la migración, y `auditar()` acepta `usuario_id` nulo sin
  sesión. El pgTAP corre la misma sentencia sobre una huérfana propia y verifica la auditoría con `usuario_id` nulo.
- **Auditoría.** `etiqueta_auditar` registra cada borrado con el `auth.uid()` de quien guardó, porque el claim no cambia con el definer.
  El assert cuenta 7 DELETE con el uuid del admin (A, B, C, D, E, G y F por cascada) y cuadra con la secuencia del test.
- **Test 97 de `normativas.test.sql` (de `(0,0,1)` a `(0,0,0)`).** Es el cambio de comportamiento buscado, no oculta una regresión.
  "Etiq Borrar" solo está vinculada a "N Borrar" (línea 66). Ningún paso del test la vincula a otra fila: `etiq_borrar` aparece solo en los
  intentos de anon y sin marca, y los asserts de las líneas 319 y 384 confirman que su fila puente sigue intacta. Por lo tanto la baja la
  deja sin uso y se tiene que borrar. El caso "compartida, queda" lo cubren `etiquetas_huerfanas.test.sql` (Etiq C, B y E).
  La cabecera CONTRATO de ese archivo no decía que la etiqueta quedara, así que no quedó desactualizada.
- **Frontend.** `useEliminarNormativa` invalida `['etiquetas']` solo en `onSuccess`. El test verifica las dos ramas (invalida en el éxito,
  no invalida en el error). `useGuardarNormativa` y `useGuardarTaller` ya invalidaban esa clave.
- **Alcance.** Coincide con el plan. No se tocaron UI, Storage ni migraciones ya aplicadas. `docs/arquitectura.md` queda para el
  coordinador.

Nota, sin severidad: dos transacciones que quitan a la vez los dos últimos vínculos de una misma etiqueta (taller 1 y taller 2, en
paralelo) ven cada una el vínculo de la otra en su snapshot y la dejan huérfana. No es una inconsistencia: queda como antes de #31 y la
borra el próximo guardado que la quite. Es el mismo tipo de ventana que el riesgo aceptado en el plan. Se puede anotar en la cabecera de la
migración o dejarlo así.

## Evidencia
- `npm run test:db`: `All tests successful. Files=21, Tests=697`, `Result: PASS`. Incluye `etiquetas_huerfanas.test.sql` (36),
  `normativas.test.sql`, `talleres.test.sql`, `resolver_etiquetas.test.sql` y las guardias globales.
- `npm run lint`: exit 0, 4 warnings previos (AuthContext, ConfiguracionPage, TallerFormPage, DescargaModal), ninguno en archivos
  del cambio.
- `npm run typecheck`: sin errores.
- `npm test`: `Tests 1493 passed (1493)`.
- `npx vitest run src/features/normativas src/features/etiquetas`: `Test Files 6 passed (6)`, `Tests 67 passed (67)`.
