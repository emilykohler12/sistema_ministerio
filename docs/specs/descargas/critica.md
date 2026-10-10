# Crítica de la spec: corte descargas

Crítico de diseño, 2026-10-10, sobre `spec.md` (borrador) y `contexto.md`. Leí los ADR 0004, 0006, 0010, 0013, 0015, 0016 y 0017, la
definición (§5.1, §8.3, §8.4, §9.1-9.3 y §10.3), `*_recursos.sql`, `*_normativas.sql`, `*_padron.sql`, las guardias `auditoria_global` y
`storage_global` y `@supabase/storage-js` en `node_modules`. Esta vez mi perfil no me dejó entrar a los contenedores (`docker`, `psql`).
Lo marcado **a verificar** sale de leer código, no de probarlo.

## Veredicto
Hay mejoras. Sostengo la decisión principal (RPC + política de Storage), pero el ADR 0022 tiene que nombrar dos pérdidas que la spec no
menciona (punto 1). Además, la RPC deja pasar una fila "OTRA" que ya aparece vinculada (punto 2).

## Puntos

### 1. RPC + política en lugar de la Edge Function: el argumento es válido, pero el ADR tiene que nombrar lo que se pierde (severidad: media)
- **Hay un argumento nuevo.** 0006 y 0004 eligieron la función para "validar, registrar y firmar con la clave de servicio". Hoy se ve que
  no protege nada que la RLS no proteja: se la puede llamar con datos falsos igual que a una RPC, y 0006 ya acepta que "se protegen las métricas, no el
  acceso". Una RPC definer que hace solo un insert explícito es un privilegio más acotado que una función con `service_role`, que se
  saltea toda la RLS en un endpoint anónimo. Además, todo queda en pgTAP. Con eso alcanza para modificar el mecanismo.
- **El argumento de Deno es el más débil. No lo pongan primero.** La CLI sirve las funciones en su propio contenedor (`[edge_runtime]`),
  y `gestionar-usuarios` (0004) va a traer Deno de todos modos, porque la API de administración de Auth necesita `service_role`. El ADR
  tiene que decir que 0004 sigue vigente para `gestionar-usuarios`, para que no se lea como "nunca Edge Functions".
- **Lo que se pierde de verdad y la spec no dice:**
  - **El visitante elige el `expiresIn`.** Con la política, cualquiera firma con la clave publicable y puede pedir un enlace de años. No conozco
    un tope del lado de storage-api (**a verificar**). Con la función, el servidor fijaba 3600 s.
  - **Despublicar no revoca los enlaces ya emitidos.** El objeto sigue en el bucket, y la URL firmada se valida por token, no por RLS.
    Con la función pasa lo mismo, pero acotado a una hora. En la práctica importa poco, porque quien bajó el archivo ya lo tiene, pero hay
    que escribirlo para que nadie crea que pasar a borrador "retira" el material.
  - **El criterio "visible" del bucket queda atado a la RLS de `recurso` y `taller`.** Si una de esas políticas se abre, se abren los
    archivos. El pgTAP del criterio 6 lo cubre; dejarlo dicho en el ADR.
- **¿Es segura la política?** Sí, con dos ajustes:
  - **Listar:** con la política, `list()` de anon devuelve solo los objetos que tienen fila en `recurso` de un taller publicado. Es la misma
    información que ya da `GET /recurso` (`ruta_archivo`). Los huérfanos de 0016 y los archivos de borradores no aparecen. No se expone nada nuevo.
  - **La subconsulta corre con la RLS de anon:** storage-api fija el rol y los claims del JWT en cada request
    (`internal/database/postgres/scope.js`, lo vi en la crítica de código de recursos). La política no es definer, así que `recurso_select`
    y, adentro, la política de `taller` se aplican a anon. `ruta_archivo` es `unique`, así que hay índice.
  - **`createSignedUrl`** pide SELECT con el rol del que llama. Después, la URL se sirve sin RLS. Por eso alcanza con una política de select
    y por eso aplica lo de "no revoca".
  - **Ajuste a:** calificar la columna: `r.ruta_archivo = objects.name`. Hoy `name` resuelve a `storage.objects` porque `recurso` no tiene
    una columna `name`. Si algún día la tiene, la política cambia de significado sin ningún error.
  - **Ajuste b:** el comentario de `storage_global.test.sql:4` ("uno privado lee con la del admin") deja de ser cierto. Hay que actualizarlo.
    No hace falta una guardia nueva para SELECT: el comportamiento se prueba en `descargas.test.sql`.
