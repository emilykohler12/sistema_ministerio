# Revisión: niveles-categorias

# Revisión 1

- **Revisor:** subagente `revisor`
- **Fecha:** 2026-10-10
- **Alcance:** el diff de `feat/niveles-categorias` contra `main`, sin commitear, con los archivos nuevos de `git status`.
  Lo comparé con los criterios 1 a 9 de la spec v2, con el "Diseño" y con las respuestas de `critica.md`. Usé `notas.md`
  como contexto.

## Veredicto
**Cambios necesarios (menores).** La base y el dominio cumplen la spec:
- La migración tiene RLS en las dos tablas. El select de `categoria` es `activo or (select es_admin())`, la escritura
  es solo del admin y no hay delete. Están los tres triggers: `auditar` en las dos tablas y `tocar_updated_at` en `categoria`.
- `database.ts` es idéntico byte a byte a `supabase gen types typescript --local`.
- `NIVELES` es una constante `satisfies`. `errores.ts` es puro. `consultas.ts` termina en `.select().single()`.
- `CategoriaFormPage` tiene la guarda de carga y el zod `trim().min(1).max(150)`.
- La caché se limpia cuando cambia el usuario derivado.

La verificación completa está en verde. Además, verifiqué la RLS contra la API REST local con la clave publishable:
24 comprobaciones, todas como pedía la spec, más 2 informativas.

No hay problemas críticos ni de seguridad. Falta anotar la verificación de punta a punta en el navegador (paso 3 de la
spec, que es la evidencia real del criterio 9). Hay además dos huecos chicos en las pantallas vecinas.

## Criterios → evidencia

| # | Criterio | Implementación | Evidencia |
|---|---|---|---|
| 1 | 5 niveles con ids 1-5 y `orden`, nadie de la API los modifica, constante `NIVELES` tipada, sin `'todos'` | Migración (insert de 5 filas, RLS solo select); `types.ts` (`as const satisfies readonly NivelEducativo[]`, `nombreNivel`) | pgTAP: `results_eq` con las filas exactas, INSERT de anon y del admin da 42501, UPDATE y DELETE del admin sin efecto. `types.test.ts`: filas de `NIVELES`, sin "todos". API: anon GET devuelve 5; el admin recibe 42501 en POST y 0 filas en PATCH/DELETE. `grep` sin `'todos'` en `src/` |
| 2 | `/admin/talleres` con la cantidad de categorías activas; ids inválidos o inexistentes muestran "no encontrado" | `NivelesPage` (filtra por `nivel_id` y `activo`), `NoEncontrado` en las 4 pantallas, rutas `:nivelId` | `CategoriasPage.test` y `CategoriaFormPage.test`: `abc`, `99`, `?editar=999`. El conteo de `NivelesPage` y el "no encontrado" de `TalleresListPage`/`TallerFormPage` no tienen test (problema 3). Una categoría de otro nivel se acepta (problema 2) |
| 3 | Alta y edición persisten, zod `trim/min/max(150)`, auditoría con `usuario_id`, nivel fijo al editar, guarda de carga con "Reintentar" | `CategoriaFormPage` (`Formulario` solo se monta con datos; `ErrorFallback role="alert"` con `onRetry`); `actualizarCategoria` recibe solo `nombre`/`descripcion` | `CategoriaFormPage.test`: alta con trim, 150/151 caracteres, blanco, edición sin `nivel_id`, carga rechazada con "Reintentar" que recupera. pgTAP: auditoría del INSERT (1 fila) y de los UPDATE (3) con `usuario_id`. API: INSERT + 4 UPDATE quedan en `registro_operacion` con `usuario_id` |
| 4 | Duplicado normalizado: mensaje "(puede estar dada de baja)"; en otro nivel pasa; otro error da un mensaje genérico | Índice único `(nivel_id, lower(inmutable_unaccent(btrim(nombre))))`; `esNombreDuplicado` y `try/catch` en `onSubmit` | pgTAP: 23505 por mayúsculas, tildes, espacios, contra una inactiva y por UPDATE; en otro nivel pasa. Vitest: duplicado al crear y al editar, error genérico con `mockRejectedValue`. API: "salud méntal " da 409/23505 en Secundario y 201 en Primario |
| 5 | Baja lógica con confirmación, marca "Inactiva", "Reactivar", sin borrado físico | `CategoriasPage` + `ConfirmDialog confirmLabel="Dar de baja"`; sin política de delete | `CategoriasPage.test`: confirmación, cancelar, reactivar, sin "Eliminar". pgTAP y API: el DELETE del admin y el de anon afectan 0 filas |
| 6 | El filtro del portal ofrece los 5 niveles; anon y sin marca solo ven las activas | `TallerFiltros` usa `NIVELES`; política select | pgTAP: anon y sin marca ven solo "Activa A". API: la inactiva no es visible para anon ni para `sin-permiso`, el admin sí la ve. `TallerFiltros` no tiene test (es mecánico) |
| 7 | pgTAP con todos los casos | `supabase/tests/niveles_categorias.test.sql` (36 asserts) | Cubre cada viñeta del criterio, incluido `updated_at`. Las guardias globales siguen en verde |
| 8 | Checks verdes; no quedan `categorias.mock.ts`, `Nivel`, `NIVELES_FILTRO`, `NIVEL_VALUES` ni `nivelLabel` | Mock borrado (`D` en el índice) | Ver Evidencia. `grep` sin resultados, salvo textos de UI ("Nivel no encontrado"). `types.test.ts` comprueba que esos exports no existan |
| 9 | Limpiar la caché cuando cambia el usuario derivado, salvo `INITIAL_SESSION` | `AuthContext.tsx:26,42-46` (`useRef` con el id anterior) | `AuthContext.test.tsx`: de anon a admin limpia y la query desaparece; `INITIAL_SESSION` con un admin no limpia; un `SIGNED_IN` repetido no limpia; `SIGNED_OUT` limpia (test previo). La verificación en el navegador (paso 3) no está anotada (problema 1) |

