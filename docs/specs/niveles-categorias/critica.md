# Crítica de la spec: niveles-categorias

- **Crítico:** subagente `critico`
- **Fecha:** 2026-10-10
- **Leído:** spec, contexto, ADR 0008, 0012 y 0013, definición §5.3 y §8.3-8.4, skill `supabase-rls`, migraciones
  `base` y `configuracion`, `configuracion.test.sql`, `auditoria_global.test.sql`, `src/features/configuracion/`,
  `src/features/talleres/`, las páginas de `src/pages/admin/talleres/`, `AuthContext.tsx`, `AppProviders.tsx` y
  `docs/specs/auth-configuracion/critica.md` (con sus respuestas).

## Veredicto
Hay mejoras. La base respeta 0008, 0012 y 0013, y la RLS de `categoria` está bien. No hay nada bloqueante. Lo más
importante: este es el primer dominio cuyo contenido cambia según el rol, y la caché de React Query no lo contempla.
Además, los niveles se pueden resolver con una constante en lugar de un hook, y faltan dos pantallas en el diseño.

## Hallazgos

### 1. `['categorias']` guarda datos distintos para anon y para el admin (importante)
**Problema.** anon recibe solo las activas y el admin recibe todas, pero las dos respuestas comparten la misma clave.
`staleTime` global es de 60 s (`AppProviders.tsx:8`) y la caché solo se limpia en `SIGNED_OUT` (`AuthContext.tsx:40`).
El caso: alguien abre `/talleres`, el filtro carga `['categorias']` como anon y después inicia sesión en la misma pestaña.
Durante un minuto, `CategoriasPage` no muestra las inactivas. Si en ese momento crea "Salud" y ya existe una "Salud"
inactiva, recibe el error de duplicado por una categoría que no ve. Va a pasar lo mismo con talleres (borradores)
y con todo dominio que filtre por rol.

**Alternativa.** Limpiar la caché cada vez que cambia el usuario, no solo al salir. En `AuthContext`, guardar el id
anterior en un `useRef` y llamar a `queryClient.clear()` cuando el id derivado (admin o `null`) cambia, salvo en
`INITIAL_SESSION`. No conviene limpiar en cada `SIGNED_IN`, porque supabase-js también lo emite al recuperar la sesión
cuando la pestaña vuelve a tener foco. Agregar un caso a `AuthContext.test.tsx` (con datos en caché, pasar de anon
a admin la limpia).

**Recomendación.** Incluirlo en este corte como criterio. La alternativa de poner el rol en la clave obliga a cada
hook a leer `useAuth` y la regla se olvida en el corte siguiente.

### 2. Niveles: una constante tipada en lugar de `useNiveles` (importante)
**Problema.** Los niveles no cambian nunca. El criterio 1 impide escribirlos desde la API, 0008 los fija y la spec
les da ids explícitos 1-5. Aun así, con `useNiveles`, siete consumidores (`NivelesPage`, `CategoriasPage`,
`CategoriaFormPage`, `TalleresListPage`, `TallerFormPage`, `TallerFiltros` y `HomePage`) necesitan estados de carga
y de error para datos estáticos. "Nivel no encontrado" aparece un instante mientras carga si la página no lo contempla,
y la Home hace un request solo para un texto `sr-only`.

**Alternativa.** En `types.ts`, escribir
`export const NIVELES = [{ id: 1, nombre: 'Inicial', orden: 1 }, …] as const satisfies readonly NivelEducativo[]`
y una función `nombreNivel(id)`. El tipo sigue derivado de la base (0012). La tabla sigue existiendo, porque la FK y las
métricas por nivel (§8.4) la necesitan. Para que las dos listas no se desincronicen, el pgTAP compara las filas exactas
con `results_eq(... values (1,'Inicial',1), …)` en lugar de solo contar 5. Así, quien cambie un nivel tiene que tocar
la migración, el test y la constante en el mismo PR, y además es una decisión de ADR.

