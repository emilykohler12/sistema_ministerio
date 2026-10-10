# Descarga de talleres (corte descargas)

- **Estado:** aprobada (crítica respondida en `critica.md`)
- **Autor:** Joa Sanchez + Claude (decisiones delegadas por el usuario)
- **Fecha:** 2026-10-10

## Objetivo
Una escuela descarga los archivos de un taller publicado después de completar un formulario de cargo, localidad e institución.
El Ministerio obtiene un `registro_descarga` por taller, que alimenta las métricas (§5.4) y la pantalla de instituciones sin vincular.
Cubre §5.1 "Descarga del taller", §9.3 y las decisiones 0006 y 0010.

## Criterios de aceptación
1. **Botón.** Dado un visitante en `/talleres/:id`, si el taller tiene al menos un recurso, ve "Descargar", que abre el modal. Si no tiene recursos, no ve el botón.
2. **Formulario.** El orden es cargo → localidad → institución.
   - Cargo: Director/a, Vicedirector/a, Secretario/a, Docente, Supervisor/a u Otro. Con "Otro" aparece `cargo_otro`, obligatorio, de 1 a 100 caracteres.
   - Localidad: los 79 municipios.
   - Institución:
     - lista los establecimientos **activos** de la localidad elegida (se filtran también para el admin), más "Otra" y "Sin institución";
     - cambiar la localidad la vacía;
     - "Otra" pide un nombre obligatorio, de 1 a 200 caracteres.
   - Se valida con zod y los mismos límites que la base.
3. **Registro.** Al enviar, se inserta un `registro_descarga` y el modal muestra la lista de recursos:
   - nombre, tipo y tamaño de cada uno, y el tamaño total;
   - los archivos van con enlace firmado (1 h);
   - el nombre de descarga es `nombreDeDescarga(recurso)`: el nombre del recurso sin diacríticos, con todo lo que no sea `[\w .-]` cambiado por `-`, más la extensión de `ruta_archivo` (por ejemplo, "Guía / 1°" → `Guia - 1-.pdf`);
   - los enlaces externos se abren en otra pestaña.
4. **Visita.**
   - El formulario se recuerda en `sessionStorage` durante la visita. Al leerlo se valida con `safeParse`, y si no pasa se descarta.
   - Otro taller abre el modal con el formulario precargado, y al confirmarlo se registra.
   - Un taller ya registrado en la visita va directo a la lista, sin un registro nuevo (se firman enlaces nuevos). La marca:
     - se pone recién cuando la RPC responde bien;
     - vive en memoria (`Set` del módulo) y en `sessionStorage`.
   - Si `sessionStorage` falla, todo funciona sin recordar entre recargas.
5. **Errores.**
   - Taller que no existe o ya no está publicado: `DA003`, "Este taller ya no está disponible", e invalida `CLAVE_TALLERES`.
   - Establecimiento (solo con `PADRON`) inactivo o de otra localidad: `DA004`, "La institución elegida ya no está disponible", y recarga la lista de esa localidad.
   - Si falla la firma después de registrar: un error con "Reintentar", que solo vuelve a firmar.
6. **Normalización.** La RPC anula los campos que no corresponden según su discriminador antes de validar:
   - `cargo_otro` fuera de "Otro";
   - `institucion_otra` fuera de `OTRA`;
   - `establecimiento_id` fuera de `PADRON`.

   Así, `OTRA` con un id queda con `establecimiento_id` nulo, y "Docente" con `cargo_otro` queda con `cargo_otro` nulo.
7. **Seguridad (pgTAP).**
   - `anon` y `authenticated` no hacen insert, update ni delete directos en `registro_descarga` (42501). Solo el admin hace SELECT.
   - `anon` tiene EXECUTE sobre `registrar_descarga`.
   - `anon` lee de `storage.objects` (bucket `talleres`) el objeto de un recurso de un taller publicado. No lee el de uno en borrador o inactivo, ni un objeto huérfano (sin fila).
   - Los CHECK rechazan cada combinación inválida de cargo e institución. El exceso de longitud da `22001`.
8. **Auditoría.**
   - El insert anónimo **no** escribe en `registro_operacion`. Un update o delete (vinculación futura) sí se audita.
   - La guardia `auditoria_global` exige que los triggers `auditar()` de cada tabla cubran INSERT, UPDATE y DELETE, salvo las excepciones por evento listadas.

## Diseño
**Paso 1: ADR 0022 + guardia.** RPC + política de Storage en lugar de la Edge Function `descargar-taller`. Modifica el mecanismo de 0006 y 0004.
- **Argumentos:**
  - una RPC definer con un insert explícito es un privilegio más acotado que una función con `service_role` en un endpoint anónimo, y todo queda en pgTAP y Vitest;
  - después, el costo de introducir Deno (no está en el contenedor, ni en lint, typecheck, Vitest o los perfiles) y un deploy aparte.
- **Pérdidas aceptadas** ("se protegen las métricas, no el acceso", 0006):
  - el cliente elige el `expiresIn`;
  - despublicar no revoca los enlaces ya emitidos;
  - el acceso al bucket queda atado a la RLS de `recurso`/`taller`;
  - una ruta visible se puede firmar sin formulario.