- **pgTAP:** `createSignedUrl` no se puede llamar desde SQL. El equivalente es `select ... from storage.objects` como anon, con `set local
  role`. Hay que probar cuatro casos: publicado (sí), borrador, inactivo y objeto sin fila (huérfano). Los tres últimos, no.
- **Propuesta:** aprobar la decisión. El ADR 0022 lista las tres pérdidas de arriba, aclara que 0004 sigue vigente para
  `gestionar-usuarios` y ordena los argumentos: primero RLS/pgTAP y privilegio acotado, después Deno.

### 2. La RPC deja insertar "OTRA" con `establecimiento_id`, que queda como ya vinculada (severidad: alta)
- **Problema:** el CHECK `institucion_coherente` permite `OTRA` con `establecimiento_id` no nulo, porque la vinculación futura lo
  completa. Pero el CHECK no distingue un insert de un update. Si la RPC no lo impide, un visitante (o un formulario con estado residual)
  inserta `OTRA` + un id cualquiera. Esa fila:
  - no aparece en "instituciones sin vincular", porque ya parece vinculada;
  - suma a "establecimientos alcanzados" con un establecimiento que puede ser inactivo o de otra localidad. La spec solo valida DA004
    "si el establecimiento no está activo o no es de la localidad", y no dice que eso aplique fuera de `PADRON`.

  Pasa algo parecido con los campos residuales. react-hook-form conserva `cargo_otro` si el usuario eligió "Otro", escribió algo y después
  cambió a "Docente", y lo mismo con `institucion_otra` al pasar de "Otra" a un establecimiento. La base lo rechaza con `23514`, y el usuario
  ve un error genérico por algo que no hizo.
- **Propuesta:** que la RPC normalice según el discriminador antes de validar e insertar:
  - `cargo_otro = case when p_cargo = 'Otro' then nullif(btrim(p_cargo_otro), '') end`;
  - `institucion_otra = case when tipo = 'OTRA' then nullif(btrim(...), '') end`;
  - `establecimiento_id = case when tipo = 'PADRON' then p_establecimiento_id end`.

  Los CHECK siguen siendo la red para cualquier otro camino de escritura. Sumar un pgTAP: `OTRA` + `p_establecimiento_id` ⇒ la fila queda
  con `establecimiento_id` nulo. Otro: "Docente" + `cargo_otro` ⇒ nulo. Así se gana en un solo lugar, probado en SQL, y el `zod` del
  formulario no necesita `transform`.

### 3. El nombre de descarga con tildes probablemente llega con doble codificación (severidad: media, a verificar)
- **Problema:** en `@supabase/storage-js` (`dist/index.mjs:1047-1051`), `createSignedUrl` arma `download` con `URLSearchParams` (`í` →
  `%C3%AD`) y después aplica `encodeURI` a toda la URL, que vuelve a codificar el `%` (`%25C3%25AD`). storage-api decodifica una sola vez.
  Lo más probable es que "Guía didáctica.pdf" se descargue como `Gu%C3%ADa...`. No pude ver `renderer.js` en el contenedor esta vez. En
  normativas ya apareció el `/` en el nombre.
- **Propuesta:** antes de la fase B, probar a mano o en el e2e de `qa`, con `download.suggestedFilename()`, un recurso llamado "Guía de
  lectura / 1°". Si sale mal, sanear en una función pura de `recursos/archivos.ts`: quitar los diacríticos (como `normalizar` de
  `shared/lib/texto.ts`) y `[^\w.-]` → `-`, más la extensión de `ruta_archivo`. Así se gana un nombre legible sin depender de cómo
  codifican la librería y el servidor. El criterio 3 tiene que decir qué nombre se espera.