**Qué se gana.** Se eliminan `useNiveles`, su test y las ramas de carga y error en siete pantallas, y la validación
de `:nivelId` pasa a ser sincrónica. El criterio 6 cambia a "el filtro ofrece los 5 niveles de 0008".

### 3. El diseño no menciona `TalleresListPage` ni las rutas de taller (importante)
**Problema.** La sección "Pantallas" solo cubre niveles y categorías. Sin embargo, `TalleresListPage` usa
`useParams<{ nivel: Nivel }>`, `NIVELES_FILTRO`, `nivelLabel(categoria.data.nivel)` (L42), `useCategoria(categoriaId)`
con un string y la columna `t.descargas` (L88). `TallerFormPage` usa el `nivel` de la URL en los links y en los
breadcrumbs (L84, 93, 176). Todo eso se rompe al quitar `Nivel` y al pasar los ids a número, y el implementador va
a tener que resolverlo sin criterio.

**Alternativa.** Agregar una línea por pantalla: las dos leen `:nivelId` y `:categoriaId` con `Number(...)`, muestran
"no encontrado" si el número no es válido y usan `nombreNivel` (o `useNiveles`, si se rechaza el punto 2).

### 4. `CategoriaFormPage`: guarda de error, nivel fijo al editar y zod igual que la base (importante)
**Problema.** Es la misma trampa que en la Fase B de configuración. Con `?editar=<id>`, si la query falla o el id
no existe, el formulario aparece vacío y guardar pisa la descripción con `''`. Hay más diferencias entre el
formulario y la base:
- el zod actual es `min(2)` sin `trim`, así que dos espacios pasan el formulario y la base responde `23514`, que
  se ve como error genérico;
- no hay `max(150)`, así que un nombre largo da `22001`, que también se ve como genérico;
- la spec no dice si al editar se manda `nivel_id`. Si se manda el de la URL, una URL con otro nivel mueve la
  categoría en silencio.

**Alternativa.**
- En modo edición, si no hay `data`, mostrar `role="alert"` con "Reintentar" y no mostrar el formulario.
- Usar `nombre: z.string().trim().min(1).max(150)`.
- `crearCategoria` recibe `{ nivel_id, nombre, descripcion }` y `actualizarCategoria` solo `{ nombre, descripcion }`.
- `actualizarCategoria` termina en `.select().single()`, como `guardarConfiguracion`. Así un update que la RLS deja en
  0 filas se convierte en error y no muestra un falso éxito.
- Agregar un test con la carga rechazada.

### 5. `esNombreDuplicado` no va en `consultas.ts` (importante)
**Problema.** Es la misma situación que `esAdmin` en la Fase A (respuesta 1, aceptada). `CategoriaFormPage.test.tsx`
mockea `../consultas`, pero necesita el `esNombreDuplicado` real. Para obtenerlo tendría que usar `importActual`, que
carga `supabase.ts`, y para eso habría que mockear también el cliente con `{}`. Así vuelve el patrón que se eliminó.

**Alternativa.** Crear un módulo puro sin imports, por ejemplo `src/features/talleres/errores.ts`, con su test.
`consultas.ts` queda solo con llamadas a supabase-js.

### 6. Taller: cambiar solo lo que el cambio de tipos obliga; el corte no necesita dividirse (menor)
**Problema.** `Taller` va a pasar a ser `Tables<'taller'>` en el corte de talleres (0012), y entonces se reescriben
la interfaz, `useTalleres` y sus pantallas. Quitar `nivel` es obligatorio, porque desaparece `Nivel`, y `categoriaId`
tiene que ser `number`. En cambio, quitar `descargas` ahora no lo exige nada. Obliga a tocar `TalleresListPage`, el
fixture de `useTalleres.test.ts` y la columna de la tabla, y todo eso se va a reescribir igual.

**Alternativa.** Dejar `descargas` y limitar el cambio en mocks de talleres a lo que el compilador exige. El filtro del
catálogo por `categoriaId ∈ categorías del nivel` está bien como puente, porque son pocas líneas sobre un mock vacío.

