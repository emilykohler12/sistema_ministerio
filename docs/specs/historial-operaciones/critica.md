# Crítica de la spec — Historial de operaciones (#20)

Crítico, 2026-10-18. ADR leídos: 0005, 0012, 0013, 0024, 0027 (más el índice). No reabro las decisiones de la entrevista:
RPC definer para los emails, la entidad y el diff en el cliente, y offset de 50 con `count: 'exact'` e índices.
No corrí la base: el perfil del crítico no tiene `psql`. Lo que depende de PostgREST o de Postgres está marcado "a verificar".

## Veredicto
Hay mejoras

Si solo se cambia una cosa: definir qué muestra una "Modificación" cuyo único cambio es `updated_at`. Pasa en cada guardado de
taller que solo toca etiquetas o destinatarios, y en cada "Guardar" sin cambios.

## Puntos

1. **Diff vacío en el caso más común** (media). `guardar_taller` siempre hace el `UPDATE` del taller, aunque solo cambien las etiquetas
   o los destinatarios (`supabase/migrations/20261010155216_resolver_etiquetas.sql:88-94`). `tocar_updated_at()` cambia `updated_at`, así
   que `auditar()` registra una fila. Lo mismo pasa con "Guardar" sin cambios en categoría, establecimiento, normativa y configuración. El
   criterio 2 excluye `updated_at`, y el resultado es una fila "Modificación · Taller X" que se expande a una tabla vacía. El paso 2 de la
   verificación ("el diff muestra solo lo cambiado") va a pasar sin que nadie vea este caso.
   **Propuesta:** agregar al criterio 2 que, si `cambios(op)` queda vacío, el detalle diga "Sin cambios en los campos del registro" (o la
   fila no tenga botón de expandir), con su caso en `diff.test.ts`. Aclarar también de qué jsonb sale la descripción:
   `datos_nuevos ?? datos_anteriores`, porque en una baja solo existe el anterior. **Se gana** que el caso más frecuente no parezca un error.

2. **Una página fuera de rango da error, no vacío** (media, a verificar). Con `Prefer: count=exact`, si el offset supera el total, PostgREST
   responde `416` con `PGRST103` ("Requested range not satisfiable") y no un array vacío. Si no se pide el count, sí devuelve un array
   vacío. Entonces el criterio 5 ("página fuera de rango → estado vacío") cae en la rama "Reintentar", que falla igual cada vez. Pasa con
   un enlace copiado con `?pagina=9` o después de una purga futura.
   **Propuesta:** que `consultas.ts` traduzca `PGRST103` a `{ filas: [], total: null }` y que la página lo muestre como vacío, con
   "Limpiar filtros" o "Ir a la primera página". Con un test en `consultas.test.ts` que mockee ese error. **Se gana** que se cumpla el
   criterio 5 tal como está escrito.

3. **La lógica de fechas en hora de Argentina va a quedar en dos copias** (media). `filtros.ts` "con el patrón de `dashboard/periodo.ts`"
   necesita `hoyArgentina`, `esFechaReal`, `sumarDias` (el límite exclusivo `hasta + 1`) y `FECHA_MINIMA`. Hoy viven privados o exportados
   desde `src/features/dashboard/periodo.ts:14-61`. `.claude/rules/datos.md` prohíbe importar de otro dominio, así que la spec, como está,
   lleva a copiarlas. Además, la columna "fecha y hora (Argentina)" necesita un formateador con `timeZone`.
   `formatFechaDeTimestamp` (`src/shared/lib/date.ts:25`) usa la zona del navegador y no muestra la hora.
   **Propuesta:** mudar esos helpers a `src/shared/lib/date.ts`, con sus tests, y sumar `formatFechaHoraArgentina(ts)` con
   `Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle, timeStyle })`. El offset `-03:00` de los
   límites queda como una constante junto a `ZONA`, con un comentario: Argentina no tiene horario de verano desde 2009, pero el servidor
   (0024) usa la zona IANA. `periodo.ts` y `filtros.ts` importan de ahí. **Se gana** una sola copia de la lógica que, según los cortes
   anteriores, falla en silencio (un día corrido después de las 21:00).

