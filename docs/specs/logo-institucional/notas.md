# Notas (hallazgos bajos y decisiones diferidas de #23)

Salen de `critica.md` (crítica del código) y `revision.md`. No bloquean el PR.

- **`staleTime: 60_000` en `useConfiguracion`** es un parche de test: es el mismo valor global de `AppProviders`, así que en producción no cambia nada; solo existe porque `crearQueryClient` (`src/test/utils.tsx`) no fija `staleTime` y `LogoInstitucional` abre un segundo observador de la misma query. Alternativa: quitar la línea, dejar que el global decida y ajustar la aserción de `ConfiguracionPage.test.tsx` («Reintentar vuelve a consultar») para contar las llamadas antes y después.
- **El formato del logo se calcula tres veces** (`validarLogo`, `rutaNueva`, `mimeDeLogo` llaman a `formatoDe`) y `consultas.ts` importa `archivos` solo para el MIME, contra el molde de recursos. Alternativa: exportar `formatoDeLogo(file)`, resolverlo una vez en `secuencias.cambiarLogo` y pasar `rutaNueva(ext)` y `subirLogo(ruta, file, mime)`. `cambiarLogo` se puede llamar sin `validarLogo`: el `throw` sale como rechazo, da el mensaje genérico y no sube nada.
- **`config?.nombre || 'Sitio institucional'` copiado tres veces** (`PublicHeader`, `PublicFooter`, `AdminSidebar`). Que `useLogo()` devuelva también `nombre` (ya lo proponía el punto 7 de la crítica de la spec).
- **`Favicon.tsx`: la rama que crea el `<link>`** nunca se usa en producción (`index.html` siempre lo trae). Se podría reemplazar por `querySelector(...)?.setAttribute('href', …)` y borrar su test.
- **`scripts/storage/referencias.ts`** existe para probar un literal de 4 líneas; se podría volver a `leerReferencias` y borrar el módulo y su test.
- **Safari y el favicon dinámico:** sin verificar; marcadores y buscadores usan el estático.
- **Prueba manual** (verificación de punta a punta de la spec): cortar la red a mitad de un cambio de logo y comprobar con `npm run storage:limpiar` en simulación que informa el huérfano.
