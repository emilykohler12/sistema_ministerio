# Backlog inicial (borrador de los issues de GitHub)

Sale de "Brechas" de `docs/arquitectura.md` y de §5.2 de `docs/definicion-dam.md` (octubre 2026). Creados el 2026-10-16
como #19 a #35, en este orden. **La fuente de verdad son los issues**: este archivo queda como registro y no se mantiene.

Formato: cada `## ` es un issue; la línea `etiquetas:` se convierte en labels y el resto es el cuerpo.
"Choca con" lista los issues que tocan las mismas piezas: no los tomen las dos a la vez.

## Pantalla de instituciones sin vincular
etiquetas: carril:feature, area:descargas, area:establecimientos

Lista los nombres cargados como "Otra" agrupados por `(localidad_id, nombre normalizado)` (la misma clave que el aviso del
dashboard) con su cantidad de descargas; permite crear un establecimiento o vincularlos a uno existente (§5.2, 0010).

- Toca: `registro_descarga` (grant de UPDATE para vincular), `features/establecimientos`, nueva ruta admin, enlace del aviso del dashboard.
- Choca con: no contar descargas del admin, límite de frecuencia de descargas (las tres tocan `registro_descarga`).

## Historial de operaciones
etiquetas: carril:feature, area:auditoria

Pantalla de solo lectura sobre `registro_operacion` con filtros por fecha, usuario y tipo de entidad (§5.2, 0005).

- Toca: nuevo dominio `features/historial`, nueva ruta admin, quizá una RPC o vista para mostrar el usuario.
- Choca con: nada en curso.

## Recuperación de contraseña
etiquetas: carril:feature, area:auth

Enlace "¿Olvidaste tu contraseña?" en el login, correo de Supabase Auth y pantalla para definir la nueva (§5.2).

- Toca: `features/auth`, rutas públicas nuevas, configuración de Auth en `supabase/config.toml`.
- Choca con: cierre por inactividad (ambas tocan `AuthContext`).

## Cierre de sesión por inactividad
etiquetas: carril:chico, area:auth

Cerrar la sesión del admin tras 30 minutos sin actividad (§5.2, computadoras compartidas).

- Toca: `features/auth` (`AuthContext`), `AdminLayout`.
- Choca con: recuperación de contraseña.

## Logo institucional
etiquetas: carril:feature, area:configuracion

Subida del logo a un bucket público con migración, reemplazo según 0016 y uso en el encabezado del portal. Hoy `logo_ruta` queda en NULL.

- Toca: migración nueva (bucket), `features/configuracion`, `ConfiguracionPage`, layout público.
- Choca con: redes sociales en contacto (mismo dominio).

## Redes sociales en /contacto
etiquetas: carril:chico, area:configuracion

`configuracion` ya tiene `facebook` e `instagram`, pero `/contacto` no los muestra. Mostrar solo los que tengan valor.

- Toca: `ContactoPage`.
- Choca con: logo institucional.

## No contar las descargas del administrador
etiquetas: carril:chico, area:descargas, area:dashboard

Que una descarga hecha con sesión de admin no sume en `registro_descarga` ni en el contador de normativas.

- Toca: RPC `registrar_descarga` y `contar_descarga_normativa` (migración nueva), tests pgTAP.
- Choca con: instituciones sin vincular, límite de frecuencia de descargas.

## Límite de frecuencia y tope de vigencia de los enlaces de descarga
etiquetas: carril:feature, area:descargas, necesita-decision

Hoy el cliente elige `expiresIn` y despublicar un taller no revoca los enlaces ya emitidos (0022). Definir tope y límite de frecuencia.
Si se suma captcha (Turnstile), obliga a volver a una Edge Function: decidir antes con `/decision`.

- Toca: `registrar_descarga`, `features/descargas/consultas.ts`, quizá una Edge Function.
- Choca con: instituciones sin vincular, no contar descargas del admin.

## Descargar todo el taller en un .zip
etiquetas: carril:feature, area:descargas, esperando-ministerio

Botón "Descargar todo (.zip)" en el paso de enlaces del `DescargaModal`. Esperar C-09 (validar el flujo de descarga).

- Toca: `DescargaModal`, quizá una Edge Function.
- Choca con: límite de frecuencia.

## Limpieza de archivos huérfanos en Storage
etiquetas: carril:chico, area:recursos, area:normativas

Hoy un huérfano solo deja un `console.warn` (0016). Definir cómo se detectan y se borran (script o tarea del admin).

- Toca: `shared/lib/storage.ts`, `scripts/` o una pantalla admin.
- Choca con: subida reanudable.

## Subida reanudable y barra de progreso
etiquetas: carril:feature, area:recursos

Subida TUS para archivos grandes (hasta 50 MiB) con progreso visible en `RecursosPage`.

- Toca: `shared/lib/storage.ts`, `features/recursos/secuencias.ts`, `DialogoRecurso`.
- Choca con: limpieza de huérfanos.

## Vincular talleres con normativas
etiquetas: carril:feature, area:normativas, esperando-ministerio

Tabla `taller_normativa` y su gestión. Esperar C-02.

- Toca: migración nueva, `features/talleres`, `features/normativas`.

## Borrar etiquetas sin uso
etiquetas: carril:chico, area:etiquetas

Las etiquetas que ya no usa ningún taller ni normativa siguen sugiriéndose.

- Toca: `etiqueta`, `resolver_etiquetas` o una tarea de limpieza, `features/etiquetas`.

## Descargas de normativas por período
etiquetas: carril:feature, area:normativas, area:dashboard

Hoy el dashboard muestra el contador acumulado. Requiere una tabla de eventos (revisar 0017 y 0024).

- Toca: migración nueva, `contar_descarga_normativa`, `metricas_*`, `features/dashboard`.
- Choca con: no contar descargas del admin.

## Carga real del padrón
etiquetas: area:establecimientos, esperando-ministerio

Completar columnas y equivalencias de localidad en `scripts/padron/` con la muestra (C-08). La carga contra la nube la corre
una persona, no un agente (0019).

## Gestión de usuarios
etiquetas: carril:feature, area:usuarios, posterior

Invitar y desactivar administradores por Edge Function; no se puede desactivar a uno mismo ni al último activo (§5.2, 0004, 0005).

## Consultas abiertas al Ministerio
etiquetas: esperando-ministerio

Seguimiento de C-02, C-03, C-08, C-09, C-10 y C-11 (referente) y C-04 a C-07 (área de sistemas), según §11 de
`docs/definicion-dam.md`. Al responder una, actualizar la definición y desbloquear el issue que corresponda.