### 4. Auditoría solo en `after update or delete`: pasa la guardia, pero por un tecnicismo (severidad: media)
- **¿Pasa la guardia?** Sí. `auditoria_global.test.sql:13-16` solo pide que exista algún trigger con `tgfoid = auditar`, sin mirar los
  eventos. Por eso mismo, la guardia tampoco detectaría una tabla futura con `after update` sola por error, ni una a la que le falte el
  trigger de insert. 0013 pide que "excluir una tabla exige justificarlo" en la lista de la guardia. Una exclusión parcial que no figura en
  la lista contradice ese pedido.
- **No es "igual que 0017".** 0017 audita el insert y excluye un UPDATE que solo cambia una columna. Acá se excluye todo el insert, y la
  razón es otra: la tabla ya es el registro de un hecho anónimo, y auditar el insert la duplicaría con `usuario_id` nulo.
- **Propuesta:** que la guardia exija que la unión de eventos de los triggers `auditar()` de cada tabla cubra los tres:
  `bit_or(t.tgtype) & 28 = 28` (INSERT 4, DELETE 8, UPDATE 16). Se suma una lista de excepciones por evento, con el comentario
  `registro_descarga: sin INSERT, la tabla es el registro de un hecho anónimo (0022)`. `normativa` sigue pasando, porque sus dos
  triggers cubren los tres eventos. Son unas cinco líneas, más su autoverificación. Se gana que la excepción quede escrita donde 0013 la pide
  y que un trigger incompleto en otro corte haga fallar la guardia. El test de comportamiento del criterio 7 se mantiene igual.

### 5. Firma de la RPC y validaciones: el orden de los argumentos no compila, y las validaciones están bien (severidad: baja)
- **Orden:** `p_cargo_otro` está en el medio de la firma. Para que `db:types` lo tipe opcional necesita `default null`, y en Postgres los
  argumentos con default van al final. Propuesta: `registrar_descarga(p_taller_id int, p_cargo text, p_localidad_id smallint,
  p_institucion_tipo tipo_institucion, p_cargo_otro text default null, p_establecimiento_id int default null, p_institucion_otra text
  default null)`. PostgREST llama por nombre, así que el orden no cambia nada del cliente.
- **CHECKs:** están bien. Faltan dos cosas:
  - el mismo "sin espacios en los extremos y no vacío" para `institucion_otra`, no solo para `cargo_otro`;
  - el `varchar(n)` corta antes que el CHECK (`22001`). El pgTAP de longitudes tiene que esperar ese código.
- **DA003/DA004:** los códigos están libres (hoy solo existen DA001 y DA002). DA003 también tiene que cubrir un id inexistente. La RPC es
  definer y se saltea la RLS, así que el chequeo `estado = 'PUBLICADO'` tiene que ser explícito, como dice la spec.
- **¿Sobra validar que el establecimiento sea de la localidad?** No. Es un solo `where id = ... and activo and localidad_id = ...`, y sin
  él una fila `PADRON` con una localidad que no corresponde ensucia "cobertura por localidad" (§8.4, hechos históricos), y no hay forma de
  detectarla después. No conviene una FK compuesta `(establecimiento_id, localidad_id)`: rompería la vinculación y el cambio de localidad de
  un establecimiento.
- **Admin en el portal:** `useEstablecimientos` le devuelve también los inactivos (`activo or es_admin()`), y elegir uno da DA004. Hay que
  filtrar `activo` en el modal o en la consulta del portal.
- **Índice por `fecha_hora`:** es prematuro. Las métricas están fuera de alcance y la tabla va a tener miles de filas por año. El índice
  por `taller_id` (FK) alcanza. El otro se agrega cuando exista la consulta que lo use.