**Sobre el tamaño (pregunta 7).** No conviene dividirlo. Separar la base del frontend deja un PR sin nada para probar
de punta a punta. Separar categorías de talleres no compila, porque quitar `Nivel` rompe las dos partes. Con los
puntos 2 y 6, el corte queda en una migración, un pgTAP, `types`, `consultas`, un hook y tres pantallas reales. El
resto son ajustes mecánicos. Es un tamaño parecido al de la Fase B de configuración.

### 7. Huecos en el pgTAP del criterio 7 (menor)
- El criterio 3 pide una fila en `registro_operacion` con `usuario_id`, pero el criterio 7 no lo prueba (la guardia
  global solo verifica que el trigger exista). Agregar el caso INSERT del admin con su `sub`, como en `configuracion.test.sql`.
- Probar el duplicado también por UPDATE (renombrar a un nombre que ya existe da `23505`), con espacios en los bordes
  (`'Salud '` contra `'salud'`) y contra una categoría **inactiva**. Este último caso es el que alimenta el punto 1, y
  conviene que el mensaje del criterio 4 lo cubra, por ejemplo: "… (puede estar dada de baja)".
- `nivel_educativo`: filas exactas en lugar de "hay 5" (ver punto 2).

### 8. Regla de baja diferida: anotar las dos direcciones y en qué archivo (menor)
**Problema.** Diferirla es correcto: hoy no hay forma de violarla. Pero §8.4 ("una regla de visibilidad") exige
también lo contrario: no se puede publicar ni pasar a una categoría inactiva un taller. Sin esa regla, el portal
mostraría talleres cuya categoría anon no puede leer. Además, "queda anotada allí" apunta a una spec que todavía no
existe.

**Alternativa.** Anotar las dos reglas en `docs/arquitectura.md` (sección Brechas), donde ya están los pendientes. La
de baja informa la cantidad de talleres (§5.3), así que el trigger del próximo corte tiene que devolverla, por ejemplo
en `detail`, con un SQLSTATE propio.

## Lo que está bien así
- **Ids numéricos en la URL (pregunta 1).** Son explícitos y estables entre entornos, la URL es solo del admin y el
  filtro público no vive en la URL. Un slug suma una columna, un índice único y una resolución sin ningún beneficio.
- **RLS de `categoria` (pregunta 5).** `activo or es_admin()` en el select, escrituras solo para el admin y sin delete:
  es la baja lógica de §8.4. Envolver `es_admin()` en `(select …)` también en insert y update.
- **`nivel_educativo` con trigger `auditar()` aunque no tenga escrituras.** Es una línea y no agrega excepciones a la
  guardia. Si algún día una migración o Studio lo modifica, queda registrado. Que la RLS sin políticas de escritura
  dé `42501` en el insert y 0 filas en update y delete es consistente con `configuracion`. Un
  `revoke insert, update, delete` haría que los tres den `42501`, pero no es necesario.
- **Sin `created_at`/`updated_at` en `nivel_educativo`.** Es razonable para un catálogo fijo. Como §8.3 dice que todas
  las tablas los tienen, conviene anotar el desvío en la definición o en `notas.md`.
- **Una sola clave `['categorias']` filtrada con `select` (pregunta 6).** Elimina la colisión y sigue 0012, con el
  arreglo del punto 1.
- **Diferir la regla de §5.3 (pregunta 4).** Con la anotación del punto 8.
- **Índice único `(nivel_id, lower(inmutable_unaccent(btrim(nombre))))` con CHECK `btrim <> ''`.** Coincide con §8.4,
  y el `btrim` dentro del índice evita duplicados que solo difieren en espacios.

## Respuesta
1. **Acepto.** Es un bug real y aparece por primera vez porque este es el primer dominio cuyas filas cambian según el rol.
   `AuthContext` limpia la caché cuando cambia el id del usuario derivado (salvo `INITIAL_SESSION`), con test. Pasa a ser el criterio 9.
2. **Acepto.** Constante `NIVELES ... satisfies readonly NivelEducativo[]` + `nombreNivel(id)`. El pgTAP compara las filas exactas, y así la
   constante y la base no pueden divergir sin que falle un test. Se elimina `useNiveles`.
