# Crítica de la spec — instituciones sin vincular

## Veredicto
Hay mejoras

Si solo se cambia una cosa: `useFocusTrap` vuelve a correr cada vez que cambia `onClose`. Con el `Buscador` dentro del `Dialog`, el foco
salta a la "X" en cada tecla. Hay que guardar `onClose` en un ref.

Las tres decisiones propuestas están bien:
- **(a) conservar `OTRA`:** pasar a `PADRON` obliga a borrar el texto (CHECK) y contradice 0010.
- **(b) misma localidad:** sin esa regla, `metricas_por_localidad` atribuye las descargas a una localidad y los alcanzados a otra.
- **(c) dos llamadas:** el estado intermedio (un establecimiento creado y un grupo sin vincular) es válido y no hay nada que compensar.

Tampoco hace falta cambiar la clave: la pantalla manda el texto crudo y la RPC lo normaliza. Como `lower(unaccent(btrim(x)))` es
idempotente, también funcionaría con el texto ya normalizado. Los puntos de abajo son lo que el diseño todavía no resuelve.

## Puntos

### 1. El `Dialog` con un `Buscador` pierde el foco en cada render (alta)
`useFocusTrap(ref, open, onClose)` depende de `[active, ref, onClose]`. Las páginas pasan `onClose={() => setX(null)}`, que es una función
nueva en cada render. Cada render de la página dispara la limpieza, que devuelve el foco al botón de la fila, y vuelve a correr el efecto,
que enfoca el primer elemento enfocable del contenedor: la "X" de cerrar.

Hasta ahora no se notó por dos razones. Los diálogos con formulario (`DialogoRecurso`, `DescargaModal`) guardan el estado en un hijo, así
que escribir no re-renderiza al `Dialog`. Los demás son `ConfirmDialog`, sin campos. Esta spec, en cambio, pone un `Buscador` controlado en
el diálogo "Vincular". Si el texto de búsqueda vive en `SinVincularPage`, cada tecla manda el foco a la "X". Lo mismo pasa sin escribir:
con `isPending` de `useVincular` en la página, o con el refetch de `useSinVincular` al volver el foco a la ventana.

- **Alternativa:** en `src/shared/hooks/useFocusTrap.ts`, guardar `onClose` en un `useRef` actualizado en cada render, dejar `[active]`
  como deps y llamar a `onCloseRef.current()` en el Escape. Sumar un test del hook: re-renderizar con un `onClose` nuevo no mueve el foco.
- **Qué se gana:** se arregla en un solo lugar y para todos los diálogos, presentes y futuros, sin depender de dónde viva el estado.
  Mientras tanto, la spec tendría que exigir el molde de `DialogoRecurso`: estado y mutación en un hijo del `Dialog`.

### 2. Con el grant por columna, el admin puede saltear `DA005` (media)
`grant update (establecimiento_id)` + una política de UPDATE para el admin abren
`supabase.from('registro_descarga').update({ establecimiento_id })` desde la API, que no pasa por las validaciones de la RPC:
- vincular a un establecimiento inactivo o de otra localidad (justo lo que la decisión (b) quiere impedir);
- cambiar el establecimiento de una fila `PADRON` y romper el invariante que `registrar_descarga` sostiene con `DA004`;
- desvincular una `OTRA` poniendo `null`, que la spec deja fuera de alcance.

En este proyecto, cuando una RPC invoker convive con un grant, el invariante vive en la tabla: `DA001`/`DA002` son triggers, y los CHECK y
los índices únicos también están en la tabla. Acá vive solo en la RPC.

- **Alternativa (recomendada):** `vincular_institucion` como `security definer`, con `set search_path = ''`, el chequeo `es_admin()` →
  `42501` al principio, `revoke execute from public, anon` y `grant execute to authenticated`. Sin grant de UPDATE y sin política nueva. Es
  el molde de 0017 y 0022: la columna cambia solo por la RPC. `auditar()` sigue registrando al admin, porque `auth.uid()` lee el GUC del
  JWT, igual que `es_admin()` dentro de un definer (ya verificado en `no-contar-descargas-admin`).