### 6. `sessionStorage`: la decisión está bien, con dos ajustes (severidad: baja)
- **No volver a registrar el mismo taller es correcto.** Sin eso, quien cierra el modal para bajar un segundo archivo cuenta dos veces,
  y la métrica de 0006 es "formulario completado por taller".
- **Ajuste 1:** "Reintentar solo vuelve a firmar" depende de la marca del taller. Si `sessionStorage` falla (criterio 4, modo privado), la
  marca no persiste y el reintento registra otra vez. Propuesta: `visita.ts` guarda también en un `Set` en memoria, a nivel de módulo. La
  marca se pone después de que la RPC responde bien, no antes, al revés que `contarDescarga` de normativas.
- **Ajuste 2:** al leer, el formulario guardado se valida con el mismo esquema `zod` (`safeParse`), y se descarta si no pasa. Así una forma
  vieja o editada a mano no precarga basura. DA004 ya cubre los ids que quedaron viejos.
- La "marca por id en `sessionStorage` con try/catch" ya existe en `normativas/hooks/useNormativas.ts:62-70`. Con dos copias no lo llevaría a
  `shared` todavía.

### 7. Huecos de documentación que la spec no lista (severidad: baja)
Con 0022 cambian textos que hoy dicen "Edge Function `descargar-taller`":
- la definición §9.1 (diagrama y "la clave de servicio solo existe en las Edge Functions"), §9.2 (fila Edge Functions), §9.3 (flujo, pasos 2
  y 3) y §10.3 ("invocar la descarga");
- `docs/arquitectura.md` (Destino y Brechas);
- la fila de 0006 en el índice ("Leer si vas a tocar… Edge Function");
- `.claude/rules/migraciones.md` ("anon inserta registros de descarga" pasa a ser "por la RPC").

El comentario de `*_recursos.sql:2,135` no se edita, porque la migración ya está commiteada: lo aclara la nueva. Propuesta: sumar estos
archivos a la spec para que el revisor los busque.

### 8. Tamaño: entra en un corte, con las dos fases (severidad: baja)
La fase A es una tabla, un enum, una RPC, una política y su pgTAP. La fase B tiene la misma forma que normativas: esquema, consultas,
errores, visita, un hook y el modal. Es comparable a los cortes anteriores y no conviene dividirla más. Orden de los commits: ADR 0022 y la
guardia de auditoría del punto 4, después la fase A y después la B. Lo del punto 3 se verifica antes de escribir `firmarEnlaces`.

## Respuesta

1. **Acepto.**
   - El ADR 0022 ordena los argumentos así: privilegio acotado y pgTAP primero, Deno después.
   - Dice que 0004 sigue vigente para `gestionar-usuarios`.
   - Nombra las tres pérdidas: `expiresIn` elegido por el cliente, despublicar no revoca los enlaces ya emitidos, y el acceso queda atado a la RLS de `recurso`/`taller`.
   - La política usa `objects.name`. Se actualiza el comentario de `storage_global`.
   - El pgTAP cubre cuatro casos: publicado, borrador, inactivo y huérfano.
2. **Acepto.** La RPC anula los campos que no corresponden según `p_cargo` y `p_institucion_tipo` antes de validar. DA004 solo aplica a `PADRON`. Suma los dos pgTAP propuestos.
3. **Acepto con una variante.** No condicionamos el saneo a lo que dé la prueba: el nombre de descarga **siempre** pasa por una función pura `nombreDeDescarga(recurso)` en `recursos/archivos.ts`.
   - Hace tres cosas: quita los diacríticos, convierte lo que no sea `[\w .-]` en `-` y agrega la extensión de `ruta_archivo`.
   - El resultado es determinístico y no depende de cómo codifiquen la librería y el servidor. Perder la tilde en el nombre del archivo es un costo menor.
   - `qa` verifica `suggestedFilename()`.
