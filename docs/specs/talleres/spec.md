# talleres: tercer corte vertical

- **Estado:** implementada (v2, en `feat/talleres`)
- **Autor:** Joa Sanchez + Claude
- **Fecha:** 2026-10-10

## Objetivo
Pasar los talleres a Supabase (0012), con sus destinatarios y etiquetas, para que el admin los cree, edite, publique y dé de baja de verdad
y el portal muestre solo los publicados. Cierra las dos reglas taller↔categoría diferidas (§5.3, §8.4). **Sin recursos**: archivos,
Storage y descarga van en los cortes siguientes (recursos, luego descargas).

## Criterios de aceptación
1. El admin crea y edita un taller dentro de una categoría: nombre (obligatorio, sin espacios en los bordes, hasta 200), descripción (obligatoria),
   estado (Borrador / Publicado / Inactivo, por defecto Borrador), destinatarios (al menos uno) y etiquetas (0 a 20, cada una de 1 a 100 caracteres).
   El taller, sus destinatarios y sus etiquetas se guardan **en una sola transacción**: si algo falla, no queda nada a medias.
   Cada cambio deja filas en `registro_operacion` con el `usuario_id` del admin.
2. Una etiqueta nueva se crea al guardar, recortada. Si ya existe otra que difiere solo en mayúsculas, tildes o espacios en los bordes, se reutiliza
   (nunca hay duplicados, tampoco dentro del mismo guardado). El campo de etiquetas sugiere las que usan los talleres existentes.
3. La lista del admin (`.../:categoriaId`) muestra nombre, destinatarios, estado y última modificación, incluidos borradores e inactivos.
   "Dar de baja" (con confirmación) pasa el taller a Inactivo; "Reactivar" lo pasa a Borrador. No hay borrado físico desde la API.
4. **Invariante: una categoría inactiva solo tiene talleres inactivos.**
   - Dar de baja una categoría con talleres en Borrador o Publicado falla con SQLSTATE `DA001` y la cantidad en `details`. La pantalla
     muestra "No se puede dar de baja: tiene N talleres en borrador o publicados". `CategoriasPage` cuenta los talleres no inactivos.
   - Crear, reactivar o publicar un taller (estado ≠ Inactivo) en una categoría inactiva, o moverlo a una, falla con `DA002`. La pantalla muestra
     "La categoría está dada de baja: reactivala primero".
5. Portal (`/talleres`, `/talleres/:id`, Home): solo talleres publicados, **también con sesión de admin**. Filtros por nivel (vía la categoría) y
   destinatario, y búsqueda en nombre, descripción y etiquetas sin distinguir mayúsculas ni tildes, combinables. `TallerCard` y el detalle
   vuelven a mostrar el nivel. Un id inválido, inexistente o no publicado muestra "no encontrado". Sin recursos, el detalle no ofrece descarga.
6. anon y authenticated sin la marca solo leen talleres publicados y sus filas puente; no escriben nada. `destinatario` y `etiqueta` son de
   lectura pública. El admin lee todo. Nadie borra talleres; nadie (tampoco el admin) cambia `categoria.nivel_id` ni modifica destinatarios.
7. pgTAP (`supabase/tests/talleres.test.sql`):
   - visibilidad por rol de `taller` y puentes; INSERT anon/sin marca → `42501`; `destinatario` con las 5 filas exactas;
   - etiqueta duplicada normalizada → `23505`; `guardar_taller(['Redes','redés ',' REDES'])` deja una etiqueta (`'Redes'`) y una fila puente;
   - atomicidad: un destinatario inexistente (`23503`) no deja ni el taller ni etiquetas nuevas; editar sincroniza los puentes por diferencia;
   - `DA001` con `details`; `DA002` al crear, publicar, reactivar y mover; update de `categoria.nivel_id` → `42501`;
   - EXECUTE de `guardar_taller` solo para `authenticated`; `updated_at` de taller; auditoría con `sub`. Guardias globales en verde.
8. Pasan `typecheck`, `lint`, `test`, `build` y `test:db`. Al cerrar no quedan `talleres.mock.ts`, `RecursoArchivo`, `TipoRecurso`,
   `destinatarioLabel`, `titulo`, `fecha`, `responsable` ni `descargas` en el dominio talleres.