3. **Acepto.** Se agregan `TalleresListPage` y `TallerFormPage` al diseño.
4. **Acepto todo.** Guarda de carga al editar, zod `trim().min(1).max(150)`, `nivel_id` solo al crear y `.select().single()` en el update.
5. **Acepto.** `src/features/talleres/errores.ts`, un módulo puro con su test.
6. **Acepto.** Se deja `descargas`. Se cambia solo lo que exige el compilador. No se divide el corte.
7. **Acepto.** Se suman la auditoría con `usuario_id`, el duplicado por UPDATE, con espacios y contra una categoría inactiva, y las filas exactas de los niveles.
   El mensaje del criterio 4 aclara "(puede estar dada de baja)".
8. **Acepto.** Las dos reglas (baja con talleres y nada publicado en una categoría inactiva) quedan anotadas en Brechas de `docs/arquitectura.md`. El desvío de
   `nivel_educativo` sin timestamps queda en `notas.md`.

No quedan desacuerdos.

## Crítica de código

- **Fecha:** 2026-10-10 (fase GREEN, sin commitear)
- **Leído:** `git diff main` y los archivos nuevos, `notas.md`, la migración y su pgTAP, `rls_global.test.sql`,
  `src/features/talleres/{types,consultas,errores}.ts`, `useCategorias.ts`, `AuthContext.tsx`, las pantallas de
  `src/pages/admin/talleres/` y `AdminLayout.tsx` (lee `handle.title` con `useMatches().findLast`).

### Veredicto
Hay mejoras, pero nada bloqueante. El código respeta la spec y la crítica aceptada:
- `consultas.ts` solo tiene llamadas a supabase y `errores.ts` es puro;
- hay una clave única con `select` y `NIVELES` es una constante;
- el formulario está partido en dos: la guarda de carga y `Formulario` con `defaultValues`, sin `reset` ni `values`.

`NoEncontrado` y `confirmLabel` en `ConfirmDialog` también están bien: extienden lo que ya existe en lugar de duplicarlo.
El problema más grande es el que va a heredar el corte de talleres: cada pantalla resuelve los ids de la URL por su cuenta.

### 1. Cuatro pantallas resuelven `:nivelId` y `:categoriaId` cada una a su manera (importante)
**Problema.** `CategoriasPage`, `CategoriaFormPage`, `TalleresListPage` y `TallerFormPage` repiten
`NIVELES.find((n) => n.id === Number(...))`, `Number.isInteger(Number(...)) ? ... : undefined` y la escalera
cargando → error → `null` → `NoEncontrado`. Como cada una la escribió por separado, ya divergieron:
- `CategoriaFormPage` cubre los cuatro estados de `useCategoria`;
- `TalleresListPage` y `TallerFormPage` no tienen una rama de error. Si la consulta falla, quedan en "Cargando..." o
  muestran el formulario con el breadcrumb en "...";
- ninguna comprueba que `categoria.nivel_id === nivel.id`. Con `/admin/talleres/1/<id de una categoría de
  Secundario>`, el breadcrumb mezcla niveles y "Volver" lleva al nivel equivocado.

Además, la convención `undefined` = sin datos y `null` = no existe de `useCategoria` hay que recordarla en cada consumidor.
El corte de talleres va a sumar `:tallerId` numérico en dos pantallas más y va a copiar este bloque.

**Alternativa.** Resolver los ids una sola vez con rutas de layout de React Router:
- `talleres/:nivelId` con un `<RutaNivel>`, que busca en `NIVELES` de forma sincrónica y devuelve `NoEncontrado` o
  `<Outlet context={{ nivel }} />`;
- `talleres/:nivelId/:categoriaId` con un `<RutaCategoria>`, que llama a `useCategoria`, resuelve skeleton, error con
  "Reintentar", `null` y la comprobación del nivel, y devuelve `<Outlet context={{ nivel, categoria }} />`.

