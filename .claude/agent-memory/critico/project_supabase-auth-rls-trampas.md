---
name: supabase-auth-rls-trampas
description: Trampas que aparecieron en la spec auth-configuracion (2026-10-10): sesión con getSession+onAuthStateChange, signOut en el callback, pgTAP que espera CHECK antes que RLS, default '' vs zod
metadata:
  type: project
---

En la crítica de la spec `auth-configuracion` (2026-10-10, primer corte vertical) aparecieron trampas que se pueden
repetir en cada corte que copie el patrón:
- **Sesión:** la spec restauraba con `getSession` y además se suscribía a `onAuthStateChange`, y llamaba a `signOut`
  dentro del callback, que puede trabar el cliente (deadlock documentado de supabase-js). Propuse una sola fuente
  (`INITIAL_SESSION`), `usuario` derivado con `esAdmin` y `signOut` diferido con `setTimeout 0`.
- **pgTAP:** sin política de insert, la RLS (`42501`) corta antes que el CHECK. Para probar el CHECK hay que correrlo
  como `postgres`. Un DELETE sin política da 0 filas, no un error.
- **Base vs. formulario:** columnas `not null default ''` contra zod `min(1)`/`email()` hacen que el primer guardado
  no pase.
- **Tamaño:** la spec juntaba dos dominios en un PR, contra la letra de 0012. Propuse fases A/B como en supabase-base.

En la crítica del código de la Fase A (2026-10-10) aparecieron dos cosas más:
- **Funciones puras en `consultas.ts`:** `esAdmin` estaba junto a los envoltorios de supabase. Para usarla, los tests
  hacían `importActual` y además mockeaban `@/shared/lib/supabase` con `{}`, lo que revertía el hallazgo 8 ("que falle
  el import es la señal"). Regla: `consultas.ts` solo con llamadas a supabase y lo puro en otro módulo.
- **Navegación derivada también al salir:** el sidebar navegaba después de `signOut` y además `AdminLayout` redirigía.
- supabase-js 2.117 ya no usa lock por defecto (el deadlock del callback no aplica, aunque el `setTimeout` igual es
  inofensivo) y `_signOut` borra la sesión local aunque falle la red. Verificar en `node_modules` antes de citar
  comportamiento de la librería.

En la crítica del código de la Fase B (configuración, 2026-10-10):
- **Formulario de edición sin guarda de error:** con solo `isLoading`, si la query falla se ve el form vacío y guardar
  pisa la fila con `''`. Pedir `if (!data) return <alert + reintentar>`.
- **`reset` campo por campo "para no mandar id/updated_at":** no hace falta, porque `zodResolver` (con `raw` en false) entrega
  la salida de zod y `z.object` descarta las claves extra. Alcanza con `useForm({ values: data })`.
- **pgTAP por rol:** `DO` + `GET DIAGNOSTICS` + tabla temporal para contar filas es redundante si después se chequea el
  valor. Un `update`/`delete` suelto en el script funciona.
- **`tocar_updated_at()`** es una cuarta regla por corte. Propuse la guardia `updated_at_global` (ver [[auditoria-falla-cerrada]]).

En la crítica de la spec `niveles-categorias` (2026-10-10, segundo corte):
- **Caché por rol:** `['categorias']` devuelve solo activas a anon y todas al admin. Con `staleTime` 60 s y `clear()`
  solo en `SIGNED_OUT`, si alguien inicia sesión después de navegar el portal ve datos de anon. Propuse limpiar la caché
  cuando cambia el id del usuario (con un ref), no en cada `SIGNED_IN` (supabase-js lo reemite al volver el foco).
  Se repite en talleres (borradores) y en todo dominio con RLS por rol.
- **Datos fijos (niveles):** propuse una constante `satisfies NivelEducativo[]` más un pgTAP con las filas exactas,
  en lugar de un hook con carga y error en siete pantallas.
- Se repitió lo del form de edición sin guarda y lo de la función pura (`esNombreDuplicado`) en `consultas.ts`.
- Las specs suelen olvidar las pantallas vecinas que se rompen con el cambio de tipos (`TalleresListPage`). Hacer grep
  de los símbolos que se eliminan.

En la crítica del código de `niveles-categorias` (2026-10-10), la respuesta está pendiente en `critica.md`:
- **Ids de ruta resueltos por pantalla:** cuatro páginas repetían parseo de `:nivelId`/`:categoriaId`, la escalera
  cargando/error/`null` y `NoEncontrado`, y divergieron (sin rama de error y sin comprobar que la categoría sea del nivel).
  Propuse rutas de layout (`<RutaNivel>`/`<RutaCategoria>` con `useOutletContext`), o como mínimo `idDeRuta` puro.
  Talleres agrega `:tallerId`: revisar si se adoptó.
- **Molde del pgTAP/migración:** el índice por FK es redundante si la FK es la primera columna de un índice único, y
  `has_table`/`relrowsecurity` por corte repiten `rls_global`. Los cortes copian el molde, así que hay que mirarlo.
- Condiciones de limpieza de caché con términos muertos (`SIGNED_OUT` sin cambio de usuario derivado): con un solo rol,
  una sesión sin marca ve lo mismo que anon.

**Why:** son errores de diseño que no saltan en el typecheck, y los cortes siguientes copian el patrón de este.

**How to apply:** en cada spec de corte, revisar los esperados de los tests pgTAP (qué código de error y en qué
orden), los defaults de la base contra el zod del formulario y que la sesión no se toque desde el callback. Ver la
`## Respuesta` de `docs/specs/auth-configuracion/critica.md` para saber qué se aceptó. Relacionado:
[[auditoria-falla-cerrada]], [[tipos-v1-vs-firma-hooks]].