Diseño y convenciones:
- Las páginas no importan `database.ts`: solo lo hacen `features/*/types.ts` (0012). OK.
- Los formularios usan zod + RHF y componentes de `ui/`. `ConfirmDialog` suma `confirmLabel` con "Eliminar" como default,
  así que los usos existentes no cambian. OK.
- `useCategorias` y `useCategoria` comparten la clave `['categorias']` y filtran con `select`. Las mutations invalidan esa
  clave y tienen tests de invalidación (2 llamadas a `obtenerCategorias`). OK.
- `Taller` tiene `categoriaId: number`, ya no tiene `nivel` y conserva `descargas`. `useTalleres` ya no filtra por nivel.
  El catálogo filtra por las categorías del nivel. OK.
- `docs/arquitectura.md` actualiza la fila de `talleres` y la de `auth`, las rutas, la migración y las Brechas (con las
  dos reglas diferidas). `notas.md` registra el desvío de los timestamps. OK.
- Fuera del alcance de la spec solo cambió la memoria del crítico (`.claude/agent-memory/critico/`), que es de esperar.
  `spec.md` no tiene cambios contra `main` (la carpeta es nueva).

Seguridad de la migración (psql y API):
- `relacl` de `categoria` y `nivel_educativo`: anon y authenticated tienen `arwdxtm` (sin `D`, por la guardia de
  truncate). Como dice la skill, la barrera es la RLS, y la RLS se comportó como pedía la spec en todos los casos.
- `categoria_id_seq` tiene `rwU` para anon y authenticated (son los default privileges). No es explotable: es
  `generated always` y `nextval` no está expuesto por PostgREST (`rpc/nextval` da 404, PGRST202). En `registro_operacion`
  se revocó por ser forense. Acá no hace falta: lo dejo como observación.
- Un UPDATE que la RLS bloquea, con `.single()` (`Accept: vnd.pgrst.object+json`), da 406/PGRST116: no aparece un éxito
  falso. OK.
- Observación (no es problema): el admin puede cambiar `nivel_id` por API (PATCH directo, 200). El criterio 3 se cumple
  en la UI (`CategoriaCambios` no tiene `nivel_id` y el formulario no lo envía), y el admin es de confianza. Si en el
  corte de talleres mover una categoría de nivel rompe métricas o reglas, conviene un trigger o un
  `revoke update (nivel_id)`.

## Problemas

1. **[importante]** `docs/specs/niveles-categorias/notas.md`: no está anotada la verificación de punta a punta en el
   navegador (pasos 2 y 3 de la spec). Es el mismo hueco de las dos fases de auth-configuracion. La parte de datos del
   paso 2 la cubrí por API: duplicado, otro nivel, edición, baja, reactivación y auditoría. Pero el paso 3 (abrir
   `/talleres` sin sesión, iniciar sesión en la misma pestaña y ver las inactivas en el panel) es la única prueba real
   del criterio 9 con supabase-js. El test unitario simula los eventos, no el orden real en que `onAuthStateChange` los
   emite. **Arreglo:** correr los pasos 2 y 3 con `npm run dev` y anotar el resultado en `notas.md`.

