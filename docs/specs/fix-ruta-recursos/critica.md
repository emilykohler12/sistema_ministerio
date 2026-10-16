# Crítica del plan: fix-ruta-recursos

## Veredicto
Hay mejoras, todas chicas. El enfoque está bien: es el molde de normativas para la baja y un `.eq` para el reemplazo, sin migración.

## Respuestas directas (sin cambios)
- **P1, concurrencia optimista.** Es correcta y alcanza. Con READ COMMITTED, Postgres vuelve a evaluar el `WHERE` sobre la versión nueva
  de la fila: de dos reemplazos simultáneos gana uno y el otro afecta 0 filas. `.single()` manda `Accept: vnd.pgrst.object+json` y
  PostgREST contesta 406 con `code: 'PGRST116'`. Como `code` no está vacío, `esRechazoDelServidor` da `true` y se compensa. PGRST116
  también aparece si la RLS filtra la fila o si la borró otra pestaña. No hace falta separarlos: en los tres casos el UPDATE no ocurrió,
  así que borrar el archivo nuevo y no tocar el viejo está bien. El viejo ya lo borró quien ganó o quien eliminó la fila. Una sesión
  vencida llega con otro código (PGRST301/401) y cae en el mensaje genérico.
- **P2, ¿solo arreglar la baja?** No conviene. Sin el `.eq`, el reemplazo con caché vieja deja huérfano sin aviso el archivo de la otra
  pestaña, y el `console.warn` nombra una ruta que ya no existe. Cuesta un filtro: vale la pena. Lo opcional es el mensaje (ver 1).
- **P3, baja.** `delete ... select('ruta_archivo')` devuelve `null` para un enlace: alcanza con `if (ruta !== null)`. Desde la UI no
  se puede pasar de archivo a enlace ni al revés (el reemplazo rechaza enlaces y "Editar" solo cambia `nombre`/`url`). Aunque se
  pudiera, leer la ruta de la base es justo lo que resuelve ese desfasaje. `eliminarRecurso` deja de usar `recurso.ruta_archivo`:
  conviene mantener la firma para no tocar el hook ni la página.

## Puntos

1. **Media. El mensaje nuevo se muestra en flujos que no recargan la lista.**
   *Problema.* `mensajeDeErrorRecurso` es el mismo para Editar, Agregar enlace, Eliminar y Reemplazar (`RecursosPage`, líneas 97, 249
   y 262). Si traduce PGRST116 a "…Recargamos la lista.", el renombre de un recurso borrado en otra pestaña da el mismo PGRST116 y
   muestra ese texto, pero `useActualizarRecurso` solo invalida en `onSuccess`, así que la lista no se recarga.
   *Por qué importa.* Es un mensaje que promete algo que no pasa, en el caso exacto que el fix quiere cubrir (caché vieja).
   *Recomendación.* Cambiar `onSuccess: invalidar` por `onSettled: invalidar` en los tres hooks que pueden recibir PGRST116
   (`useActualizarRecurso`, `useReemplazarArchivo`, `useEliminarRecurso`). Es una palabra por hook, en lugar de agregar `onError`.
   Un texto neutral sirve para los tres: "El recurso cambió o ya no existe. Actualizamos la lista." Para detectar el código, sumar `code`
   al arreglo de `codigosDeError` (`src/shared/lib/erroresStorage.ts`) en vez de escribir a mano la quinta lectura de `error.code`
   (ya hay copias en descargas, normativas, talleres y establecimientos). Así `mensajeDeErrorRecurso` queda en un `includes('PGRST116')`.

2. **Baja. Un test del plan repite uno que ya existe, y el que importa no figura.**
   *Problema.* "Reemplazo con fila cambiada compensa el nuevo y no borra el viejo" es, con `consultas` mockeado, el mismo test que
   `secuencias.test.ts:239` (un update rechazado con 42501). Lo nuevo es otra cosa: que `reemplazarArchivo` le pase la ruta anterior a
   `actualizarRecurso`. Además, el `beforeEach` mockea `eliminarFilaRecurso` sin valor de retorno (`undefined`): con `ruta !== null`,
   todas las bajas del test intentarían `borrarArchivo(undefined)`.
   *Recomendación.* Agregar la ruta anterior a la aserción de argumentos de `:228`/`:232` y, si quieren dejar el caso explícito, cambiar
   en `:239` el 42501 por `{ code: 'PGRST116' }`, sin sumar un test. Hacer que el mock de `eliminarFilaRecurso` devuelva la ruta del
   recurso de prueba. Que el `.eq` produzca PGRST116 contra la base real no lo prueba Vitest. Es comportamiento documentado de
   PostgREST y no justifica un e2e con dos pestañas. Para la firma, un parámetro concreto (`rutaAnterior?: string`) es mejor que una
   "condición opcional" genérica: hoy hay un solo uso.

3. **Baja. El plan cita mal la 0023.**
   *Problema.* La 0023 manda correr el qa en el carril chico si el cambio "toca Storage, permisos de anon o rutas". "Storage de anon"
   no figura: el plan junta dos criterios. Este fix cambia qué objeto se le pasa a `remove()`, así que, leída al pie de la letra,
   la regla pide qa.
   *Por qué importa.* En espíritu la decisión es razonable: el qa no puede ver Storage ni la base (0023, "Queda afuera"), no hay
   política ni permiso nuevo, y la suite `recursos.spec.ts` ya cubre la baja y el reemplazo como regresión. Pero si queda escrito así,
   el próximo plan va a leer "Storage de anon" como si fuera la regla.
   *Recomendación.* Dejar `test:e2e` + `db:reset` como dice el plan, pero escribir la excepción con su motivo: "toca Storage solo en la
   ruta que se borra; el qa no puede verificar Storage y la regresión la cubre `recursos.spec.ts`". La otra opción es correr el qa.
   No sumar specs nuevas.