- **Otra opción:** mantener invoker y llevar `DA005` a un trigger `before update of establecimiento_id`. Es más código para el mismo
  resultado.
- **Qué se gana:** dos piezas menos en la migración (grant y política) y sus tests. El criterio 6 queda en "todo UPDATE directo sigue en
  `42501`": los asserts actuales de `descargas.test.sql` (487-489 y 520-522) siguen valiendo y solo cambia el comentario "hasta la
  vinculacion". Se agrega un `throws_ok` del admin con `update ... set establecimiento_id`.

### 3. `variantes` puede llegar `null` aunque el tipo diga `string[]` (media)
`db:types` tipa no nulas todas las columnas de `RETURNS TABLE` (ya pasó con `ruta_anterior` en normativas). Si `variantes` se arma con
`array_agg(...) filter (where institucion_otra <> nombre)`, un grupo con una sola forma escrita (el caso más común) devuelve `NULL`.
Entonces `grupo.variantes.length` o `.join(', ')` revientan en la pantalla.

- **Alternativa:** escribir en la spec `coalesce(array_agg(distinct ...) filter (...), '{}')` y pedir un pgTAP con un grupo de una sola
  variante que espere `'{}'`.
- **Qué se gana:** un crash del caso más frecuente que ni el typecheck ni un test con mocks detectan.

### 4. "Crear establecimiento" puede quedar sin salida (media)
Hay dos casos que la spec deja abiertos:
- **El nombre choca con un establecimiento inactivo** (el índice incluye los inactivos). El duplicado es, por construcción, el mismo
  `(localidad, nombre normalizado)` del grupo. No se puede crear (`23505`) ni vincular, porque está inactivo (`DA005`). El mensaje de
  siempre ("puede estar dado de baja") no dice qué hacer, y hay que ir al padrón a reactivarlo.
- **Falla la segunda llamada** (vincular) después de crear. Si el diálogo queda abierto y el admin vuelve a guardar, el `23505` sale
  contra el establecimiento que acaba de crear.
- **Alternativa:**
  - El diálogo guarda el id creado (`onSuccess` de la creación). Si después falla la vinculación, "Reintentar" llama solo a `useVincular`
    con ese id, sin volver a crear.
  - Con `esNombreDuplicado`, el mensaje del diálogo dice que el establecimiento ya existe en la localidad. Si es activo, el admin lo
    vincula con "Vincular". Si está dado de baja, ofrece un enlace a `/admin/establecimientos/:id/editar` para reactivarlo, o como mínimo lo
    explica.
- **Qué se gana:** el flujo (c) de dos llamadas queda completo. Hoy la spec afirma que "el grupo sigue en la lista, sin nada que
  compensar", y es cierto en la base, pero en la UI el reintento natural falla.

### 5. El formulario "Crear" duplica el esquema y los mensajes de `EstablecimientoFormPage` (media)
El zod (nombre ≤ 200 con `trim`; CUE vacío → `null`, solo dígitos, ≤ 20) y `MENSAJE_NOMBRE_DUPLICADO` / `MENSAJE_CUE_DUPLICADO` viven
dentro de `EstablecimientoFormPage.tsx`. Un segundo formulario en el `Dialog` los copiaría.

- **Alternativa:** mover el esquema a `src/features/establecimientos/esquema.ts` (puro, molde `descargas/esquema.ts`) y los mensajes a
  `errores.ts` (regla de `react.md`). El diálogo usa `esquema.omit({ localidad_id: true })` y la localidad fija.
- **Qué se gana:** una sola fuente de los límites espejo de la base. Si cambia el `varchar` o el CHECK del CUE, no hay que tocar dos
  formularios.