- 0004 sigue vigente para `gestionar-usuarios`.
- **Guardia:** `auditoria_global` con `bit_or(tgtype) & 28 = 28`, excepciones por evento y autoverificación. Se actualiza el comentario de `storage_global`.

**Paso 2 (fase A): `supabase/migrations/<ts>_descargas.sql`.**
- Enum `tipo_institucion` (`PADRON`, `OTRA`, `SIN_INSTITUCION`), según 0015.
- Tabla `registro_descarga` (§8.3, sin `updated_at`):
  - `cargo` es varchar(30) con CHECK de lista (0010);
  - `cargo_otro` y `institucion_otra` son no nulos, no vacíos y sin espacios en los extremos ⇔ su discriminador;
  - CHECK `institucion_coherente`:
    - `PADRON`: hay id y no hay otra;
    - `OTRA`: hay otra, y el id se completa al vincular;
    - `SIN_INSTITUCION`: ninguno de los dos;
  - `fecha_hora default now()`;
  - FK a `taller`, `localidad` y `establecimiento` sin cascada;
  - índice por `taller_id`.
- Permisos: RLS con select solo para `es_admin()`. Sin grants de escritura a `anon` ni `authenticated`.
- Trigger `auditar()` `after update or delete`.
- RPC `registrar_descarga(p_taller_id int, p_cargo text, p_localidad_id smallint, p_institucion_tipo tipo_institucion, p_cargo_otro text default null, p_establecimiento_id int default null, p_institucion_otra text default null) returns void`:
  - `security definer`, `search_path=''`, sin EXECUTE para `public`, con EXECUTE para `anon` y `authenticated`;
  - normaliza (criterio 6) y recorta;
  - comprueba `estado = 'PUBLICADO'` en forma explícita (DA003);
  - con `PADRON`, busca el establecimiento por `id`, `activo` y `localidad_id` (DA004);
  - inserta.
- Política `talleres_select_anon` en `storage.objects` para `anon`: `bucket_id = 'talleres' and exists (select 1 from public.recurso r where r.ruta_archivo = objects.name)`.
- Tests en `supabase/tests/descargas.test.sql`. Después se corre `npm run db:types`.

**Paso 3 (fase B): `src/features/descargas/`.**
- `types.ts`:
  - `TipoInstitucion` (enum derivado);
  - `CARGOS`, una constante igual al CHECK;
  - `DatosDescarga`;
  - `EnlaceDescarga = { recurso: Recurso; url: string }`.
- `esquema.ts` (puro): zod con los `refine` de "Otro" y "Otra".
- `consultas.ts`:
  - `registrarDescarga(tallerId, datos)` llama a la RPC;
  - `firmarEnlaces(recursos)`:
    - usa `createSignedUrl(ruta, 3600, { download: nombreDeDescarga(r) })` en `Promise.all`;
    - pasa los enlaces externos tal cual;
    - respeta el `orden`.
- `nombreDeDescarga` va en `recursos/archivos.ts` (puro, reutiliza `normalizar`).
- `errores.ts` (`DA003` y `DA004`). `visita.ts` (formulario y talleres registrados, con try/catch).
- `hooks/useDescargarTaller.ts`: una mutación que registra si hace falta, marca el taller en la visita y firma.
- `components/DescargaModal.tsx`:
  - se reescribe con props `{ taller, open, onClose }`;
  - tiene dos pasos, formulario y lista, y en la lista reutiliza `formatearTamanio` y `ETIQUETA_TIPO_RECURSO`;
  - usa `Select` nativo para la institución;
  - se borra `useNombresInstitucionSugeridos.ts`.
- `TallerDetallePage`:
  - suma el botón;
  - se actualizan sus tests;
  - se quita el comentario "sin descarga" de `ListaRecursos`.
- **Documentación:**
  - `definicion-dam.md` §9.1-9.3 y §10.3;
  - `arquitectura.md`;
  - la fila de 0006 en el índice de ADR;
  - `.claude/rules/migraciones.md` ("anon inserta registros de descarga **por la RPC**").

## Fuera de alcance
- Pantalla de instituciones sin vincular y grant de UPDATE para vincular.
- Métricas, dashboard e índice por `fecha_hora`.
- Captcha (Turnstile), límite de frecuencia y tope de `expiresIn`.
- "Descargar todo (.zip)".
- Buscador dentro del select de instituciones.
- No contar las descargas del admin.

## Verificación de punta a punta
1. `npm run db:reset && npm run test:db`, `npm test`, `npm run lint` y `npm run typecheck` en verde.
2. Con `npm run dev`, como visitante en un taller publicado con un PDF llamado "Guía / 1°" y un enlace:
   - completar Docente, una localidad y un establecimiento;
   - el PDF baja como `Guia - 1-.pdf` y `registro_descarga` suma 1;
   - `registro_operacion`, 0.
3. Reabrir el mismo taller: lista directa y sin una fila nueva. Otro taller: formulario precargado. Probar "Otro" y "Otra".
4. Pasar el taller a borrador con el modal abierto y enviar: aparece "ya no está disponible". Pedir por API la ruta de un borrador como anon: se rechaza.
