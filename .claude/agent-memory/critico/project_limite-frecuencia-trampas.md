---
name: limite-frecuencia-trampas
description: Trampas del límite por IP en RPC anónimas (spec limite-descargas #26, 2026-10-29): rechazo vs no contar, encabezado del alojado, purga por IP, GUC '' y e2e con IP compartida
metadata:
  type: project
---

En la crítica de la spec `limite-descargas` (#26, 2026-10-29), que limita por IP `registrar_descarga` con la tabla `intento_descarga` y
0030, aparecieron estas trampas. Se repiten en cualquier límite de una RPC anónima, por ejemplo si se limita `contar_descarga_normativa`:
- **Rechazar (`DA006`) cuando el acceso no depende de la RPC solo castiga a los usuarios reales.** La firma de Storage no pasa por
  `registrar_descarga` (0022). Propuse "pasado el tope, return sin insertar", igual que el admin en #25. Además, un error de encabezado
  pasa de corte del servicio a subconteo. Argumento nuevo frente a 0030: el CGNAT móvil, que el ADR no menciona (solo habla de "una escuela con NAT").
- **El encabezado de IP del alojado no está verificado.** En local, Kong pisa `x-real-ip` y agrega la IP al final de XFF. El alojado
  (Cloudflare) puede ser distinto. Pedí verificarlo a mano en el proyecto de demo **antes** de implementar, y usar un solo encabezado, sin cadena.
- **Purga "de los intentos viejos" con un índice `(ip_hash, fecha_hora)`:** empuja a purgar solo la IP que llama, y así los hashes de
  las IP que no vuelven quedan para siempre. La purga tiene que ser global. "Ningún intento vive más de 10 min" es falso en los períodos sin tráfico.
- **`current_setting('request.headers', true)` vale `''` tras un `set_config` local anterior:** `''::json` da 22P02. Usar `nullif(..., '')`,
  como `auth.uid()`.
- **En local todo sale por la IP del gateway de Docker:** los e2e y el desarrollador comparten el tope. El flujo no hace `db:reset` entre
  corridas. Propuse un `globalSetup` de Playwright con `scripts/lib/supabaseLocal.ts` que vacíe la tabla por REST con `service_role`.
  Por eso conviene dejar la tabla en `public`.

Crítica del código (mismo día): la RPC quedó bien. Lo que encontré se repite en otros cortes:
- **Un test de "X se evalúa antes que el tope" con la siembra por debajo del tope no distingue el orden.** Hay que sembrar en el tope y esperar
  el error. Vale para cualquier "A antes que B" en una RPC: el caso tiene que dar un resultado distinto si se invierte el orden.
- **El test-writer deja andamiaje de la fase RED** (SQL dinámico con `exception when undefined_table`, centinelas `-1`, `to_regclass`). Después de
  green es código muerto que oculta el error real. Proponer limpiarlo.
- **Los e2e no verifican que `VITE_SUPABASE_URL` sea local**: la limpieza con `supabaseLocal()` es segura, pero la suite puede escribir en la demo.
  Propuse una guardia con `loadEnv` + `esUrlLocal` en `e2e/global-setup.ts`.

**Why:** son fallas que no detecta pgTAP, porque `now()` es fijo y no hay HTTP ni concurrencia. Las specs las escriben con lo que se ve
en local.

**How to apply:** en cualquier spec de límite de frecuencia, cuota o tabla técnica de intentos, revisar estos cinco puntos. Ver la
`## Respuesta` de `docs/specs/limite-descargas/critica.md` para saber qué se aceptó. Relacionado: [[postgres-rpc-triggers-trampas]],
[[auditoria-falla-cerrada]].