### 6. Invalidar también cuando la vinculación falla (baja)
La spec invalida en el éxito. Pero el criterio 5 ("Ya estaba vinculado", 0 filas, que no es un error) y `DA005` (el establecimiento se dio
de baja en otra pestaña) prometen refrescar la pantalla. `.claude/rules/datos.md` lo pide así: si el mensaje promete recargar, el hook
invalida en `onSettled`.

- **Alternativa:** `useVincular` invalida `['establecimientos']` (el prefijo ya cubre `'sin-vincular'` y la lista de la localidad) y
  `['dashboard']` en `onSettled`.
- **Qué se gana:** después de un `DA005`, el diálogo deja de ofrecer el establecimiento inactivo.

`useCrearEstablecimiento` ya invalida `['establecimientos']`, así que entre las dos llamadas la lista se recarga una vez de más. Es
inofensivo y no vale una clave aparte.

### 7. El diálogo "Vincular" muestra los inactivos y su consulta no tiene rama de error (baja)
`useEstablecimientos(localidadId)` devuelve también los inactivos cuando consulta el admin. Si la pantalla no los filtra, ofrece opciones
que la base rechaza con `DA005`. Además, la consulta secundaria del diálogo necesita su rama de error con su test (regla de `react.md`): un
error no puede verse como "sin establecimientos".

- **Alternativa:** escribir en la spec `filter((e) => e.activo)` y el estado de error del diálogo.
- **Qué se gana:** se evitan un rechazo evitable y un estado vacío falso.

### 8. Accesibilidad de la selección y del foco después de vincular (baja)
- **Selección:** la spec dice "lista de los establecimientos". Si son `<li>` o botones clicables, la elección no se anuncia. El molde es un
  `fieldset` con `legend` y `input type="radio"` (navegable con flechas), y "Vincular" en un botón aparte, deshabilitado sin elección y con
  `isPending`. El botón deshabilitado evita además el doble clic, que hoy daría un falso "Ya estaba vinculado".
- **Foco al cerrar:** `useFocusTrap` devuelve el foco al botón de la fila, pero la fila desaparece al vincular y el foco cae en `body`.
  Hay que enfocar algo estable, como el título de la pantalla o la fila siguiente.
- **Mensaje de resultado:** "Ya estaba vinculado" y el de éxito van en un `role="status"` fuera del diálogo, porque el diálogo ya se cerró.
- **Ids del `Dialog`:** son fijos (`dialog-title`). No se puede abrir "Crear" desde dentro de "Vincular": tienen que ser dos diálogos
  hermanos, nunca uno anidado en el otro.

### 9. "Alcanzados +1" depende del período (baja)
`metricas_resumen.establecimientos_alcanzados` se calcula en el período y `sin_vincular` sobre todo el historial. Si se vincula un grupo
cuyas descargas son anteriores al período elegido, `sin_vincular` baja pero los alcanzados no suben.

- **Alternativa:** el criterio 2 dice "alcanzados +1 si era nuevo y sus descargas caen en el período". La verificación de punta a punta ya
  cumple esa condición, porque las descargas son de hoy.
- **Qué se gana:** se evita un test o una validación manual que "falla" sin bug.

### 10. Orden y "nombre más frecuente" sin desempate (baja)
"Nombre más frecuente" y "ordenada por descargas desc" no dicen qué pasa en un empate. Con "Escuela 123" ×1 y "escuela 123" ×1, el
nombre (que además prellena "Crear") y el orden de las filas cambian entre corridas, y los pgTAP y los e2e se vuelven intermitentes.

- **Alternativa:** desempatar el nombre por `max(fecha_hora) desc, institucion_otra`, y las filas por `descargas desc, ultima desc,
  localidad_id, nombre`.
- **Qué se gana:** resultados deterministas y tests estables.

### 11. Opciones del filtro por localidad (baja)
Si el filtro usa `useLocalidades`, suma una consulta secundaria con su rama de error y muestra 79 opciones, aunque casi todas estén vacías.

