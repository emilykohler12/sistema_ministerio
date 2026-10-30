# 0030 · Límite de frecuencia en `registrar_descarga`, sin Edge Function ni tope de vigencia

- **Estado:** aceptada (confirma 0022)
- **Fecha:** 2026-10

## Contexto
#26 pedía un tope de vigencia para los enlaces firmados y un límite de frecuencia para las descargas. Con 0022 el visitante firma con `createSignedUrl`
y elige el `expiresIn`, y una política de `storage.objects` decide si puede firmar, no por cuánto tiempo. Por eso no hay tope ni revocación posibles mientras
firme el cliente; firmar en Postgres exigiría guardar en la base el secreto JWT. El sistema protege las métricas, no el acceso (0006, 0022, definición §666), y no hay abuso registrado.

## Opciones consideradas
- **A. Límite por IP dentro de la RPC:** sin Deno ni deploy aparte, se prueba con pgTAP. Protege las métricas, pero no el ancho de banda: se puede firmar sin el formulario.
- **B. Edge Function `descargar-taller`:** firma con `service_role` y vigencia corta, aplica el límite y prepara el captcha. Reabre 0022 sin argumento nuevo:
  `service_role` en un endpoint anónimo, primer código Deno fuera de lint, tests y agentes, y un deploy aparte.
- **C. No hacer nada** hasta que aparezca abuso.

## Decisión
A. Pasado un tope por IP en una ventana de tiempo, `registrar_descarga` responde bien pero **no registra** (como con el admin, #25), en lugar de
rechazar: un rechazo no impide el acceso (la firma no depende de la RPC) y castigaría a quienes comparten IP (NAT de una escuela, CGNAT móvil).
Los intentos se cuentan en una tabla que guarda un hash de la IP y se purga en cada llamada. `docs/specs/limite-descargas/` fija tope, ventana y encabezado.

## Consecuencias
- Siguen las pérdidas de 0022: el cliente elige `expiresIn`, despublicar no revoca y una ruta visible se firma sin el formulario.
- Varias PC detrás de una IP comparten el tope: pasarlo cuesta conteos, nunca acceso. Pasar el tope no se ve en el panel.
- Si el encabezado de IP del alojado no trae la IP del cliente, el tope se vuelve global y sub-cuenta todo: se verifica a mano antes de desplegar.
- Se pasa a B (y a Turnstile) si el dashboard muestra abuso o el Ministerio exige un captcha; ese es el argumento nuevo que reabre 0022.