4. **El mapa tabla → entidad no detecta tablas nuevas** (media). "Una tabla que no está en el mapa se muestra con su nombre físico"
   resuelve la lectura, pero no la deja filtrar. Nadie se entera de que falta agregarla, y van a venir tablas (#34, eventos de 0027,
   `taller_normativa`). **Propuesta:** tipar el mapa como
   `Record<Exclude<keyof Database['public']['Tables'], 'registro_operacion'>, Entidad>` con `satisfies`. Después de `npm run db:types`,
   una tabla nueva rompe el `typecheck`. El fallback al nombre físico queda solo para tablas que ya no existen en filas viejas. De paso,
   el selector puede omitir las entidades sin escritura posible desde el panel (Nivel, Localidad, Destinatario: solo SELECT, sembradas
   antes de crear sus triggers), que siempre van a dar vacío. **Se gana** que el olvido falle en el typecheck, con el mismo criterio de
   las guardias globales de 0013.

5. **Detalles de `usuarios_historial()` que van a fallar o quedar abiertos** (media).
   - `auth.users.email` es `varchar(255)`. En plpgsql, `return query` contra `returns table (email text)` da `42804` ("structure of query
     does not match"): hace falta `u.email::text`. Con `language sql`, en cambio, alcanza (y es lo más simple para un select).
   - "EXECUTE solo para `authenticated`" necesita `revoke execute ... from public, anon, service_role` explícito, porque Supabase da
     EXECUTE por defecto. 0027 pide además fijar en pgTAP, con `has_function_privilege`, que `es_admin()` se evalúa primero. Un `42501`
     para anon no distingue la falta de grant del chequeo interno.
   - El criterio 7 (baneado) no tiene test en la lista: falta un pgTAP que ponga `banned_until` en el futuro y compruebe que el email
     sigue saliendo.
   - `email` puede ser NULL en `auth.users` (cuentas por teléfono) y `db:types` lo va a tipar `string`. Basta con `coalesce` o con
     filtrarlo.
   **Se gana** un rojo inicial en el lugar correcto y no un error de tipos en el primer `select`.

6. **Parámetros de la URL sin sanear que terminan en el error de la consulta** (media). Si `?usuario=` no es un uuid ni `sistema`, `.eq('usuario_id', ...)`
   da `22P02` y la pantalla queda en "Reintentar" para siempre. Pasa lo mismo con `?pagina=0`, `-1` o `abc`, que generan un `.range`
   negativo, y con `?entidad=` desconocida. **Propuesta:** que el parser de `filtros.ts` descarte lo inválido (usuario que no matchea el
   regex de uuid → sin filtro, página que no es entero ≥ 1 → 1, entidad que no está en el mapa → sin filtro), igual que `periodoDesdeUrl`
   cae al valor por defecto, con un caso por parámetro en `filtros.test.ts`. **Se gana** que un enlace editado a mano nunca deje la
   pantalla trabada.

7. **La spec no lista los tests del frontend** (baja). Solo nombra el pgTAP. El núcleo de `consultas.ts` son filtros del query builder,
   así que, por `.claude/rules/datos.md`, lleva su `consultas.test.ts` con la cadena mockeada. Esos tests tienen que fijar: `.is('usuario_id', null)`
   para "Sistema" y no `.eq`, `.lt` con el día siguiente a `hasta`, y `.range((p-1)*50, p*50-1)` (inclusivo: el error típico es `p*50`).
   Por `.claude/rules/react.md`, la rama de error de `useUsuariosHistorial` (la tabla sigue y muestra el uuid corto) también necesita test.
   **Propuesta:** sumar a "Diseño" los tests `filtros`, `diff`, `entidades`, `consultas` y `HistorialPage` con los dos errores.
   **Se gana** que el implementador no los descubra en la revisión.

8. **Validaciones de fecha copiadas que acá no protegen nada** (baja). En el dashboard, `2020-01-01 ≤ desde` y `hasta ≤ hoy` existen
   porque la RPC devuelve `22023` (0024). Acá no hay RPC: un `hasta` futuro o un `desde` de 2019 dan la respuesta correcta, y quizás vacía.
   **Propuesta:** dejar en el criterio 4 solo `desde > hasta` (y la fecha mal formada), o justificar los otros dos topes como UX.
   **Se gana** menos ramas y tests, y que no aparezca un error que no explica nada.

9. **`Paginacion` es genérica** (baja). Ni "anterior / siguiente / página X de Y" ni su `aria` dependen del historial. Por `.claude/rules/react.md`
   ("si creás uno genérico, va ahí"), va en `src/shared/components/ui/Paginacion.tsx`. Además, el estado vacío ya existe en
   `ui/EmptyState.tsx`. **Se gana** que la próxima lista larga (padrón, usuarios) no la copie.

10. **`keepPreviousData` sin `isPlaceholderData`** (baja). Al pasar de página o de filtro, se ven las 50 filas anteriores bajo el número
    o el filtro nuevos, y una fila expandida sigue abierta con datos que ya no corresponden. **Propuesta:** usar el molde de `DashboardPage`
    (`actualizando={isPlaceholderData}`, `src/pages/admin/DashboardPage.tsx:112-132`): `aria-busy` y "Siguiente" deshabilitado mientras
    sea placeholder. **Se gana** no mostrar datos de otra vista como si fueran de esta.

11. **El paso 4 de la verificación no se puede hacer por la interfaz** (baja). `AuthContext` rechaza la cuenta sin la marca al iniciar
    sesión (`src/features/auth/AuthContext.tsx:57`), así que `sin-permiso@dam.local` nunca llega a `/admin/historial`. La RLS de
    `registro_operacion` ya tiene su test (`supabase/tests/registro_operacion.test.sql`). **Propuesta:** reescribir el paso como en
    `e2e/dashboard.spec.ts:200-212` (llamada REST con el token de esa cuenta: `[]` en `registro_operacion` y `42501` en la RPC), o sacarlo
    y dejarlo en el pgTAP. **Se gana** que la verificación describa algo ejecutable.

12. **La descripción de las puentes no le dice nada al admin** (baja). "Sus dos ids" (`taller_id 5 · etiqueta_id 12`) obliga a buscar qué
    es la etiqueta 12. La sincronización por diferencia ya evita el ruido (`resolver_etiquetas.sql:104-121`), así que hay pocas filas,
    pero cada una es opaca. **Propuesta:** aceptarlo a conciencia en "Fuera de alcance" ("las puentes se describen por ids; nombres con
    #34 o con una vista"). No vale resolverlo con cachés de otros dominios, porque rompería la regla de imports. **Se gana** que nadie lo
    reporte como bug en la revisión.

## Lo que está bien y no cambiaría
- **`order('id', desc)` y no `fecha_hora`:** las filas de un mismo `guardar_taller` comparten `fecha_hora` (`now()` es el inicio de la
  transacción). Ordenar solo por fecha haría inestable el offset entre páginas. El id es único y monótono.
- **Exposición de datos:** el admin ya tiene SELECT completo sobre `registro_operacion` y sobre `registro_descarga` (`cargo_otro`,
  `institucion_otra`). La pantalla no abre nada nuevo. La RPC expone solo `id` y `email`, y solo al admin.
- **Volumen y alcance:** las cargas masivas (padrón sin usuario, `vincular_institucion` con una fila por descarga) se pagan con el offset
  sin problema. Con el volumen esperado, `count: 'exact'` y los dos índices alcanzan. Migración chica, cuatro módulos puros, dos hooks y
  una página: entra en un corte, del tamaño del dashboard.

## Respuesta

1. **Acepto.** Si `cambios(op)` queda vacío, la fila dice "Sin cambios en los campos del registro" y no se expande. La descripción sale de
   `datos_nuevos ?? datos_anteriores`. Ambos casos llevan test en `diff.test.ts` y `entidades.test.ts`.
2. **Acepto.** `consultas.ts` traduce `PGRST103` a una página vacía con el total y lo fija con un test. El implementador lo verifica contra
   el PostgREST local.
3. **Acepto en parte.** Al aceptar el punto 8, el historial ya no necesita `hoyArgentina` ni `FECHA_MINIMA`, así que no se mudan los
   helpers del dashboard: ese refactor tocaría un dominio fuera del corte. Se suma a `src/shared/lib/date.ts` `formatFechaHoraArgentina`
   (`Intl` con `timeZone: 'America/Argentina/Buenos_Aires'`). Los límites del día (`<fecha>T00:00:00-03:00` y el día siguiente a `hasta`)
   quedan en `filtros.ts`, con la constante comentada (Argentina no usa horario de verano).
4. **Acepto.** El mapa se tipa con `Record<Exclude<keyof Tables, 'registro_operacion'>, Entidad>` y `satisfies`. El selector omite Nivel,
   Localidad y Destinatario, pero el mapa los conserva para describirlos.
5. **Acepto todo.** `language sql` con `email::text`, se filtran los emails nulos, `revoke` explícito de `public`, `anon` y `service_role`,
   `has_function_privilege` en el pgTAP y un caso con `banned_until` futuro.
6. **Acepto.** `filtros.ts` descarta un `usuario` que no es uuid ni `sistema`, una `entidad` desconocida y una `pagina` que no es un entero ≥ 1,
   con un caso por parámetro.
7. **Acepto.** Se listan en la spec.
8. **Acepto.** Solo se validan `desde > hasta` y una fecha mal formada. Los topes del dashboard protegen la RPC (`22023`); acá no protegen nada.
9. **Acepto.** `Paginacion` va en `src/shared/components/ui/` y el vacío usa `EmptyState`.
10. **Acepto.** Se usa el molde del dashboard con `isPlaceholderData` (`aria-busy` y deshabilitar la paginación) y se colapsa la fila
    expandida al cambiar de página o de filtros.
11. **Acepto.** El paso 4 pasa a ser la llamada REST, como en `e2e/dashboard.spec.ts`, y la cobertura queda en el pgTAP.
12. **Acepto.** Queda explícito en "Fuera de alcance".

## Crítica del código

Crítico, 2026-10-18. Una sola ronda. Leí la migración, el pgTAP, `src/features/historial/**`, `HistorialPage`, `Paginacion`, `date.ts`, el router,
el sidebar y `arquitectura.md`, y los comparé con el dashboard (`DashboardPage`, `SelectorPeriodo`, `periodo.ts`). No corrí la base.

### Veredicto
Hay mejoras

Si solo se cambia una cosa: que las fechas se apliquen con la espera de 300 ms y `replace`, como en el dashboard. Hoy cada tecla del año
consulta y agrega una entrada al historial del navegador.

### Puntos

1. **Las fechas se aplican en cada tecla y el `replace` nunca se usa** (media). `FiltrosHistorial` llama a `onCambiar` en cada `onChange` de
   los `type="date"` (`FiltrosHistorial.tsx:44,56`). Al escribir el año, el navegador emite fechas intermedias válidas (`0002-…`, `0020-…`,
   `0202-…`), y `fechaReal` las acepta (`filtros.ts:66-73`). Cada una hace una consulta con `count: 'exact'`, muestra un vacío fugaz ("No hay
   operaciones") y suma una entrada al historial: para volver, "Atrás" pasa por cada una. El desvío declarado ("replace solo en fechas") no
   está implementado: `aplicar(siguiente, reemplazar = false)` (`HistorialPage.tsx:52-53`) nunca recibe `true`, porque `cambiarFiltros`
   (`:54`) no lo pasa. El dashboard ya resolvió y documentó este caso (`SelectorPeriodo.tsx:14-15,29-44`: borrador local, 300 ms, `replace: true`
   en `DashboardPage.tsx:118`). Además, el marcado de los dos campos con `Label`, `Input`, `error` y `aria-describedby` es el mismo en los dos archivos.
   **Propuesta:** sacar a `src/shared/components/ui/RangoFechas.tsx` los dos campos con el borrador y la espera
   (`onCambiar({ desde, hasta })`, con strings que pueden ir vacíos y el error de quien la usa). `SelectorPeriodo` ignora los vacíos y el historial
   los toma como `null`. El historial llama a `aplicar(..., true)` desde ahí, y el resto de los filtros sigue con `push`. Si no se quiere
   tocar el dashboard en este corte, la alternativa es copiar el borrador y la espera en `FiltrosHistorial`, borrar el parámetro muerto y abrir
   un issue para unificarlos. **Se gana** una consulta por rango y no cuatro, un "Atrás" que vuelve a la vista anterior y una sola copia
   de una trampa que ya está documentada.

2. **La paginación pierde el foco del teclado en cada cambio de página** (media). `deshabilitado={isPlaceholderData}` (`HistorialPage.tsx:98`,
   `Paginacion.tsx:14,21`) deshabilita el botón que se acaba de presionar. Por la regla de *focus fixup* de HTML, el foco pasa al `body`, y quien
   navega con teclado tiene que volver a recorrer la página desde el principio (filtros, 50 filas con botón). Lo mismo pasa al llegar a la
   última página: "Siguiente" se deshabilita con el foco encima. Lo propuse yo en el punto 10 de la spec, y el molde del dashboard no
   deshabilita nada: solo usa `aria-busy` (`DashboardPage.tsx:50`). **Propuesta:** no deshabilitar mientras sea placeholder, porque un
   segundo clic solo cambia la clave y React Query cancela la anterior. Si se quiere evitar el doble avance, usar `aria-disabled` y no hacer
   nada en `onClick`, que deja el foco en su lugar. Al llegar los datos, mover el foco al total (`<p tabIndex={-1}>`) o subir al inicio de la
   tabla: hoy el botón está debajo de 50 filas y la página nueva empieza fuera de la vista. **Se gana** una paginación que se puede usar con
   teclado, sin más estado.

3. **La lógica de fechas quedó en dos copias igual** (baja, argumento nuevo sobre el punto 3). En la respuesta se decidió no mudar los helpers
   del dashboard porque el historial ya no necesitaba `hoyArgentina` ni `FECHA_MINIMA`. Pero sí necesitaba los otros, y salieron copiados:
   `fechaReal` (`filtros.ts:66-73`) es `aFecha` + `esFechaReal` (`periodo.ts:34-39,59-61`), con el mismo truco de `setUTCFullYear` y su mismo
   comentario; `aTimestamp` (`filtros.ts:85-90`) es `aIso` (`periodo.ts:41-46`) con un sufijo, y el `+1` de `limitesDelDia` es `sumarDias`.
   La zona también está dos veces (`date.ts` `ZONA_ARGENTINA` y `periodo.ts:18` `ZONA`). **Propuesta:** no bloquear el corte por esto y abrir
   un issue (0026): mover `esFechaReal`, `sumarDias` y la zona a `src/shared/lib/date.ts`, y que `periodo.ts` y `filtros.ts` los importen. Así
   `limitesDelDia` queda en dos líneas: `${desde}T00:00:00-03:00` y `${sumarDias(hasta, 1)}T00:00:00-03:00`. **Se gana** que el próximo
   filtro por fecha (usuarios, eventos de 0027) no haga la tercera copia.

4. **El uuid corto está armado en dos componentes** (baja). `LARGO_UUID_CORTO` y `id.slice(0, 8)` están en `FiltrosHistorial.tsx:10,70` y
   en `TablaHistorial.tsx:16,33`. El criterio 5 dice que, si fallan los usuarios, la lista muestra el uuid corto, y eso tiene que verse igual
   en el selector y en la tabla. **Propuesta:** una función pura `nombreDeUsuario(id, emails)` (`'Sistema'`, el email o el uuid corto) en un
   módulo del dominio (por ejemplo, junto a `describir`), que usen los dos componentes. Con esa función, `Usuario` y la opción de "fuera de lista"
   salen de una sola regla. **Se gana** un test puro en lugar de dos aserciones de render.

5. **El botón de la fila tiene el mismo nombre en las 50 filas, y cambia de texto además de `aria-expanded`** (baja).
   `TablaHistorial.tsx:77,87`: el nombre es "Ver cambios" u "Ocultar cambios" según el estado, y `aria-expanded` repite ese estado. Un
   lector de pantalla lo anuncia dos veces. En la lista de botones del lector, las 50 filas se llaman igual. **Propuesta:** un nombre fijo que
   identifique la fila ("Cambios de Taller X", con `describir(op)`) y que el estado lo dé solo `aria-expanded`. **Se gana** que se puedan
   distinguir las filas fuera del contexto de la tabla, sin estado nuevo.

6. **Una rama inalcanzable en el estado vacío** (baja). `filtros.pagina > 1 && (data.total === null || data.total > 0)`
   (`HistorialPage.tsx:77`): una página vacía con `total > 0` no puede llegar, porque si el offset queda dentro del total hay filas, y si
   no, PostgREST da `PGRST103`, que se traduce en `total: null`. **Propuesta:** decidir el texto solo por `filtros.pagina > 1`. **Se gana**
   una condición que se lee de un vistazo.

### Desvíos declarados
- **`usuarios_historial` en plpgsql:** correcto. El criterio 6 pide `42501`, y en una función `sql` el `es_admin()` solo podría filtrar
  (devolvería vacío, sin error). Va en línea con `metricas_registros`. Mi sugerencia de `language sql` en la spec no tenía en cuenta ese
  requisito. Seguridad de la RPC: bien. Es definer con `search_path` vacío, nombres calificados, `es_admin()` primero y `revoke` de `public`,
  `anon` y `service_role`, y el pgTAP verifica los tres con `has_function_privilege` y `proacl`. Expone solo `id` y `email`.
- **`renderPagina` con el caso vacío:** correcto. Espera lo que la pantalla muestra en cada caso y no oculta nada.
- **Valor `descarga` para `registro_descarga`:** correcto. El valor de la URL no depende del nombre físico, igual que `nivel`.
- **Opción con uuid corto para un usuario de la URL que no está en la lista:** correcto. Sin esa opción, el `<select>` controlado mostraría
  "Todos" mientras filtra. Ver el punto 4 para no duplicar el formato.
- **`replace` solo en fechas:** no está implementado (punto 1).

### Lo que está bien y no cambiaría
- La fila expandida atada a la clave de la URL (`HistorialPage.tsx:47-48`) se colapsa también con atrás y adelante, sin efecto ni estado copiado.
- El `satisfies Record<TablaAuditada, Entidad>` con las puentes que apuntan al mismo objeto, y `ENTIDADES_FILTRABLES` derivado del mapa.
- `consultas.ts` es delgado y cada filtro tiene su test de cadena. Los hooks son delgados y `enabled` repite la validación, así que el hook
  no depende de la página.
- `Paginacion`, `EmptyState`, `Select` e `Input` vienen de `ui/`, y `formatFechaHoraArgentina` usa `Intl` con zona fija.

### Respuesta (código)

1. **Acepto la alternativa.** `FiltrosHistorial` toma el borrador local y la espera de 300 ms de `SelectorPeriodo`, y las fechas se
   aplican con `replace`. Se quita el parámetro muerto. No toco el dashboard en este corte: la extracción a `ui/RangoFechas` va a un issue
   junto con el punto 3.
2. **Acepto.** La paginación no se deshabilita durante el placeholder (alcanza con `aria-busy`). Al llegar la página nueva, el foco va
   al total (`tabIndex={-1}`).
3. **Acepto como issue.** Mover `esFechaReal`, `sumarDias` y la zona a `shared/lib/date.ts` y unificar el rango de fechas toca el
   dashboard, que está fuera del corte.
4. **Acepto.** La función pura `nombreDeUsuario(id, emails)` va en el dominio, con su test.
5. **Acepto.** Nombre fijo con `describir(op)` y el estado solo en `aria-expanded`.
6. **Acepto.** El texto se elige solo por `filtros.pagina > 1`.

Hallazgos menores del revisor, también aceptados: el orden por email que el test no prueba, `pg_get_function_result`, el año `0000`
en `fechaReal` y la espera del error de usuarios en el test de la página.