4. **Acepto.** Antes de la fase A va un commit con la guardia `auditoria_global` endurecida: `bit_or(tgtype) & 28 = 28` y excepciones por evento, con su autoverificación. `registro_descarga` queda exceptuada solo para INSERT, justificada en 0022.
5. **Acepto todo.**
   - Firma con los argumentos `default null` al final.
   - CHECK de espacios en los extremos también para `institucion_otra`.
   - El pgTAP de longitudes espera `22001`.
   - DA003 cubre también el id inexistente.
   - El modal filtra `activo`.
   - Se quita el índice por `fecha_hora`.
6. **Acepto.**
   - La marca va en un `Set` en memoria y en `sessionStorage`, y se pone recién cuando la RPC responde bien.
   - El formulario guardado se valida con `safeParse` al leerlo.
   - No se lleva a `shared` todavía.
7. **Acepto.** Se agregan a la spec la definición §9.1-9.3 y §10.3, `arquitectura.md`, el índice de ADR y `.claude/rules/migraciones.md`.
8. **Acepto.** Un corte con tres pasos: ADR + guardia, fase A y fase B.

Sin desacuerdos de fondo.

# Crítica de código

Crítico de diseño, 2026-10-10, sobre `git diff main...HEAD` (fases A y B), `notas.md` y 0022. Leí la migración, `descargas`,
`auditoria_global`, `recursos` y `storage_global.test.sql`, todo `src/features/descargas/`, `recursos/archivos.ts`, `ListaRecursos` y
`TallerDetallePage`. No corrí `test:db` ni e2e.

## Veredicto
Hay mejoras, todas del frontend. **La parte SQL está bien así.**
- La RPC cumple los puntos 2 y 5 de la crítica de la spec: normaliza por discriminador, la firma tiene los `default null` al final,
  DA003 se comprueba en forma explícita y DA004 solo aplica a `PADRON`.
- La política usa `objects.name` y cubre los cuatro casos en pgTAP. También prueba que un `authenticated` sin marca no ve nada.
- La guardia de auditoría quedó con una sola consulta (`pg_temp.sin_cobertura()`) y una autoverificación por cada forma de cobertura
  incompleta. Es más simple que la que había.

No encontré riesgos de seguridad que salgan del diseño, más allá de las pérdidas que 0022 ya acepta.

## Puntos

### 1. `useDescargarTaller` mezcla una escritura con una lectura, y el modal lo compensa con un efecto, un ref y estado fuera de React (severidad: media)
- **Problema:** la mutación hace dos cosas, registrar (escritura, una vez por taller) y firmar (lectura idempotente, en cada apertura).
  Como la firma va dentro de una mutación, el código necesita varias piezas que solo existen para compensar eso:
  - `datos?` es opcional en `Variables`, y si falta se lanza `throw new Error('Faltan los datos…')` en tiempo de ejecución;
  - `Contenido` dispara la mutación en un `useEffect` con el ref `iniciado`, para que el modo estricto no la dispare dos veces;
  - el render vuelve a leer `tallerRegistrado(taller.id)` (el `Set` y `sessionStorage`) para decidir si un error vino de la firma o del
    registro. Esa decisión depende de estado que React no ve. Funciona solo porque el cambio de estado de la mutación provoca un nuevo render.
- **Alternativa:** separar las dos operaciones.
  - `useRegistrarDescarga()`: una mutación que solo llama a la RPC. En `onSuccess` hace `marcarTallerRegistrado`, y en `onError`
    invalida por DA003 o DA004, igual que hoy.
  - `useEnlacesDescarga(taller, habilitado)`: un `useQuery` con clave `['descargas', 'enlaces', taller.id]`, `enabled: habilitado`,
    `gcTime: 0` (firma en cada apertura y no guarda URLs de 1 h) y `retry: 1` (una firma rechazada no tiene que esperar tres reintentos).
  - `Contenido`: `const [registrado, setRegistrado] = useState(() => tallerRegistrado(taller.id))`.
    - Si `registrado` es verdadero, muestra los estados de la query: cargando, error con `refetch` como "Reintentar", o la lista.
    - Si no, muestra el formulario, y en el `onSuccess` del `mutate` hace `setRegistrado(true)`.
