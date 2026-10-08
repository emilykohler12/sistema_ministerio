# 0009 · Recursos de tipo enlace para videos

- **Estado:** aceptada
- **Fecha:** 2026-10

## Contexto
C-03 (¿habrá videos?) sigue abierta. 50 MB alcanzan para pocos minutos de video, la transferencia de Supabase
se paga y en celular un video se quiere ver, no descargar. La v1 no admitía enlaces (`ruta_archivo NOT NULL`).

## Opciones consideradas
- **Videos en Storage:** todo en un lugar; costo de transferencia y mala experiencia en celular.
- **Solo YouTube:** gratis y adaptativo; depende de que el Ministerio tenga canal.
- **Modelo que admite ambos:** archivo o enlace externo.

## Decisión
Se agrega el tipo `ENLACE` con columna `url` y un CHECK: un recurso tiene `ruta_archivo` **o** `url`, nunca
ambos ni ninguno. Los enlaces de YouTube se muestran integrados con `youtube-nocookie.com`.
Los archivos mantienen el límite de 50 MB. Se recomienda al Ministerio subir videos como "no listado".

## Consecuencias
- El modelo sirve con cualquier respuesta a C-03, sin migración posterior.
- La descarga del taller (0006) se registra igual aunque tenga videos.