## Diseño
Un PR en dos fases: **A** (migración, pgTAP, `db:types`, criterio enum/CHECK en §8.3) con crítica de código al cerrarla; **B** (dominio y pantallas).

**Base** (`supabase/migrations/<ts>_talleres.sql`)
- `create type estado_taller as enum ('BORRADOR','PUBLICADO','INACTIVO')`: `db:types` genera la unión. Desvío de §8.3 (varchar); se anota
  en §8.3 el criterio "lista cerrada usada como tipo → enum; lista con 'Otro' o texto libre → CHECK".
- `taller`: `id int identity`, `categoria_id int not null references categoria` (+ índice), `nombre varchar(200) check (btrim(nombre) <> '')`,
  `descripcion text not null check (btrim(descripcion) <> '')`, `estado estado_taller not null default 'BORRADOR'`, `created_at`, `updated_at`.
  RLS: select `estado = 'PUBLICADO' or es_admin()`; insert/update admin; sin delete. Triggers `auditar`, `tocar_updated_at`, `taller_validar_categoria`.
- `destinatario` (`id smallint` explícito, `nombre varchar(100) unique`): 5 filas en la migración (P-02, a confirmar). Solo select público.
- `etiqueta` (`id int identity`, `nombre varchar(100)`, check no vacío, índice único `lower(inmutable_unaccent(btrim(nombre)))`).
  Select público; insert admin; sin update ni delete.
- `taller_destinatario`, `taller_etiqueta`: PK compuesta `(taller_id, x_id)`, índice en `x_id`. Select `exists (select 1 from taller t where t.id = taller_id)`
  (hereda la RLS de `taller`); insert y delete admin. Todas con `auditar` (en puentes `registro_id` queda nulo; el JSON tiene `taller_id`).
- `guardar_taller(p_categoria_id int, p_nombre text, p_descripcion text, p_estado estado_taller, p_destinatarios smallint[],
  p_etiquetas text[], p_id int default null) returns int` (`p_id` al final y con default: `db:types` lo marca `p_id?: number`
  y el alta lo omite sin cast): plpgsql, **security invoker** (RLS y `auth.uid()` siguen valiendo), `search_path = ''`.
  `revoke execute ... from public, anon`; `grant ... to authenticated`. Pasos:
  1. Inserta o actualiza el taller (`p_id` nulo = alta; update que afecta 0 filas → `P0002`).
  2. Etiquetas, en **tres sentencias separadas**: (a) normalizar sin duplicados (`distinct on` la clave `lower(inmutable_unaccent(btrim(n)))`,
     nombre `btrim(n)`, descartando vacíos); (b) `insert into etiqueta ... on conflict do nothing`; (c) buscar los ids por clave y `raise` si falta alguno.
  3. Sincroniza puentes **por diferencia** (borra las quitadas, inserta las nuevas) para no inflar la auditoría.
- `taller_validar_categoria` (before insert / update of `estado`, `categoria_id`): si `new.estado <> 'INACTIVO'`, lee la categoría con `for share`
  y si está inactiva → `DA002`. `categoria_validar_baja` (before update of `activo`, true → false): cuenta talleres no inactivos; si > 0 → `DA001`
  con `detail` = cantidad. Con READ COMMITTED el `for share` serializa la carrera en ambas direcciones.
- `revoke update on categoria from anon, authenticated; grant update (nombre, descripcion, activo) to authenticated`. Comentario: el grant
  por columna es lo que habilita el `for share` del trigger.

**Dominio** (`src/features/talleres/`)
- `types.ts`: `EstadoTaller = Enums<'estado_taller'>`, `Destinatario = Tables<'destinatario'>`, `DESTINATARIOS = [...] as const satisfies readonly Destinatario[]`,
  `Etiqueta`, `Taller = Tables<'taller'> & { categoria: Pick<Categoria,'nivel_id'>; destinatario: Destinatario[]; etiqueta: Etiqueta[] }`,
  `TallerGuardado` (args de la RPC). Se quitan `destinatarioLabel`, `RecursoArchivo`, `TipoRecurso`.
