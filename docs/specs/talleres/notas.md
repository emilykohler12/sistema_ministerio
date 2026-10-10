# Notas: talleres (fase A, base de datos)

Desvíos y decisiones de implementación de la migración `supabase/migrations/20261010034807_talleres.sql`.

## Desvíos respecto de la definición v2
- **`taller.estado` es el enum `estado_taller`**, no `varchar(20)` (§8.3). El criterio "lista cerrada usada como tipo → enum; lista con
  "Otro" o validada contra texto libre → CHECK" quedó anotado en §8.3 de `docs/definicion-dam.md`.
- **`registro_id` nulo en los puentes.** `taller_destinatario` y `taller_etiqueta` no tienen columna `id` (PK compuesta), así que
  `auditar()` guarda `registro_id = NULL`; la clave queda en `datos_nuevos` / `datos_anteriores` (`taller_id`).
- **`destinatario` y `etiqueta` sin timestamps** (como `nivel_educativo`): no hay escrituras desde la API que los justifiquen.

## Decisiones menores de la migración
- `guardar_taller` guarda `nombre` y `descripcion` tal como llegan (la normalización de bordes del nombre la hace el zod del formulario;
  el CHECK solo exige que no sea vacío). Tampoco exige "al menos un destinatario" ni limita a 20 etiquetas: son reglas del formulario
  (criterio 1), no de la base. Si se quieren en la base, es una migración aparte.
- `taller_validar_categoria` no decide cuando no ve la categoría (no existe o sin permiso): lo resuelven la FK (`23503`) y la RLS (`42501`).
- Los puentes usan `on conflict do nothing` al insertar: las filas que ya existían no se reinsertan ni se auditan.

## Ajustes a tests
- `supabase/tests/talleres.test.sql`: sin cambios.
- `supabase/tests/niveles_categorias.test.sql` (corte anterior): el `update public.categoria set descripcion = 'hack'` hecho como `anon` ya
  no afecta 0 filas, sino que da `42501` (permission denied), porque la migración hace `revoke update on categoria from anon, authenticated`
  (crítica punto 7). Se reemplazó por `throws_ok(..., '42501', ...)` y el plan pasó de 32 a 33. El caso authenticated sin marca no cambia
  (conserva el UPDATE por columna y la RLS le da 0 filas). La crítica había previsto los updates del admin, no este del anon.

## Ronda de correcciones (crítica de código, fase A)
1. **`p_id` al final con `default null`.** La firma de `guardar_taller` quedó `(p_categoria_id, p_nombre, p_descripcion, p_estado,
   p_destinatarios, p_etiquetas, p_id default null)`. `db:types` solo marca opcionales los argumentos con default, así que ahora genera
   `p_id?: number` y el alta (que lo omite) tipa sin cast. Se editó la migración directamente (no estaba commiteada); se actualizaron
   `revoke`/`grant`, los asserts de EXECUTE, las llamadas del pgTAP (ahora con `p_id` al final) y la firma en `spec.md`.
2. **Ediciones que quitan elementos** (`talleres.test.sql`): un taller aparte, 'Para vaciar', se crea con 2 etiquetas y 2 destinatarios,
   se edita quitando una de cada una (se verifica que se borra la fila puente y queda la otra) y luego con `array[]::text[]` y
   `array[]::smallint[]` (0 filas puente en ambos; la RPC admite destinatarios vacíos). Es un taller aparte para no alterar los conteos
   de auditoría de 'Con redes'. +7 tests.
3. **Aserciones fortalecidas.** El alta con etiquetas ahora es `[' Redes ', 'redés', 'REDES']` (el primer valor trae bordes, así que
   prueba el recorte). Para la lectura pública de `etiqueta` se agregó 'SoloBorrador', usada solo por 'T Bor': anon debe ver 2 etiquetas
   (admin pasa a ver 3 filas en `taller_etiqueta`). Se quitó el assert de PUBLIC con `aclexplode` (redundante con el de `anon`, −1 test).
   Plan de `talleres.test.sql`: 76 → 82.

# Notas: talleres (fase B, dominio y pantallas)

Desvíos y decisiones de implementación. Los tests de la fase A (Vitest) no se modificaron.

## Desvíos y decisiones
- **Mensaje de `DA001` con singular/plural** (decisión del agente principal): "No se puede dar de baja: tiene 1 taller en borrador o
  publicado" / "tiene N talleres en borrador o publicados". Por coherencia, la tarjeta de categoría también dice "1 taller".
- **`categoriaConTalleres` devuelve `null` si `details` no es un entero** (por ejemplo un `DA001` sin `details`): la pantalla cae al mensaje
  genérico en lugar de mostrar "NaN".
- **Similares del detalle sin el nivel.** `TallerCard` tiene la prop opcional `mostrarNivel` (por defecto `true`); el detalle la apaga en
  "Talleres similares". Motivos: los similares son de la misma categoría, así que el nivel es el mismo que el del taller que se está
  viendo (redundante), y `TallerDetallePage.test.tsx` busca `getByText(/secundario/i)`, que con el nivel en las tarjetas daría varios
  elementos. No hace falta tocar el test.
