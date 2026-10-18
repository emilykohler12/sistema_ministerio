# QA 1

## Veredicto
Funciona con observaciones

## Qué probé
(`e2e/historial.spec.ts`, 4 tests, contra el Supabase local)
- Enlace "Historial" del menú admin lleva a `/admin/historial` — pasó
- Crear taller con etiqueta y destinatario, agregar y borrar un recurso, editar la descripción y guardar sin cambios: el historial muestra email `admin@dam.local`, fecha y hora, acciones Alta/Modificación/Baja — pasó
- Filtro Entidad "Taller" agrupa taller, `taller_destinatario` y `taller_etiqueta` (las puentes se ven como `taller_id N · etiqueta_id M`); sin filas de Recurso — pasó
- Diff expandido de la modificación: solo `descripcion` (sin `updated_at` ni `nombre`); la modificación solo de `updated_at` dice "Sin cambios en los campos del registro" y no tiene botón — pasó
- Baja de recurso visible con filtro Recurso — pasó
- Rango invertido: error junto a los campos (`aria-describedby`), cero requests a `registro_operacion`, sin tabla — pasó
- Usuario "Sistema": estado vacío "No hay operaciones para los filtros elegidos." y "Limpiar filtros" restaura — pasó
- `?pagina=999`: "Esa página no existe." con "Limpiar filtros" (PGRST103 manejado) — pasó
- `?usuario=x&entidad=x`: se descartan (selects en "Todos") — pasó
- Fecha escrita con el teclado: una sola consulta, URL con `desde=<hoy>` — pasó
- URL compartida en otra pestaña (con login, ver observaciones) conserva el filtro — pasó
- Paginación con teclado (55 PATCH a `configuracion` por REST, luego Siguiente con Enter): `?pagina=2`, "Página 2 de N" y el foco queda en el total — pasó
- REST con `sin-permiso@dam.local`: `registro_operacion` da `[]`, `usuarios_historial` da 42501; anon también 42501 — pasó
- Sin errores ni avisos de consola en los flujos de filtros (salvo el 416, ver Bugs)

## Bugs
- **[menor]** El `?pagina=999` deja un error en la consola del navegador
  Pasos: 1. Entrar como admin. 2. Abrir `/admin/historial?pagina=999`. 3. Mirar la consola.
  Esperado: sin errores (la app lo maneja y muestra el vacío). Obtenido: `Failed to load resource: the server responded with a status of 416 (Requested Range Not Satisfiable)`. Es el 416/PGRST103 de PostgREST, que el navegador registra aunque `consultas.ts` lo capture; no se puede evitar sin otra estrategia de consulta (p. ej. pedir el conteo aparte). El impacto es solo de consola; descartable si el equipo lo acepta (las notas ya documentan el 416).

## Observaciones
- Los tests del e2e de fechas escriben en formato mm/dd/aaaa (locale en-US de Chromium) y usan `focus()` y no `click()` en el input (el clic cae en el segmento del año).
- La pestaña nueva pide login (la sesión vive en `sessionStorage`, diseño existente): "copiar la URL en otra pestaña" se probó con login y luego la URL; el filtro se conserva.
- No probé: usuario baneado con email (criterio 7, lo cubre pgTAP), falla de la RPC `usuarios_historial` ni de la consulta principal (uuid corto, "Reintentar"; cubiertos por vitest), vista móvil, ni el filtro por usuario concreto con varios admins (solo existe un admin sembrado).
- Flakiness ajena: en una corrida completa falló una vez `normativas-admin.spec.ts:22` (fila "editada" no visible); en 3 repeticiones aisladas y en la corrida completa siguiente pasó. No toca el historial; conviene vigilarlo.
- Las filas de configuración se describen por el nombre de la institución ("Ministerio de Educación de Misiones"), consistente con la spec.

## Evidencia
`npm run test:e2e` completo (tras `db:reset`): `41 passed (4.0m)`; incluye los 4 de `historial.spec.ts` (6.4s, 9.0s, 4.2s, 2.4s). Al final se corrió `npm run db:reset`.