- **Alternativa:** armar las opciones con las localidades distintas de los grupos ya cargados (la RPC ya devuelve `localidad`) y filtrar en
  el cliente, sin parámetro en la RPC.
- **Qué se gana:** una consulta, una rama de error y un test menos. Además, solo aparecen las localidades que tienen algo para vincular.

### 12. Validación del establecimiento sin bloqueo (baja)
Si otra pestaña da de baja el establecimiento entre el chequeo `DA005` y el UPDATE, quedan descargas vinculadas a un inactivo. Si la RPC
pasa a definer (punto 2), `select ... from establecimiento ... for share` lo cierra sin costo, porque el dueño tiene UPDATE y bypassrls (en
invoker, `for share` exige el grant y la política de UPDATE de `establecimiento`). El resto de la concurrencia está bien resuelto:
`where establecimiento_id is null` se vuelve a evaluar después del lock en READ COMMITTED, así que dos admins nunca se pisan una fila, y el
"0 filas" del criterio 5 es correcto.

## Respuesta

1. **Acepto.** Lo verifiqué: `useFocusTrap.ts` tiene `[active, ref, onClose]` como deps. `onClose` pasa a un ref, el efecto queda con `[active, ref]` y se agrega `useFocusTrap.test.ts`. Es un archivo compartido fuera del dominio, pero es un bug que esta pantalla haría visible y el arreglo es chico, así que entra al corte (se lo aviso al usuario).
2. **Acepto.** `vincular_institucion` pasa a ser **security definer** y empieza con `es_admin()` → `42501`. No hay grant de UPDATE ni política, que es el molde de 0017 y 0022. Así la única forma de escribir es la RPC con `DA005`, y los asserts de 42501 de `descargas.test.sql` siguen valiendo. `instituciones_sin_vincular` queda invoker, porque solo lee y la RLS de select ya exige el admin.
3. **Acepto.** `coalesce(array_agg(...) filter (...), '{}')`, más un pgTAP con un grupo de una sola forma escrita.
4. **Acepto.** Si la vinculación falla después de crear, el diálogo guarda el id creado y "Reintentar" solo vincula. Con un 23505 de nombre, el mensaje guía a "Vincular" y, si el que coincide está inactivo, a reactivarlo desde Establecimientos.
5. **Acepto.** El zod y los mensajes pasan a `features/establecimientos/esquema.ts`, y `EstablecimientoFormPage` los importa.
6. **Acepto.** `useVincular` invalida en `onSettled`.
7. **Acepto.** El diálogo filtra `activo` y tiene rama de error con reintentar.
8. **Acepto.** Radios en un `fieldset`, botón deshabilitado mientras guarda, resultado en un `role="status"` de la página, foco al encabezado de la tabla después de vincular y los diálogos como hermanos.
9. **Acepto.** El criterio 2 aclara "en el período que incluye esas descargas".
10. **Acepto.** El nombre más frecuente desempata por la forma más reciente; las filas desempatan por localidad y nombre.
11. **Acepto.** Las opciones del filtro salen de los grupos cargados.
12. **Acepto.** Va `for share` sobre el establecimiento dentro de la RPC definer.

# Crítica del código

## Veredicto
Hay mejoras

Si solo se cambia una cosa: que los diálogos no se puedan cerrar mientras guardan. Si se cierran, el resultado de la mutación llega a
una página que ya pasó a otra cosa.

La estructura está bien y cumple las respuestas de arriba:
- **Base:** la RPC definer no tiene grant ni política, `for share` bloquea el establecimiento y `coalesce` cubre `variantes`.
- **Estado de los diálogos:** son dos `Dialog` hermanos, montados solo mientras están abiertos, y cada uno guarda su estado (por eso el
  arreglo de `useFocusTrap` no depende de dónde viva el estado).