Las páginas pasan a ser rutas hijas (index, `nueva-categoria`, `nuevo`, `:tallerId/editar`) y leen `useOutletContext()`.
El `handle.title` se queda en las hojas, y `AdminLayout` lo sigue encontrando con `findLast`. Si además la edición de
categoría pasa de `nueva-categoria?editar=<id>` a `:categoriaId/editar`, también se va la guarda propia de
`CategoriaFormPage`.

**Qué se gana.**
- La regla "id inválido, inexistente o de otro nivel = no encontrado" (criterio 2) vive en dos componentes en lugar de
  cuatro pantallas, y los estados de carga y error quedan iguales en todas.
- Cada pantalla pierde entre 8 y 12 líneas, y el próximo corte agrega `:tallerId` en un solo lugar.

Si las rutas anidadas les parecen mucho para este PR, el mínimo es una función pura `idDeRuta(param)` junto a `nombreNivel`.
Eso saca el parseo duplicado, pero no la escalera de estados.

### 2. `AuthContext` tiene dos reglas para limpiar la caché cuando alcanza con una (menor)
**Problema.** La condición es `evento === 'SIGNED_OUT' || (cambio && evento !== 'INITIAL_SESSION')`. Según `notas.md`,
el primer término cubre un `SIGNED_OUT` en el que el usuario derivado no cambia. Pero el único caso así es una sesión
sin la marca de admin, y esa sesión ve lo mismo que anon por la RLS, así que no hay nada distinto que limpiar.
Si el JWT pierde la marca, `idActual` pasa a `null` y el segundo término ya limpia. También sobra el `user &&` de
`if (user && idActual)`, porque `idActual` solo es no nulo si hay `user`.

**Alternativa.** Usar una sola regla: `if (cambio && evento !== 'INITIAL_SESSION') queryClient.clear()`, y quitar el
desvío correspondiente de `notas.md`.

**Qué se gana.** La regla que van a usar todos los dominios con RLS por rol (talleres borradores, normativas) se lee en
una línea y se prueba con los tres tests que ya existen.

### 3. Índice y asserts que repiten lo que ya está cubierto (menor)
**Problema.**
- `categoria_nivel_id_idx` repite lo que ya hace `categoria_nivel_nombre_uniq`. Ese índice único tiene `nivel_id` como
  primera columna, así que sirve igual para filtrar por nivel y para el chequeo de la FK.
- En el pgTAP, `has_table` y `relrowsecurity` de las dos tablas (4 de los 36 asserts) verifican lo mismo que
  `rls_global`, que ya falla si una tabla de `public` no tiene RLS.

El corte de talleres va a copiar las dos cosas, porque son "el molde".

**Alternativa.** Borrar el índice y esos 4 asserts y bajar el `plan` a 32. Dejar el índice suelto por FK solo cuando
la FK no es la primera columna de otro índice.

**Qué se gana.** Un índice menos que mantener, y el pgTAP del corte queda solo con lo propio del dominio. Las
reglas transversales quedan en las guardias, como pide 0013.

### Respuesta (código)
1. **Acepto el problema y aplico una solución intermedia.** El revisor encontró lo mismo (su problema 2): "Cargando..." infinito y ninguna
   verificación de que la categoría sea del nivel de la URL.
   - No paso a rutas de layout en este corte: eso reestructura el router sin que haya un tercer parámetro que lo justifique.
   - Agrego una función pura `idDeRuta` y un hook `useCategoriaDeRuta(nivelId, categoriaId)`. Devuelve un estado único: cargando, error (con `refetch`),
     no encontrada (incluye la categoría de otro nivel) o la categoría.
   - Lo usan `CategoriaFormPage` (al editar), `TalleresListPage` y `TallerFormPage`.
   - Cuando el corte de talleres sume `:tallerId`, se evalúa si conviene pasar a rutas de layout.
2. **Acepto.** La condición queda en `cambio && evento !== 'INITIAL_SESSION'`. El test existente de `SIGNED_OUT` la cubre.
3. **Acepto.** Se borran `categoria_nivel_id_idx` y los 4 asserts que repiten lo que verifican las guardias. La migración no está commiteada, así que se puede editar.