- **`useTaller` y `useTallerPublicado` aceptan `number | null`** (superconjunto de lo pedido): `null` es un id de URL inválido y da `null`
  de datos (la pantalla muestra "no encontrado"). El formulario en modo alta llama a `useTaller(null)` solo para no condicionar el hook.
- **Búsqueda del panel en el cliente.** La lista de talleres de la categoría sigue teniendo el buscador; filtra con `filtrarTalleres`
  sobre la lista ya cargada (nombre, descripción y etiquetas, sin tildes). El hook `useTalleres(categoriaId?)` ya no recibe búsqueda.
- **Fecha de "Última modificación".** `formatFechaCorta` espera `YYYY-MM-DD`; se agregó `formatFechaDeTimestamp` en `shared/lib/date.ts`
  para el `updated_at` (timestamptz). `formatFecha` y `formatFechaCorta` quedan en `shared` sin consumidores en talleres.
- **`ESTADOS_TALLER` y `estadoLabel`** en `types.ts` (no estaban en la spec): etiquetas en español de los tres estados, compartidas por
  el select del formulario y la lista del panel.
- **`TallerCard` ya no tiene la variante "Descargar"**: `linkTo` es obligatorio. Se quitó la fecha y el tipo de recurso.
- **Detalle**: se conserva el botón "Compartir" (sin acción, como antes); se quitaron la vista previa y el `DescargaModal`.
  `DescargaModal` queda sin consumidor hasta el corte de recursos/descargas. Mensaje de error de carga: "No pudimos cargar este taller."
- **`useNombresInstitucionSugeridos`** se movió a `src/features/descargas/useNombresInstitucionSugeridos.ts` (sigue siendo un stub `[]`).
- **Validación del embed**: se comprobó contra la base local que `select('*, categoria(nivel_id), destinatario(*), etiqueta(*)')`
  responde 200 por PostgREST (sin ambigüedad de relaciones) y que el tipo inferido por supabase-js coincide con `Taller` sin cast.
- **Home**: ordena en el cliente por `created_at` descendente y toma 6 publicados (3 destacados + 3 en "Talleres"); la consulta también
  ordena por `created_at desc`.

## Criterio 8 (verificado con grep)
En `src/features/talleres`, `src/pages/admin/talleres` y las páginas públicas de talleres no quedan `talleres.mock`, `RecursoArchivo`,
`TipoRecurso`, `destinatarioLabel`, `titulo`, `fecha`, `responsable` ni `descargas` (la única coincidencia de `.titulo` es
`Normativa.titulo` en `HomePage`).

## Pendiente de verificación manual (verificación de punta a punta de la spec)
No se levantó la app contra Supabase en esta fase: los pasos 2 a 4 de "Verificación de punta a punta" (crear/publicar/dar de baja con
sesión de admin) quedan para quien revise el PR.

## Ronda de correcciones (crítica de código fase B y revisión)
1. **`db:reset` previo**: el revisor había dejado datos de prueba en la base local; se reinició antes de correr `test:db`.
2. **`errores.ts`**: nueva `mensajeDeError(error, generico)` (DA001 en singular/plural, DA002, o el genérico). La usan `TallerFormPage`,
   `TalleresListPage` y `CategoriasPage`; se quitaron `MENSAJE_CATEGORIA_INACTIVA` y el singular/plural propio de `CategoriasPage`.
   `categoriaConTalleres` ahora exige que `details` sea un string con un entero positivo (`null`, `''`, `'abc'`, `'0'`, `'1.5'`... dan
   `null`; antes `Number(null)` daba 0). Se agregaron tests a `errores.test.ts` (el caso de `details` inválido y `mensajeDeError`).
3. **Estados**: `ETIQUETA_ESTADO` (`satisfies Record<EstadoTaller, string>`) reemplaza a `ESTADOS_TALLER` y `estadoLabel`. El formulario usa
   `z.enum(Constants.public.Enums.estado_taller)` y arma el select con esos valores; `VARIANTE_ESTADO` de la lista ya usaba el mismo patrón.
4. **Portal**: `TallerDetallePage`, `TalleresCatalogoPage` y `HomePage` usan `isPending` en lugar de `isLoading` para los talleres, así una
   query en pausa no muestra "no encontrado" ni el estado vacío.
5. **`CategoriasPage`**: si falla la carga de talleres muestra un error con "Reintentar" y no muestra el conteo (ni "0 talleres" mientras
   carga). Test nuevo en `CategoriasPage.test.tsx`.
6. **Migración** (no commiteada, editada): `revoke execute ... from public, anon, authenticated, service_role` de
   `taller_validar_categoria()` y `categoria_validar_baja()`, como `auditar()` y `tocar_updated_at()`. `talleres.test.sql` suma un assert
   (`is_empty` sobre `has_function_privilege`); el plan pasa de 82 a 83.

## Verificación manual
Pasos 2 a 4 de la spec: Joa Sanchez los confirmó el 2026-10-10 con `npm run dev` y Supabase local, sin detallar cada resultado.
