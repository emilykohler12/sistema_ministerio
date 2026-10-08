# 0007 · Normativas y configuración institucional dentro del alcance

- **Estado:** aceptada
- **Fecha:** 2026-10

## Contexto
El repo ya tenía normativas (pública + ABM) y configuración editable (misión, visión, contacto, redes, logo).
La v1 solo las mencionaba como consulta (C-02) y contenido pendiente (P-01). El referente pidió las normativas.

## Opciones consideradas
- Descarga de normativa **con formulario** (métricas uniformes) o **directa** (documento público por naturaleza).
- Etiquetas **compartidas** con talleres o **catálogos separados**.
- Home **fijo** o **editable** desde el panel.

## Decisión
- Normativas: descarga directa sin formulario, contador anónimo vía RPC, etiquetas compartidas (`normativa_etiqueta`
  sobre `etiqueta`), incluidas en el trigger genérico de auditoría (0005).
- Relación `taller_normativa`: no se modela hasta responder C-02; agregarla después no rompe nada.
- Configuración: tabla de una sola fila (`CHECK (id = 1)`), lectura pública, escritura admin, logo en Storage público.

## Consecuencias
- P-01 queda abierta solo por el contenido (quién escribe los textos), no por la estructura.
- El Ministerio cambia datos institucionales sin depender de un programador.
