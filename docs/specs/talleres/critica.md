# Crítica de la spec: talleres

- **Fecha:** 2026-10-10 (spec en borrador)
- **Leído:** `spec.md`, `contexto.md`, la spec, las notas y la crítica de `niveles-categorias`, ADR 0007, 0012, 0013 y 0014,
  definición §5.1, §5.3, §8.3 y §8.4, las migraciones `base`, `guardias` y `niveles_categorias`, `auditoria_global.test.sql`,
  `niveles_categorias.test.sql`, `src/features/talleres/{consultas,errores,types}.ts` y `src/shared/lib/supabase.ts`.
- No corrí `test:db`: el perfil del crítico es de lectura. Lo que digo de Postgres y PostgREST sale de la documentación y del código.

## Veredicto
Hay mejoras. El diseño de base es sólido: RPC con `security invoker`, reglas en triggers, sincronización por diferencia, `for share`
y el cierre de `nivel_id`. Hay dos cosas que van a romper si se implementan tal como están escritas: el algoritmo de etiquetas de la RPC
y `filtrarTalleres` dentro de `consultas.ts`. Las otras son simplificaciones del mismo tipo que las que se aceptaron en el corte anterior.

---

## 1. `guardar_taller`: el paso de etiquetas no está especificado y la forma obvia de escribirlo falla (alta)
**Problema.** La spec dice "crea las etiquetas faltantes (`on conflict do nothing` sobre el índice normalizado)" y "sincroniza los puentes",
pero no dice cómo se obtienen los ids. Hay tres formas naturales de escribirlo, y las tres fallan:
- **Duplicados en la misma entrada.** El paso 2 de la verificación manda `['Redes', 'redés ']`. El `insert ... on conflict do nothing`
  aguanta los duplicados dentro del mismo comando (con `do nothing` la segunda fila se saltea). Pero si después los ids se buscan con un
  `join` entre `unnest(p_etiquetas)` y `etiqueta`, salen dos filas con el mismo id y el insert en `taller_etiqueta` da `23505` contra su PK.
  Se pierde todo el guardado, justo en el caso que el criterio 2 promete resolver.
- **Una sola sentencia con CTE.** Con `with ins as (insert ... on conflict do nothing returning id) select id from etiqueta where ...`,
  el `select` no ve las filas que acaba de insertar el CTE, porque todas las sub-sentencias comparten el snapshot. Las etiquetas nuevas
  quedan sin vincular y no hay ningún error.
- **Concurrencia.** Si otro admin crea la misma etiqueta al mismo tiempo, el `do nothing` espera su commit y saltea la fila. El id solo
  aparece si la búsqueda es **otra sentencia**, que en READ COMMITTED toma un snapshot nuevo.

Además, nada exige guardar el nombre recortado: el CHECK es `btrim(nombre) <> ''`, así que `'redés '` puede quedar guardado con el
espacio final.

**Por qué importa.** El criterio 1 promete atomicidad y el 2 promete que no haya duplicados. Las dos fallas posibles son un error en el
caso feliz o una pérdida silenciosa de etiquetas, y ninguna la detecta el typecheck.

**Recomendación.** Escribir el algoritmo en la spec, en tres sentencias:
1. Normalizar una sola vez: `select distinct on (clave) btrim(n) as nombre, clave from unnest(p_etiquetas) n, lateral (select lower(public.inmutable_unaccent(btrim(n))) as clave) k where btrim(n) <> ''`,
   guardado en un array o en una tabla temporal (`on commit drop`).
2. Insertar con `insert into public.etiqueta (nombre) select nombre from ... on conflict do nothing`. Sin target alcanza. Si quieren
   nombrar el índice, la inferencia acepta la expresión con doble paréntesis: `on conflict ((lower(public.inmutable_unaccent(btrim(nombre))))) do nothing`.
3. En una sentencia aparte, `select array_agg(e.id) ... where lower(public.inmutable_unaccent(btrim(e.nombre))) = any(claves)`, y
   `raise` si la cantidad de ids no coincide con la de claves. Así un id que falte es un error y no una etiqueta perdida.