Lo demás no sobra: actualizar la brecha de `arquitectura.md` es necesario, porque la línea de "Recursos" describe justamente lo que
este fix corrige.

## Respuesta
1. **Acepto.** `onSettled: invalidar` en los tres hooks, texto neutral "El recurso cambió o ya no existe. Actualizamos la lista." y `code`
   sumado a `codigosDeError`. Ojo: es compartido con normativas, descargas y demás; sumar un elemento al arreglo no cambia sus `includes`
   actuales (ningún `code` de Postgres o PostgREST coincide con 413/415), y se corre la suite completa.
2. **Acepto.** Sin test duplicado: la aserción de `:228`/`:232` incluye la ruta anterior, `:239` pasa a `PGRST116` y el mock de la baja
   devuelve la ruta. Firma concreta `rutaAnterior?: string`.
3. **Acepto.** Se escribe la excepción con su motivo. Queda a decisión del usuario si prefiere correr el qa igual.

## Crítica de código

**Veredicto: está bien así en lo estructural.** Quedan dos detalles bajos y ninguno bloquea. La respuesta a la crítica del plan se aplicó completa.

Respuestas directas (sin cambios):
- **Firma `actualizarRecurso(id, cambios, rutaAnterior?)`.** Es el lugar correcto. `secuencias.ts` no conoce supabase-js, así que no
  puede armar el filtro, y una `reemplazarFilaRecurso` aparte repetiría las cinco líneas de la consulta para un único uso. Que "Editar"
  no pase la ruta también está bien: renombrar no depende de qué archivo tiene la fila.
- **`onSettled` en `RecursosPage`.** No tiene efectos indeseados. Mientras se recarga, `tallerRuta.data` sigue definido, así que `Pantalla`
  no se desmonta y `avisos` se conserva. `DialogoRecurso` mantiene `errorEnvio` y no se cierra, porque solo cierra si `onSubmit` resuelve.
  El único cambio es de tiempos: React Query espera el `onSettled` del hook antes de llamar al `onError` de la llamada y antes de rechazar
  `mutateAsync`. Por eso el aviso aparece después de la recarga y `ocupado` sigue en `true` mientras tanto, que es lo que conviene.
  `invalidateQueries` no lanza si falla la recarga.
- **Comentarios.** El bloque del invariante de `secuencias.ts` sigue siendo cierto, y ahora más: la baja borra la ruta de la base.
  El JSDoc de `consultas.ts` y el contrato de `secuencias.test.ts` están al día.

1. **Baja. `codigosDeError` vive en `erroresStorage.ts`, pero ya no es solo de Storage.**
   *Problema.* La función ahora lee también el `code` de PostgREST y Postgres. El JSDoc lo dice, pero el nombre del módulo no. Quien busque
   cómo leer un `code` no lo va a encontrar ahí, y la próxima copia de `(error as { code?: unknown }).code` sería la quinta (descargas,
   normativas y dos en talleres).
   *Por qué importa.* Juntar status y `code` en una sola lista es sano: los valores no se pisan (status HTTP de 3 dígitos, SQLSTATE de
   5 caracteres, `PGRSTnnn`). Lo que confunde es dónde está la función.
   *Recomendación.* Renombrar el módulo a `src/shared/lib/errores.ts`: cambian dos imports y el test. Las cuatro copias pueden pasarse a
   `codigosDeError(e).includes(...)` cuando se toque cada dominio. No hace falta en este fix.

2. **Baja. Afirmaciones que no prueban nada en `consultas.test.ts`, y un JSDoc que generaliza de más.**
   *Problema.* `expect(error.code).toBe('PGRST116')` (dos veces) verifica el literal que armó el mismo test; lo que importa ya lo prueba
   `rejects.toBe(error)`. Además, en `errores.ts` dice "los hooks invalidan la caché al terminar, con éxito o sin él", pero `useCrearEnlace`
   y `useOrdenarRecursos` no lo hacen. Hoy no reciben PGRST116, así que el mensaje no promete nada falso, pero la frase puede inducir a error.
   *Por qué importa.* Si alguien reutiliza `mensajeDeErrorRecurso` en una mutación nueva, el JSDoc le hace creer que la invalidación ya está.
   *Recomendación.* Borrar las dos líneas que no prueban nada y escribir "los hooks de actualizar, reemplazar y eliminar invalidan…".
   El mock de la cadena de supabase-js está bien acoplado: es la única forma de probar el filtro sin base, y `toEqual(eq.mock.calls)` además
   confirma que no hay un tercer filtro.

### Respuesta (código)
1. **Rechazo por ahora.** El JSDoc ya dice que lee `code`; renombrar el módulo toca normativas y amplía el diff de un fix acotado. Queda
   para cuando se unifiquen las cuatro lecturas de `.code` (descargas, normativas, talleres): ese cambio sí justifica mover el módulo.
2. **Acepto.** Borradas las dos afirmaciones y el JSDoc de `errores.ts` nombra los tres hooks con `onSettled`.