- `errores.ts`: `categoriaConTalleres(error)` → `number | null` (`DA001`, `Number(error.details)`), `esCategoriaInactiva(error)` (`DA002`).
- `filtrar.ts` (puro): `normalizar(texto)` (NFD sin diacríticos, minúsculas) y `filtrarTalleres(talleres, { nivelId, destinatarioId, busqueda })`.
- `consultas.ts` (solo supabase): `obtenerTalleres()` (`select('*, categoria(nivel_id), destinatario(*), etiqueta(*)')`), `guardarTaller(datos)` (rpc),
  `cambiarEstadoTaller(id, estado)` (`.select().single()`).
- Hooks, todos sobre la clave `['talleres']` con `select`: admin `useTalleres(categoriaId?)`, `useTaller(id)`, `useEtiquetasSugeridas()`
  (nombres únicos de la caché); portal `useCatalogo(filtros)` (publicados + `filtrarTalleres`) y `useTallerPublicado(id)`.
  `useGuardarTaller` y `useCambiarEstadoTaller` invalidan `['talleres']`. `useNombresInstitucionSugeridos` se mueve a `features/descargas/`.

**Pantallas**
- `TallerFormPage`: zod del criterio 1, select de estado, `ToggleGroup` con `DESTINATARIOS`, `TagInput` con `useEtiquetasSugeridas`; quita `fecha`,
  responsable y `FileDropzone`; edición con `idDeRuta(:tallerId)` y "no encontrado" si el taller no es de la categoría; mensajes de `DA002` y genérico.
- `TalleresListPage`: columnas del criterio 3, baja y reactivación reales (con mensaje de `DA002`). `CategoriasPage`: conteo no inactivos y mensaje de `DA001`.
- Portal: `TalleresCatalogoPage`, `TallerFiltros`, `TallerCard`, `TallerDetallePage` (similares de la misma categoría), `HomePage` (6 publicados
  más recientes) usan solo `useCatalogo` / `useTallerPublicado`, ids numéricos y `nombreNivel(taller.categoria.nivel_id)`. El detalle quita
  vista previa y `DescargaModal` (vuelven con recursos).

**Tests**: `errores.test.ts`, `filtrar.test.ts` (tildes, descripción, etiquetas, combinación), hooks con `vi.mock('../consultas')`,
`TallerFormPage` (alta, edición, DA002, error genérico, no encontrado), `TalleresListPage` (baja/reactivar), `CategoriasPage` (DA001),
`TalleresCatalogoPage` y `TallerDetallePage` (con admin, un borrador no aparece / da "no encontrado"). pgTAP del criterio 7.

**Docs**: `arquitectura.md` (dominio talleres; Brechas: quitar las reglas cerradas y `descargas`), `definicion-dam.md` §8.3 (criterio enum),
`notas.md` (desvíos), `niveles-categorias/notas.md` queda cerrado en `nivel_id` y rutas de layout (no hacen falta).

## Fuera de alcance
- Recursos, Storage, vista previa y descarga (corte recursos; luego descargas con padrón y Edge Function).
- `normativa_etiqueta` y normativas en base; borrado de etiquetas huérfanas; gestión de destinatarios (P-02).
- Mover un taller de categoría desde la UI (la base ya lo protege). Navegación pública por categoría. Dashboard. Datos de ejemplo.

## Verificación de punta a punta
1. `npm run db:reset && npm run test:db && npm run db:types && npm run typecheck && npm run lint && npm test && npm run build` → verde.
2. Como admin: crear "Cuidados en redes" en Secundario/Salud mental como borrador con etiquetas "Redes" y "redés " (queda una);
   verificar que no aparece en `/talleres` (con la sesión abierta); publicarlo; verlo sin sesión buscando "cuidádos" y filtrando por Secundario.
3. Intentar dar de baja Salud mental → mensaje con "1 taller". Dar de baja el taller, luego la categoría (pasa).
4. Con la categoría inactiva, "Reactivar" el taller → mensaje de DA002. Reactivar la categoría y luego el taller. En Studio, filas en `registro_operacion`.