Al pgTAP del criterio 8 le suma un caso: `guardar_taller` con `['Redes', 'redés ', ' REDES']` deja una etiqueta y una fila puente.

Sobre las alternativas del punto 1 del pedido:
- **Varias llamadas desde el cliente:** no son atómicas (criterio 1). Tampoco sirve el `upsert` de PostgREST, porque `on_conflict` acepta
  columnas y no el índice de expresión. La RPC es la única forma de hacer el alta de etiquetas sin escribir SQL en el cliente.
- **`security definer`:** obliga a repetir `es_admin()` adentro y saltea la RLS. `invoker` es mejor.
- **La RLS de `etiqueta` dentro de la RPC:** no es un problema. Solo el admin escribe, y el admin ve todas las etiquetas
  (`es_admin() or ...`), incluidas las que no usa ningún taller. Un usuario sin la marca recibe `42501` en el primer insert.

## 2. `filtrarTalleres` dentro de `consultas.ts` rompe el molde y los tests (alta)
**Problema.** El diseño pone la función pura `filtrarTalleres` en `consultas.ts` y su test en `consultas.test.ts`. Eso trae tres problemas:
- Importar `consultas.ts` carga `@/shared/lib/supabase`, que tira error si faltan las variables. Ese error es la señal acordada en
  auth-configuracion. El test de la función pura pasaría a necesitar un mock del cliente o `.env.local`.
- Los tests de hooks y pantallas usan `vi.mock('../consultas', () => ({ ... }))` con una factory. `useCatalogo` llama a `filtrarTalleres`,
  así que cada factory tiene que reimplementarla o hacer `importActual`, y `importActual` vuelve a cargar supabase. Es el mismo problema
  que tuvo `esAdmin` y que se resolvió sacando lo puro a otro módulo (`errores.ts` dice "módulo puro, sin imports").
- El catálogo público quedaría sin probar de verdad, porque el filtrado estaría mockeado.

**Recomendación.** Crear `src/features/talleres/filtrar.ts` (puro, sin imports de supabase) con `filtrarTalleres` y `normalizar`, y su test
`filtrar.test.ts`. `consultas.ts` queda solo con llamadas a supabase. Las factories de los tests no lo mencionan y el filtrado real corre
en los tests de `TalleresCatalogoPage`.

