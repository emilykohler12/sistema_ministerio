# 0006 · Descarga: un formulario por taller y un enlace por recurso

- **Estado:** aceptada (pendiente de validar con el referente)
- **Fecha:** 2026-10

## Contexto
La v1 pedía que un botón descargue todos los archivos del taller (P-05) y que funcione en celular.
Los recursos tienen tipos y tamaños muy distintos (hasta 50 MB).

## Opciones consideradas
- **ZIP en Edge Function:** excede límites de memoria y tiempo; ZIP es mala experiencia en celular.
- **ZIP en el navegador (JSZip):** carga todo el taller en memoria del celular.
- **Varias descargas automáticas:** los navegadores móviles las bloquean.
- **Formulario y luego lista de enlaces firmados, uno por recurso.**

## Decisión
Formulario y lista de enlaces. La Edge Function `descargar-taller` valida, inserta **un** `registro_descarga`
por taller y devuelve enlaces firmados (bucket privado). El modal muestra tipo, tamaño y tamaño total.
El formulario se recuerda en `sessionStorage` durante la visita.

## Consecuencias
- P-05 queda resuelta sin ZIP. Si el referente insiste, se puede sumar "Descargar todo (.zip)" solo en escritorio.
- La métrica significa "formulario completado para el taller", no "descargó todos los archivos".
- Se protegen las métricas, no el acceso. Riesgo aceptado: alguien puede inflar descargas llamando la función;
  se agrega captcha (Turnstile) solo si aparece abuso.