- **Dominio:** `esquema.ts` es compartido, `onSettled` invalida el prefijo `['establecimientos']` y las opciones del filtro salen de los
  grupos cargados.

Los puntos de abajo son de forma más simple y de estados de la UI.

## Puntos

### 1. Los diálogos se pueden cerrar mientras guardan (media)
"Cancelar", la "X", Escape y el fondo siguen activos con `vincular.isPending` (y con `isSubmitting` en "Crear"). `mutateAsync` no se
cancela al desmontar, así que la promesa sigue y llama a `onVinculado` de un diálogo que ya se cerró:
- `terminar` hace `setDialogo(null)`. Si el admin abrió otro diálogo mientras tanto, lo cierra. Además mueve el foco al título.
- Si la llamada falla, el error no se ve en ningún lado, porque el `FieldError` vivía en el diálogo desmontado.
- En `DialogoCrear`, cerrar mientras se crea no corta la cadena: `onSubmit` sigue y vincula igual.

- **Alternativa:** mientras está ocupado, el diálogo no se cierra. En los dos diálogos, `onClose={ocupado ? () => {} : onClose}` para el
  `Dialog` y `disabled={ocupado}` en "Cancelar". `Dialog` no cambia.
- **Qué se gana:** un solo flujo posible (abrir → guardar → resultado), sin resultados que llegan a destiempo ni errores invisibles.

### 2. `DialogoCrear` copia en `useState` lo que ya tienen las mutaciones (media)
Hay tres estados derivables:
- `creado` es `crear.data`;
- `falloVinculacion` es `vincular.isError`;
- `errorGenerico` es `crear.isError` cuando el error no es un duplicado de nombre ni de CUE.

Cada diálogo se monta al abrirse, así que el estado de las mutaciones ya arranca limpio. Además, después de un fallo de la vinculación
quedan dos botones que hacen lo mismo: "Reintentar" y el submit "Crear y vincular", que con `creado` ya no crea (la rama
`if (creado) return vincularCon(creado)`). `DialogoVincular`, en cambio, ya lee `vincular.isError`.

- **Alternativa:** derivar los tres valores de `crear` y `vincular`. `onSubmit` solo crea y después vincula. Con `crear.data` definido,
  el pie del formulario muestra solo el bloque de "Reintentar" (o el submit pasa a "Reintentar vinculación"), no los dos.
- **Qué se gana:** se eliminan tres `useState` que hay que mantener sincronizados a mano y la rama muerta de `onSubmit`. Queda un solo
  camino de reintento, con un texto que dice lo que hace, y los dos diálogos siguen el mismo patrón.

### 3. `mutateAsync` con un `catch {}` vacío en `DialogoVincular` (baja)
`confirmar` envuelve `mutateAsync` en un `try` cuyo `catch` no hace nada, solo para que la promesa rechazada no quede sin manejar. El
error ya se muestra con `vincular.error`.

- **Alternativa:** `vincular.mutate(vars, { onSuccess: (cantidad) => onVinculado(cantidad, elegido) })`, como en
  `NormativasAdminPage` y `RecursosPage`. Los callbacks de `mutate` no corren si el componente se desmontó, así que además cubre el
  punto 1 en este diálogo.
- **Qué se gana:** se quitan la función `async` y el `catch` mudo, con el mismo comportamiento.

### 4. Nombre y variantes con un solo `array_agg` (baja)
`instituciones_sin_vincular` arma el nombre y las variantes con un CTE `ordenadas` (`row_number()`),
`max(forma) filter (where pos = 1)` y `coalesce(array_agg(...) filter (where pos > 1), '{}')`.