## 3. `useTaller(id)` sirve a dos pantallas con reglas opuestas (media)
**Problema.** `useTaller(id)` lee de `['talleres']`. Con sesión de admin, esa caché tiene borradores e inactivos. El formulario de edición
los necesita, pero el detalle público tiene que dar "no encontrado" si el taller no está publicado (criterio 6, "también con sesión de
admin"). La spec solo filtra publicados en `useCatalogo`, y nada dice que el detalle no use `useTaller`.

**Recomendación.** El detalle público, los similares y Home leen solo de `useCatalogo` (por ejemplo `useTallerPublicado(id)` =
`useCatalogo` + `find`). `useTaller` queda solo para el admin. El test del detalle tiene que incluir un caso con admin y un borrador.
Así la regla de visibilidad del portal (§8.4) vive en una sola función.

## 4. Destinatarios: constante como `NIVELES`, no hook (media)
**Problema.** `destinatario` tiene 5 filas fijas, ids explícitos, ninguna escritura desde la API, la gestión fuera de alcance, y el
criterio 8 ya pide un pgTAP con las filas exactas. Es exactamente el caso de `nivel_educativo`. Ahí se aceptó una constante con
`satisfies` en lugar de un hook, para no tener carga y error en cada pantalla. La spec suma `obtenerDestinatarios`, `useDestinatarios`,
la clave `['destinatarios']` y los estados de carga y error en `TallerFormPage` y `TallerFiltros`.

**Recomendación.** Usar `DESTINATARIOS = [...] as const satisfies readonly Destinatario[]` en `types.ts`, con `Destinatario = Tables<'destinatario'>`.
Para mostrar el nombre en la card y en la lista se usa el embed `destinatario(*)`, que ya trae los nombres. Si P-02 cambia la lista, el
cambio es una migración más la constante en el mismo PR, y el pgTAP de filas exactas falla si divergen. Se van una consulta, un hook,
sus tests y dos ramas de carga y error. Si algún día se gestionan desde el panel, el hook se agrega ese día.

## 5. `etiqueta`: select público y sugerencias derivadas (media)
**Problema.** La política de select `es_admin() or exists (taller_etiqueta visible)` encadena tres RLS (etiqueta → puente → taller) y
oculta muy poco: el nombre de una etiqueta que hoy solo usa un borrador. Además:
- El portal nunca lee `etiqueta` directo. Solo la ve por el embed, que ya pasa por las filas puente visibles. Con `using (true)` el portal
  no puede ver nada que hoy no vea.
- El corte de normativas va a tener que reescribir esta política para sumar "o la usa una normativa" (0007, etiquetas compartidas). Es
  una regla más que hay que recordar por corte, con su test.

**Recomendación.** `etiqueta_select_publico using (true)`. Las puentes pueden quedar en `using (exists (select 1 from public.taller t where t.id = taller_id))`
sin repetir `estado = 'PUBLICADO' or es_admin()`, porque la subconsulta ya pasa por la RLS de `taller`. Así la regla de visibilidad queda
escrita una sola vez. Si el equipo considera sensibles los nombres de etiquetas de borradores, la política actual sirve. Pero entonces
conviene anotar en Brechas que normativas la tiene que ampliar.

Opcional: las sugerencias del `TagInput` pueden salir de `['talleres']` (aplanar `etiqueta` de la caché del admin). Eso elimina
`obtenerEtiquetas`, `useEtiquetas`, la clave `['etiquetas']` y su invalidación, y además no sugiere huérfanas, que §8.4 manda borrar.
Cuando llegue normativas se vuelve a una consulta directa.

## 6. Regla 2: conviene que sea el espejo de la regla 1 (media-baja)
**Problema.** La regla 1 impide dar de baja una categoría con talleres en Borrador o Publicado. La regla 2 solo bloquea **Publicado**. El
resultado: en una categoría inactiva se puede crear un borrador o "reactivar" un taller (lo que lo pasa a Borrador). Al reactivar la
categoría, la regla 1 ya no protege nada de eso. No viola §8.4, que solo habla de publicados, pero la regla deja de ser un invariante.
Además, el `for share` solo se toma cuando `new.estado = 'PUBLICADO'`, así que las transiciones a Borrador no se serializan con una baja.

**Recomendación.** Que `taller_validar_categoria` falle con `DA002` si `new.estado <> 'INACTIVO'` y la categoría está inactiva, siempre con
`for share`. Queda un invariante de una línea: "una categoría inactiva solo tiene talleres inactivos". Implica §8.4, y Reactivar en una
categoría inactiva pide reactivar primero la categoría. El mensaje pasa a "La categoría está dada de baja: reactivala primero". Si
prefieren la versión de la spec, anoten en `notas.md` que los borradores en categorías inactivas son intencionales.

El `for share` está bien y alcanza, con READ COMMITTED y en las dos direcciones:
- **La baja llega primero.** El `select ... for share` del taller espera el commit y lee la versión nueva (`activo = false`), así que
  falla con `DA002`.
- **El taller llega primero.** El `update` de la categoría espera el lock antes de su trigger `before`. Después, el `count` del trigger
  (otra sentencia dentro de plpgsql) ve el taller ya confirmado, así que falla con `DA001`.

Dos cosas a tener en cuenta:
- `for share` exige privilegio UPDATE sobre alguna columna de `categoria` y que se cumpla el `using` de su política de update. El admin
  tiene las dos cosas gracias al `grant update (nombre, descripcion, activo)`. Conviene dejarlo comentado en la migración, para que nadie
  revoque todo el UPDATE más adelante.
- Los dos triggers corren como invoker, con la RLS del admin. Funciona porque solo el admin escribe.

## 7. Privilegios que la spec da por hechos (baja)
- **"Execute solo `authenticated`"** no sale solo. Postgres da EXECUTE a `PUBLIC`, y Supabase agrega `anon` por privilegios por defecto en
  `public`. Hace falta `revoke execute on function public.guardar_taller(...) from public, anon;` y un assert pgTAP (`function_privs_are`
  o `has_function_privilege`). Con invoker no es un agujero, pero el criterio lo afirma y hoy sería falso.
- **`revoke update on categoria from authenticated`** deja el UPDATE de tabla a `anon`. La RLS lo bloquea igual, pero hagan
  `from anon, authenticated` para que la regla "nadie cambia `nivel_id`" no dependa de la RLS. No rompe nada:
  - `CategoriaCambios` no incluye `nivel_id`.
  - PostgREST arma el `SET` solo con las claves del body.
  - `.select().single()` necesita SELECT, que sigue.
  - `tocar_updated_at` modifica `NEW` sin que se chequeen privilegios de columna.
  - Los updates del pgTAP existente (`descripcion`, `activo`, `nombre`) están dentro del grant.
- **SQLSTATE propios.** `DA001` y `DA002` son válidos (la clase `DA` no es estándar, y la clase `PT` sí la usa PostgREST para el status
  HTTP). PostgREST responde 400 y supabase-js entrega `{ code, message, details, hint }`. Ojo: es **`details`**, en plural.
  `esCategoriaConTalleres` tiene que leer `Number(error.details)`, y el test de `errores.ts` tiene que usar esa forma.
- **Índices por FK (molde del corte anterior).** `taller(categoria_id)` hace falta, porque la usa el `count` de la regla 1. También
  `taller_etiqueta(etiqueta_id)` y `taller_destinatario(destinatario_id)`, porque no son la primera columna de la PK. Los `taller_id` de
  las puentes no lo necesitan.

## 8. Tamaño del corte: un PR, dos fases (baja)
Es el corte más grande hasta ahora: enum, cinco tablas, RPC, dos triggers, cambio de privilegios, unas 10 pantallas y un pgTAP largo. No
lo partiría en dos PR. 0012 pide un dominio por PR, y el cambio de tipos rompe a la vez admin y portal, así que no se puede separar por
pantallas. Sí lo haría en dos fases dentro del mismo PR, como en supabase-base:
- **Fase A:** migración, pgTAP y `db:types`. Crítica de código en ese punto: es donde están los riesgos de los puntos 1, 6 y 7.
- **Fase B:** dominio y pantallas.

Los puntos 2, 4 y 5 achican la fase B.

## 9. Enum `estado_taller` (baja)
Está bien: con varchar y CHECK, `db:types` genera `string` y habría que escribir la unión a mano, contra 0012. Tres estados estables no
sufren la limitación del enum (no se pueden borrar valores). Lo que falta es el criterio. §8.3 también tiene `recurso.tipo` e
`institucion_tipo` como varchar, y §8.4 justifica el CHECK de `cargo`. Si el desvío queda solo en `notas.md`, cada corte lo vuelve a
discutir. Propongo anotar en §8.3 de la definición: "listas cerradas que el frontend usa como tipo → enum; listas con 'Otro' o que se
validan contra texto libre → CHECK".

## Lo que está bien
- **RPC `security invoker` con `search_path = ''`.** La RLS y `auth.uid()` siguen valiendo, y no hace falta un chequeo de rol propio.
  Sincronizar por diferencia evita inflar `registro_operacion`.
- **Reglas como triggers con SQLSTATE propio** en lugar de validar en el cliente. Las cumple cualquier camino de escritura (§9.1), y el
  `detail` con la cantidad es la forma correcta de pasar el dato.
- **Una clave `['talleres']` con `select` y filtrado en el cliente.** Es lo que dicen 0012, 0014 y §8.4: la caché se limpia al cambiar el
  usuario y el portal filtra solo por `estado`, con la corrección del punto 3. La regla 2 es la que garantiza que el embed
  `categoria(nivel_id)` nunca venga `null` para anon.
- **Cerrar `nivel_id` en este corte.** Cuesta dos líneas. Desde que existen los talleres, mover una categoría de nivel arrastra los
  talleres y, más adelante, las métricas por nivel.
- **`p_id` nulo = alta y `P0002` si el update no toca filas.** Es un contrato simple. `cambiarEstadoTaller` por separado también está
  bien: dar de baja no debería exigir mandar el taller completo.
- **Sin rutas de layout.** `:tallerId` aparece en una sola pantalla del admin (la edición), así que no aparece el tercer consumidor que
  justificaría reestructurar el router. Con `idDeRuta` + `useCategoriaDeRuta` + el chequeo "el taller es de la categoría" alcanza.
  Queda cerrada la evaluación pendiente de `niveles-categorias/notas.md`.
- **pgTAP de atomicidad.** Se puede provocar una falla a mitad con un destinatario inexistente (`23503` después del insert del taller)
  dentro de `throws_ok`, y después comprobar que no quedaron ni el taller ni las etiquetas nuevas.
- **Fuera de alcance bien recortado:** recursos, Storage, `normativa_etiqueta` y el borrado de huérfanas.

---

## Respuesta
1. **Acepto.** La spec fija el algoritmo en tres sentencias (normalizar sin duplicados con `btrim`, insertar con `on conflict do nothing`,
   buscar ids en otra sentencia con `raise` si falta alguno) y el caso pgTAP `['Redes', 'redés ', ' REDES']`.
2. **Acepto.** `filtrarTalleres` y `normalizar` van a `filtrar.ts` puro, con `filtrar.test.ts`.
3. **Acepto.** El portal (detalle, similares, Home) lee solo de `useCatalogo`; `useTallerPublicado(id)`. `useTaller` queda para el admin.
4. **Acepto.** `DESTINATARIOS` constante con `satisfies`, como `NIVELES`. P-02 se resuelve con migración + constante en el mismo PR.
5. **Acepto, también lo opcional.** `etiqueta` con select público; las puentes con `exists (taller t where t.id = taller_id)`.
   Las sugerencias salen de la caché `['talleres']` del admin; se van `obtenerEtiquetas`, `useEtiquetas` y `['etiquetas']`.
6. **Acepto.** Invariante "una categoría inactiva solo tiene talleres inactivos": `DA002` si `new.estado <> 'INACTIVO'`, siempre con `for share`,
   y el comentario sobre el grant por columna.
7. **Acepto.** `revoke execute ... from public, anon` con assert; `revoke update on categoria from anon, authenticated`; `details` (plural);
   índices `taller(categoria_id)`, `taller_etiqueta(etiqueta_id)`, `taller_destinatario(destinatario_id)`.
8. **Acepto.** Un PR, fase A (base, pgTAP, `db:types`) con crítica de código al cerrarla, y fase B (dominio y pantallas).
9. **Acepto.** El criterio enum vs. CHECK se anota en §8.3 de la definición durante la fase A.

---

## Crítica de código — fase A

- **Fecha:** 2026-10-10
- **Leído:** la migración `20261010034807_talleres.sql`, `talleres.test.sql`, el diff de `niveles_categorias.test.sql` y de
  `definicion-dam.md` §8.3, `notas.md` y el `guardar_taller` generado en `src/shared/types/database.ts`.
- **Corrido:** `npm run test:db` (11 archivos, 192 tests, PASS). Además probé casos borde de `guardar_taller` contra la base local,
  dentro de transacciones con rollback: destinatarios duplicados `{1,1}` (deja 1 fila), `null` en los dos arrays (vacía los puentes),
  una etiqueta de 101 caracteres (`22001`) y la edición sin marca de admin (`P0002`, porque la RLS filtra la fila). Después de las
  pruebas, `test:db` siguió en verde.

### Veredicto
Hay mejoras, todas chicas. La base cumple la spec y lo aceptado en la Respuesta: algoritmo de etiquetas en tres sentencias, puentes
sincronizados por diferencia, invariante espejo con `for share`, privilegios de EXECUTE y de columnas, e índices por FK. No encontré
fallas de seguridad. Lo único que rompe algo es el punto 1, y lo rompe en la fase B.

### 1. `p_id` sale como `number` en los tipos generados, así que el alta no tipa (media)
**Problema.** En `database.ts`, `guardar_taller.Args` tiene `"p_id": number`. `db:types` no marca nullable ningún argumento de una
función: solo los que tienen `default` salen opcionales. La spec define `TallerGuardado` como los args de la RPC, y supabase-js tipa
`.rpc('guardar_taller', args)` con ese `Args`. Entonces `p_id: null`, que es el contrato del alta, no pasa el typecheck. La fase B
terminaría con un cast o con un tipo escrito a mano, contra 0012.

**Recomendación.** Cambiar la firma ahora, que la migración todavía no se mergeó: mover `p_id int default null` al final de la lista
(los parámetros con default tienen que ir últimos) y actualizar la firma en el `revoke`/`grant` y en los tres asserts de privilegios
del pgTAP. PostgREST llama por nombre, así que el orden no importa. Después correr `db:types` y comprobar que sale `p_id?: number`. El
alta omite `p_id` y la edición lo manda. Es una línea de SQL y la fase B no necesita cast.

### 2. El pgTAP no prueba que se quiten etiquetas al editar (baja-media)
**Problema.** La edición pasa de `['Redes','redés ',' REDES']` a `['Redes','Nueva']`: solo agrega etiquetas. El `delete from taller_etiqueta ... <> all (v_ids)`
nunca borra nada en el test. Esa rama es justo la que puede fallar en silencio: si alguien saca el `coalesce(array_agg(e.id), '{}')` del
paso (c), con la lista vacía `<> all (null)` da `null`, no borra nada y todos los tests siguen verdes. Tampoco hay un caso que vacíe los
puentes (array vacío o `null`). Lo probé a mano y funciona, pero ningún test lo protege.

**Recomendación.** Agregar una edición más, por ejemplo con `array[2]::smallint[]` y `array[]::text[]`, y verificar 0 filas en
`taller_etiqueta` y solo `{2}` en `taller_destinatario`. Si además quieren el caso "quita una y deja otra", basta con editar a `['Nueva']`
antes del vaciado y verificar que queda solo `Nueva`.

### 3. Tres aserciones que no prueban lo que dicen (baja)
- **"Con el nombre recortado `'Redes'`" (línea 287):** el primer valor de la entrada ya es `'Redes'`, sin espacios. Si el paso (a) guardara
  `e.n` sin `btrim`, el test pasaría igual. Para que pruebe algo, el primero tiene que tener bordes, por ejemplo
  `array[' Redes ', 'redés', 'REDES']` → `'Redes'`.
- **"anon: SELECT en etiqueta es público" (línea 88):** `'Base'` la usa `T Pub`, que está publicado, así que la política vieja
  (`exists` puente visible) también daría 1. Para probar `using (true)` hace falta una etiqueta que use solo un borrador o que no use
  nadie (por ejemplo, insertar `'Huerfana'` en el setup y esperar 2).
- **"PUBLIC no tiene EXECUTE" (líneas 70-75):** sobra. `has_function_privilege('anon', ...)` ya incluye lo que se le da a PUBLIC: si
  PUBLIC conservara EXECUTE, el assert de anon fallaría. Se puede borrar el bloque con `aclexplode`, que es el más difícil de leer del
  archivo (plan 75).

Sobre la atomicidad: el test es correcto, pero lo que garantiza es semántica de Postgres (una llamada que falla no deja nada). Lo útil
es que el `23503` llega después del insert de etiquetas, y eso sí lo prueba al verificar `EtiquetaAtomica`. No hace falta cambiarlo.

### Lo que está bien
- **Algoritmo de etiquetas:** coincide con lo acordado. `distinct on` por clave con el primer valor según `ordinality`, insert sin target,
  búsqueda en otra sentencia y `raise` si las cardinalidades no coinciden. `v_nombres` y `v_claves` quedan alineados porque los dos
  `array_agg` usan `order by ord`. El largo de 100 lo controla el `varchar` (`22001`), sin código extra.
- **Sincronización por diferencia** con `on conflict do nothing`: tolera duplicados en la entrada y no reaudita filas existentes. El test
  que cuenta un solo DELETE auditado de destinatarios es la mejor aserción del archivo, porque prueba el "por diferencia" de verdad.
- **Triggers DA001/DA002:** el razonamiento sobre `for share` en las dos direcciones es correcto. Mover un taller fuera de una categoría
  que se está dando de baja también queda cubierto: la baja cuenta la versión vieja y falla del lado conservador. `when (old.activo and not new.activo)`
  evita el count en los demás updates. El `v_activo is false` delega en la FK y la RLS en lugar de duplicarlas. Los tests de DA002 corren
  como admin: si alguien revoca el grant por columna, el `for share` da `42501` en lugar de `DA002` y el test lo detecta. Eso protege
  el comentario de la migración.
- **RLS:** las cinco tablas siguen el molde. Los puentes heredan la visibilidad de `taller` con `exists`, `destinatario` no tiene
  escrituras y `etiqueta` es de lectura pública. Los `destinatario` se siembran antes de crear `destinatario_auditar`, así que no se
  auditan filas sin `sub`.
- **Privilegios de `categoria`:** el `revoke ... from anon, authenticated` con grant por columna, y el ajuste al test de
  `niveles_categorias` (anon pasa a `42501`) están bien explicados en `notas.md`.
- **Reglas que quedan en el formulario** (al menos un destinatario, hasta 20 etiquetas, nombre recortado) y no en la base: me parece
  razonable con un solo rol escritor, y quedó anotado. El `P0002` que recibe un usuario sin marca al editar (la RLS filtra la fila) no
  es un agujero: igual no escribe nada.
- **§8.3:** el criterio enum vs. CHECK quedó escrito donde lo va a leer el próximo corte.

---

## Crítica de código — fase B

- **Fecha:** 2026-10-10
- **Leído:** el diff de `src/` y los archivos nuevos (`filtrar.ts`, `useNombresInstitucionSugeridos.ts`, tests), `spec.md`, la
  Respuesta de la crítica de la spec y la sección fase B de `notas.md`, `useCategorias.ts`, `useCategoriaDeRuta.ts` y la sección
  `Constants` de `database.ts`.
- **Corrido:** `npx vitest run src/features/talleres src/pages/admin/talleres src/pages/public` (144 tests, PASS) y `npm run typecheck` (OK).

### Veredicto
Hay mejoras, todas chicas. La estructura es la que se acordó: una clave `['talleres']` con `select`; `consultas.ts` solo con supabase;
`filtrar.ts` y `errores.ts` puros; `DESTINATARIOS` como constante; sugerencias tomadas de la caché, y el portal leyendo solo de
`useCatalogo`/`useTallerPublicado`. No encontré fallas de visibilidad ni de invalidación. Lo que sigue es duplicación de textos y del
enum, y un caso de carga que da "no encontrado".

### 1. Los mensajes de DA001/DA002 están repartidos entre tres pantallas (media-baja)
**Problema.** `MENSAJE_CATEGORIA_INACTIVA` está copiado literal en `TallerFormPage` y en `TalleresListPage`. `CategoriasPage` arma el
texto de DA001 con su propio ternario singular/plural, aunque dos líneas más arriba ya define `pluralTalleres`. Cada pantalla repite
`esX(error) ? MENSAJE : GENERICO`.
**Impacto.** Cambiar la redacción obliga a tocar tres archivos y sus tests, y el próximo corte que dispare DA002 (recursos) va a copiar
la constante una vez más.
**Recomendación.** Agregar a `errores.ts` (sigue siendo puro) `mensajeDeError(error: unknown, generico: string): string`, que resuelva
DA001 (con la cantidad y el plural), DA002 y el genérico. Las tres pantallas pasan a una llamada y se van las dos constantes y el ternario.
Las pruebas de redacción quedan en `errores.test.ts`. `categoriaConTalleres` y `esCategoriaInactiva` pueden quedar como helpers internos.

### 2. El enum `estado_taller` está escrito tres veces en el frontend (baja)
**Problema.** La lista de estados aparece en `z.enum(['BORRADOR','PUBLICADO','INACTIVO'])` (formulario), en `ESTADOS_TALLER` + `estadoLabel`
(array, `find` y un `?? estado` que nunca se usa) y en `VARIANTE_ESTADO` (lista). El `satisfies` del array controla que los valores existan,
pero no que estén los tres: si la base suma un estado, nada falla.
**Impacto.** Hay tres lugares para sincronizar a mano, y el zod no sale de la base, contra 0012.
**Recomendación.** En `types.ts`, `ETIQUETA_ESTADO = { BORRADOR: 'Borrador', PUBLICADO: 'Publicado', INACTIVO: 'Inactivo' } as const satisfies Record<EstadoTaller, string>`
(el typecheck falla si falta uno). El schema usa `z.enum(Constants.public.Enums.estado_taller)`: `db:types` ya genera esa tupla
`as const`, y zod 4 la acepta. El `<select>` recorre esa misma tupla y la lista usa `ETIQUETA_ESTADO[t.estado]`. Se van
`ESTADOS_TALLER`, `estadoLabel` y la lista literal del zod, y un estado nuevo en la base rompe el typecheck en lugar de quedar sin etiqueta.

### 3. `isLoading` en el portal: sin red, el detalle dice "no encontrado" (baja)
**Problema.** En React Query 5.104, `isLoading` es `isPending && isFetching`. Si la primera carga queda en pausa por falta de red
(`fetchStatus: 'paused'`, el modo `online` es el default y no se cambió), `isLoading` es `false` y `data` es `undefined`.
`TallerDetallePage` llega a `!taller` y muestra "Taller no encontrado". `TalleresCatalogoPage` y `HomePage` no muestran nada (ni
skeleton ni vacío). `TallerFormPage` sí lo resuelve bien con `data === undefined`.
**Impacto.** El usuario del portal es una escuela, a veces con mala conexión. Un enlace compartido que dice "no encontrado" es peor que
un skeleton.
**Recomendación.** Usar `isPending` en lugar de `isLoading` en las tres pantallas del portal (es un cambio de una palabra), o seguir el
molde del formulario: `if (data === undefined)` → error o skeleton. Si quieren cubrirlo con un test, el detalle con `onlineManager.setOnline(false)`.

### Lo que está bien
- **Visibilidad del portal:** `soloPublicados` vive en un solo lugar y lo usan `useCatalogo` y `useTallerPublicado`. Home, catálogo,
  detalle y similares no tocan `useTalleres`/`useTaller` (verificado con grep), y el detalle tiene tests con borrador e inactivo.
- **Invalidación:** las dos mutaciones invalidan `['talleres']`, que es lo único que cambian. Ninguna toca `['categorias']` y no hace
  falta: `nivel_id` está cerrado en la base. El conteo de `CategoriasPage` sale de la misma caché, así que se actualiza solo.
- **Carga y "no encontrado" en el panel:** el formulario de edición muestra el form solo con el taller cargado y de esa categoría, y tiene
  rama de error. Se repite el molde que se aceptó en configuración y categorías, y no hay carga infinita.
- **`useTaller(number | null)`:** es razonable para no condicionar el hook. `null` comparte la caché y da `null`.
- **Búsqueda del panel con `filtrarTalleres`:** reutiliza la función pura en lugar de mantener un segundo filtro.
- **Componentes de `shared/ui`:** `ToggleGroup`, `TagInput`, `Select`, `ConfirmDialog`, `Badge`, `EmptyState` y `ErrorFallback`, sin
  componentes nuevos. `formatFechaDeTimestamp` está bien en `shared/lib/date.ts`.
- **`mostrarNivel`:** se sostiene por la razón de UX (en los similares el nivel es el mismo y sobra). Que además evite tocar un test no
  es un argumento: si algún día molesta, se saca la prop y el test busca dentro del encabezado. No lo cambiaría ahora.
- Menor, sin acción: el `sort` por `created_at` de `HomePage` repite el `order` de `obtenerTalleres` (los `filter` conservan el orden).
  Es inofensivo, pero alcanza con uno de los dos.
