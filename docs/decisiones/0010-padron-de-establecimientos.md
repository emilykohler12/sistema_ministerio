# 0010 · Padrón de establecimientos y formulario de descarga

- **Estado:** aceptada (formato del padrón pendiente)
- **Fecha:** 2026-10

## Contexto
La institución en texto libre genera variantes ("Esc. 123", "EPN 123") y vuelve inútil "escuelas alcanzadas".
El Ministerio tiene padrón (responde C-01): nosotros hacemos la carga inicial y ellos lo mantienen.

## Opciones consideradas
- Cargo como **tabla** (lista editable, pero el invariante "Otro" depende de un id) o **texto con CHECK**.
- "Sin institución" **implícito** (ambas columnas nulas) o **explícito** (columna de tipo).

## Decisión
- Formulario: **cargo → localidad → institución** (sin nivel: se deriva del taller). Terminología `institucion`/`cargo`.
- Cargo: texto con CHECK sobre la lista Director/a, Vicedirector/a, Secretario/a, Docente, Supervisor/a, Otro; `cargo_otro` obligatorio solo con Otro.
- Tabla `establecimiento` (`cue` UNIQUE opcional, `nombre`, `localidad_id`, `activo`). Localidad sigue como tabla.
- `registro_descarga.institucion_tipo` ∈ `PADRON | OTRA | SIN_INSTITUCION`, con CHECK sobre `establecimiento_id` e `institucion_otra`.
- Pantalla "Instituciones sin vincular": crear establecimiento o vincular a uno existente; se conserva el texto original.

## Consecuencias
- "Establecimientos alcanzados" y "cobertura por localidad" pasan a ser métricas confiables.
- Carga inicial por script de semilla; luego ABM simple. Sin importación periódica.
- Pendiente: archivo de muestra del padrón (¿trae CUE? ¿una fila por nivel?). Se resuelve en el script, no en el esquema.
