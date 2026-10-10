# 0019 · La carga del padrón es un script aparte que espera la muestra

- **Estado:** aceptada (implementación pendiente de C-08)
- **Fecha:** 2026-10

## Contexto
0010 define una carga inicial por script y dice que el formato del padrón se resuelve en el script, no en el esquema. La muestra (C-08)
no llegó. Escribir el parser contra un CSV inventado arriesga rehacerlo, y el script escribe con service_role, que saltea la RLS.

## Opciones consideradas
- **Script en el mismo corte que el ABM**, con un CSV sintético. Habría datos para la demo, pero el parser se rehace casi seguro.
- **`\copy` + SQL.** Es más simple, pero necesita la conexión directa a la base, que `proteger-bash` bloquea, y no informa rechazos por fila.
- **Fase B separada**, que arranca con la muestra, con los requisitos fijados ahora.

## Decisión
Corte padrón en dos fases: A (base y ABM, hecha) y B (el script). Requisitos de B:
- **Idempotencia:** upsert por CUE. Actualiza nombre y localidad; nunca toca `activo` ni los establecimientos que no vienen en el CSV o no tienen CUE.
- **Choques:** un CUE nuevo cuyo (localidad, nombre) ya existe se rechaza y se reporta, sin fusionar. Un 23505 al escribir rechaza esa fila y no corta la carga.
- **Simulación por defecto:** el script solo informa (altas, cambios y rechazos con número de fila) y escribe recién con `--aplicar`.
- **Entorno:** usa Supabase local por defecto. Para la nube exige `--confirmar=<host>`. El script se bloquea en `proteger-bash` para que un agente no lo corra, y `esUrlLocal` se comparte con `seed-usuarios.mjs`.
- **Normalización:** el nombre se limpia (incluido U+00A0) antes de comparar y de guardar, como lo hace el índice.
- **Código:** la lógica pura vive en `scripts/padron/` con tests de Vitest; `scripts/` entra al typecheck.

## Consecuencias
- Hasta que llegue la muestra, los establecimientos se cargan a mano desde el panel.
- Si la muestra trae una fila por nivel o no trae CUE, cambia solo el script (0010).