2. **[menor]** `src/pages/admin/talleres/TalleresListPage.tsx:30,40,46` y `TallerFormPage.tsx:81,97`: el error de
   carga de la categoría no se muestra. Si `useCategoria` falla, `data` queda en `undefined` (no en `null`), la
   pantalla dice "Cargando..." y "..." para siempre, sin `role="alert"` ni "Reintentar", y ofrece "+ Nuevo taller".
   Además, ninguna de las dos pantallas (ni `CategoriaFormPage.tsx:55-61` con `?editar=`) comprueba que la categoría
   sea del `:nivelId` de la URL. `/admin/talleres/1/<id de una categoría de Secundario>` muestra el breadcrumb
   "Inicial". En el formulario, el mensaje de duplicado dice "en este nivel" refiriéndose al nivel equivocado, y
   después de guardar vuelve a la lista de otro nivel. No mueve datos, porque no se envía `nivel_id`. Hoy el impacto
   es bajo, porque los talleres son mock, pero en el corte de talleres esas pantallas pasan a persistir.
   **Arreglo:** usar la misma escalera de `CategoriaFormPage` (`isLoading`, `data === undefined` con
   `ErrorFallback onRetry`, `null` con `NoEncontrado`) y tratar `categoria.data.nivel_id !== nivel.id` como
   "no encontrado". El crítico propone resolverlo una sola vez, en una ruta de layout.

3. **[menor]** Hay tests que faltan para partes del criterio 2 y de la baja:
   - `NivelesPage`: el conteo de solo las activas por nivel y su `ErrorFallback` (desvío anotado);
   - el "no encontrado" de `TalleresListPage` y `TallerFormPage`;
   - el error de `actualizar` en `CategoriasPage`: si la baja o la reactivación fallan, se muestra el aviso, pero no
     hay un test con `mockRejectedValue`.

   Ninguno estaba en la lista de tests de la spec, pero hoy `npm test` sigue en verde si alguien quita el filtro
   `c.activo` del conteo. **Arreglo:** agregar un `NivelesPage.test.tsx` corto (3 categorías, una inactiva: el nivel
   muestra 2) y un caso de error de la baja en `CategoriasPage.test.tsx`.

4. **[menor]** `src/pages/public/TalleresCatalogoPage.tsx:19-23,47`: con un nivel elegido, si `useCategorias` está
   cargando o falla, `visibles` queda vacío y se muestra "No encontramos talleres" en lugar de un skeleton o un error.
   Hoy no tiene efecto, porque `talleresMock` está vacío y la spec lo plantea como puente. **Arreglo**, si se mantiene
   el puente hasta el corte de talleres: tener en cuenta `categoriasDelNivel.isLoading`/`isError` en las condiciones
   del listado.

## Evidencia

Comando pedido: `npm run db:reset && npm run test:db && npm run typecheck && npm run lint && npm test && npm run build`.

- `db:reset`: aplica `base`, `guardias`, `configuracion` y `niveles_categorias`, y siembra `admin@dam.local` y
  `sin-permiso@dam.local`.
- `test:db`: `Files=10, Tests=119`, `All tests successful`, `Result: PASS`. Están en verde `niveles_categorias` (36) y
  las guardias `rls_global`, `auditoria_global`, `truncate_global` y `updated_at_global`.
- `typecheck` (`tsc -b`): sin errores.
- `lint` (oxlint): exit 0 y 0 errores. Hay 4 warnings preexistentes (`incompatible-library` en `ConfiguracionPage`,
  `DescargaModal` y `TallerFormPage`, que ya usaba `watch` en `main`, y `only-export-components` en `AuthContext`).
- `npm test`: `Test Files 15 passed (15)`, `Tests 133 passed (133)`.
- `build`: `✓ built in 2.77s`. Muestra el aviso de chunk > 500 kB, que ya estaba antes.
- `database.ts`: `cmp` contra `supabase gen types typescript --local` da identidad byte a byte.
- psql: políticas `nivel_educativo_select_publico`, `categoria_select`, `categoria_insert_admin` y
  `categoria_update_admin`, y triggers `nivel_educativo_auditar`, `categoria_auditar` y `categoria_tocar_updated_at`.
- API REST local, con la clave publishable leída de `supabase status -o json` por stdin, sin imprimirla ni leer
  `.env*`. Usé un script en el scratchpad. Resultado: 24 comprobaciones OK y 2 informativas (PATCH de `nivel_id` y `rpc/nextval`).
  - anon: GET `nivel_educativo` da 5 filas. POST en `nivel_educativo` y en `categoria` dan 401/42501. No ve la
    inactiva. PATCH con `.single()` da 406/PGRST116. DELETE afecta 0 filas.
  - `sin-permiso`: POST da 403/42501, no ve la inactiva y PATCH afecta 0 filas.
  - admin: "Salud mental" en Secundario da 201. "salud méntal " da 409/23505 en Secundario y 201 en Primario. Blanco
    da 23514, 151 caracteres dan 22001 y el nivel 99 da 23503. Edición, baja y reactivación dan 200, y ve la inactiva.
    DELETE afecta 0 filas. Sobre `nivel_educativo`: POST da 42501 y PATCH/DELETE afectan 0 filas.
  - `registro_operacion`: `["INSERT","UPDATE","UPDATE","UPDATE","UPDATE"]`, todas con `usuario_id`.
- Al final dejé la base con `npm run db:reset` (`categoria` en 0 filas).