- **Alternativa:** en `grupos`, un solo `array_agg(f.forma::text order by f.n desc, f.ult desc, f.forma) as formas`, y en el `select`
  final `g.formas[1]` y `g.formas[2:]`. Una porción fuera de rango da un array vacío, no NULL (está documentado en "Arrays → Accessing
  Arrays"), así que el `coalesce` sobra. No lo pude correr en la base local (el perfil del crítico no tiene `psql`). El pgTAP del grupo
  con una sola forma ya fija `'{}'`.
- **Qué se gana:** se eliminan un CTE, la ventana, los dos `filter` y el `coalesce`. Además, nombre y variantes salen de un mismo orden
  escrito una sola vez, y no pueden desalinearse.

### 5. El `role="status"` se monta junto con su texto (baja)
`{resultado && <p role="status">…}` inserta la región viva con el mensaje ya adentro. Muchos lectores de pantalla (NVDA y VoiceOver,
sobre todo) solo anuncian los cambios dentro de una región que ya existía. En el mismo commit el foco salta al `h1`, así que el resultado
puede no oírse nunca.

- **Alternativa:** el `<p role="status">` siempre está montado y solo cambia su texto. Las clases del recuadro verde se aplican cuando
  hay `resultado`.
- **Qué se gana:** el criterio 9 ("el resultado se anuncia") se cumple en la práctica y no solo en el test de jsdom.

### 6. La elección puede quedar oculta por la búsqueda (baja)
`elegido` sale de `activos` y no de `visibles`. Si el admin elige A y después escribe una búsqueda que lo oculta, "Vincular" sigue
habilitado y vincula A, que ya no se ve en la lista.

- **Alternativa:** `const elegido = visibles.find((e) => e.id === seleccionId) ?? null`, o mostrar "Elegido: <nombre>" junto al botón.
- **Qué se gana:** el botón actúa sobre lo que está a la vista. Es una línea.

### 7. `esVinculacionInvalida` vuelve a leer `.code` a mano (baja)
Es la sexta copia de `typeof error === 'object' && … .code === X`. En la respuesta de `fix-ruta-recursos` se acordó pasar a
`codigosDeError(e).includes(...)` (`src/shared/lib/erroresStorage.ts`, puro) cuando se tocara cada dominio, y este corte toca
`establecimientos/errores.ts`.

- **Alternativa:** `return codigosDeError(error).includes('DA005')`. `esUnicidadDe` puede seguir igual, porque además mira `message`.
- **Qué se gana:** se cumple lo acordado con una línea y no se suma otra copia.

## Respuesta

1. **Acepto.** Mientras guarda, el `Dialog` recibe un `onClose` que no hace nada y "Cancelar" queda deshabilitado. Se agrega un test.
2. **Acepto.** `creado`, `falloVinculacion` y `errorGenerico` salen de las mutaciones y queda un solo camino para reintentar.
3. **Acepto.** `vincular.mutate(vars, { onSuccess })`, sin `catch {}`.
4. **Acepto.** Un solo `array_agg` ordenado más `formas[1]` / `formas[2:]`. El pgTAP de una sola forma lo fija.
5. **Acepto.** También lo marcó el revisor (importante 2). El `role="status"` queda siempre montado y el test comprueba que sea el mismo nodo.
6. **Acepto.** La elección sale de `visibles`.
7. **Acepto.** `codigosDeError(e).includes('DA005')`, como se acordó en `fix-ruta-recursos`.

### Revisión (`revision.md`)
- **Importante 1, orden:** el código queda como está (`descargas desc, ultima desc, localidad_id, nombre`). Cuando hay empate, que aparezca primero la descarga más reciente le sirve más al admin. Corrijo la spec y se agrega un caso pgTAP con las mismas descargas y distinta `ultima`.
- **Importante 2:** ver el punto 5.
- **Menores aceptados:** el caso "sin marca" pasa a usar E2 (inactivo) para probar que `es_admin()` va primero; se agrega `DA005` con un id inexistente; se revoca EXECUTE a `service_role`; se corrige el comentario de `descargas.test.sql:522`.
- **Menores a notas:** el test de carga solo comprueba ausencias, y el test de foco de la página pasa sin el arreglo (ya lo cubre `useFocusTrap.test.ts`).
