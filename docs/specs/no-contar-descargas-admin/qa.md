# QA 1

## Veredicto
Funciona

## Qué probé
- Admin (misma sesión): KPI "Descargas" y contador de la normativa en /admin, descarga de un taller publicado completando el modal, apertura de la normativa en /normativas, recarga de /admin: ambos valores sin cambio (se esperó la respuesta 2xx de `registrar_descarga` y de `contar_descarga_normativa`, es decir, las RPC se llamaron y no contaron) — pasó
- Anónimo (contexto nuevo): misma descarga y apertura; /admin recargado: KPI +1 y contador de la normativa +1 — pasó
- Regresión: `npm run test:e2e` completo — 32 pasaron

## Bugs
Ninguno.

## Observaciones
- No probé DA003/DA004 con admin ni los CHECK (cubiertos por pgTAP).
- La apertura de normativa se cuenta una vez por visita (sessionStorage); el test usa una por contexto.
- No vi defectos visibles; no instrumenté la consola de forma sistemática.

## Evidencia
Spec nuevo: `e2e/no-contar-admin.spec.ts`. `npm run test:e2e`: 32 passed (3.1m). `npm run db:reset` ejecutado al terminar.