- **Qué se gana:**
  - Desaparecen el efecto, el ref, el `datos?` con su `throw` y la segunda lectura de `visita` en el render.
  - "Reintentar solo vuelve a firmar" deja de depender de una convención y pasa a estar en la estructura: el botón llama a `refetch`, que
    no puede registrar.
  - La firma queda como una lectura más del proyecto (`useQuery`), como el resto de los datos.
  - `visita.ts` y `consultas.ts` no cambian.
  - Los tests del hook se parten en dos, más cortos.

### 2. La normalización está en tres lugares, y en el envío se parsea dos veces (severidad: baja)
- **Problema:** la regla "solo los campos de cada discriminador" la fija la RPC (criterio 6, con su pgTAP). El esquema la tolera a propósito
  (acepta los campos residuales). Aun así, el modal tiene una tercera copia (`limpiar`). Además, `enviar` vuelve a correr
  `esquemaDescarga.parse(valores)` sobre datos que el `zodResolver` ya validó, porque el `as unknown as Resolver<Valores>` le borra el tipo
  de salida a `handleSubmit`.
- **Alternativa:**
  - Quitar `limpiar`. Un formulario recordado con un `cargo_otro` residual no hace daño: `safeParse` lo acepta, la RPC lo anula y, como
    mucho, el campo vuelve precargado si el usuario elige "Otro".
  - Tipar el formulario con los tres genéricos de react-hook-form 7.89, como `EstablecimientoFormPage` con `z.input`/`z.output`:
    `useForm<Valores, unknown, DatosDescarga>`. Así `handleSubmit` entrega la salida del resolver ya parseada.
  - Si el cast hace falta por los `setValue(..., undefined)`, dejarlo en un solo lugar, pero sin el segundo `parse`.
- **Qué se gana:** la regla queda en un solo dueño (la base, probada en pgTAP), y desaparecen unas 15 líneas y un parse redundante.

### 3. Dos piezas que ya existen o que alcanzaron el umbral para ir a `shared` (severidad: baja)
- **`TIPOS_INSTITUCION` escrito a mano** en `esquema.ts`, cuando `db:types` ya genera `Constants.public.Enums.tipo_institucion` y
  `TallerFormPage` usa ese molde (`z.enum(Constants.public.Enums.estado_taller)`). Con un enum agregado en la base, el esquema no se
  enteraría. Alternativa: `z.enum(Constants.public.Enums.tipo_institucion, …)`. Se gana una línea y que la lista salga de la base, como pide 0012.
  `CARGOS` sí tiene que ir a mano, porque es un CHECK (0015).
- **`codigoDe(error)`:** en la crítica del padrón quedó descartado "sin una cuarta copia". Con `descargas`, la guarda
  `typeof error === 'object' && … .code` ya está en cuatro dominios (talleres, normativas, establecimientos y descargas, y en talleres dos
  veces). Alternativa: mover `codigoDe` a `src/shared/lib/` (junto a `codigosDeError` de `erroresStorage.ts`, o en un `errores.ts` hermano)
  y usarlo en los cuatro `errores.ts`. Se gana una sola guarda, y los `errores.ts` quedan como tablas código → mensaje. Puede ir en un `chore`
  aparte si no quieren tocar otros dominios en esta rama.

## Respuesta

1. **Acepto.** `useRegistrarDescarga` (mutación) y `useEnlacesDescarga` (query, `gcTime: 0`, `retry: 1`, sin refetch al recuperar el foco) pasan a ser dos hooks. "Reintentar" llama a `refetch`. Se van el efecto, el ref y el `throw`. Así las responsabilidades quedan separadas: la escritura no se reintenta sola y la lectura sí.
2. **Acepto.** Se quita `limpiar`, porque la regla vive en la RPC y el pgTAP la prueba. El formulario se tipa con `useForm<Valores, unknown, DatosDescarga>`, sin parsear dos veces.
3. **Acepto `Constants.public.Enums.tipo_institucion`. Rechazo mover `codigoDe` en esta rama:** toca cuatro dominios que no son de este corte. Va en un `chore/codigo-de-error` aparte.
