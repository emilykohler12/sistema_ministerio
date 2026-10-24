# Revisión 1

Plan: `docs/specs/cierre-inactividad/plan.md` (#22). Cambio sin commitear en `feat/cierre-inactividad`.

## Veredicto
Cambios necesarios

Los tres pasos del plan están implementados y tienen test. El hook se llama antes de los early returns de `AdminLayout`. No hay fugas
de listeners ni de intervalos. `AdminLayout` no se vuelve a renderizar cada segundo: el hook solo cambia de estado al aparecer el aviso
y al vencer, y el reloj vive en `AvisoInactividad`, que se monta solo con el aviso. No hay doble cierre (`vencida` en el cierre del
efecto). El `role` nuevo de `Dialog` toma `'dialog'` por defecto y ningún otro uso lo pasa (grep). Hay que corregir tres problemas.

## Problemas

- **[importante]** `src/features/auth/useInactividad.ts:61-64` y `:34-38`. Una actividad o un "Seguir conectado" que llega después
  del límite, pero antes del próximo tic, reinicia el plazo en lugar de cerrar la sesión. `alActividad` solo mira `avisoVisible`, y
  `extender` no compara con el límite. Si el temporizador se demoró (suspensión del equipo o pantalla bloqueada con la pestaña
  visible, donde `visibilitychange` no siempre se dispara), el primer `pointerdown` o `keydown` deja `ultimaActividad = Date.now()` y la
  sesión no vence nunca. Lo mismo pasa si el aviso quedó abierto y el equipo se durmió: al volver, el clic en el botón extiende una
  sesión que ya venció. Esto anula la decisión del plan de medir con la hora del sistema. Además, el listener de `visibilitychange`
  (`:72`) no tiene test: si se borra la línea, todo sigue verde.
  Arreglo: en `alActividad`, llamar primero a `revisar()` y salir si `vencida || avisoVisible.current`. En `extender`, no reiniciar si
  `Date.now() - ultimaActividad.current >= limiteMs` (o llamar a `revisar` por un ref). Tests: con `vi.setSystemTime(+31 min)` y **sin**
  avanzar los temporizadores, (a) despachar `pointerdown` llama a `onVencida`, (b) llamar a `extender()` con el aviso visible no
  reinicia, (c) despachar `visibilitychange` llama a `onVencida`.

- **[importante]** `src/shared/components/ui/Dialog.tsx:38-51` y `src/shared/hooks/useFocusTrap.ts:22-26`. El aviso se abre encima
  de otro `Dialog` del panel, y esto pasa en la práctica: el admin deja abierto `DialogoRecurso`, `ConfirmDialog`, `DialogoVincular` o
  `DialogoCrear` y se va. Hay dos fallas:
  1. Los dos diálogos tienen `id="dialog-title"` (y `dialog-description`). `aria-labelledby` toma el primero del DOM, que es el del
     diálogo de abajo (vive dentro de `<main>`, antes del aviso). El `alertdialog` se anuncia como "Agregar recurso" o como el título
     del `ConfirmDialog`, y con un `ConfirmDialog` debajo también se anuncia la descripción equivocada.
  2. Cada `useFocusTrap` registra su `keydown` en `document`. Escape en el aviso llama a los dos `onClose`: mantiene la sesión
     **y cierra el diálogo de abajo**, con lo que se pierde lo que el admin tenía a medio cargar (el formulario a medias que pide
     revisar el punto 3). El handler del diálogo de abajo se registró antes, así que un `stopImmediatePropagation` en el aviso no
     alcanza.
  Arreglo: ids con `useId()` en `Dialog`. En `useFocusTrap`, una pila a nivel de módulo, de modo que solo el diálogo de arriba atienda
  Escape y Tab. Test en `AdminLayout.test.tsx`: un hijo del `Outlet` con un `Dialog` abierto; a los 28 min,
  `getByRole('alertdialog', { name: 'Tu sesión está por cerrarse' })`, y Escape no llama al `onClose` del otro.

- **[importante]** `src/pages/admin/LoginPage.tsx:59-66`. El aviso "Tu sesión se cerró por inactividad" es un `role="status"` que se
  monta junto con su texto, y la página no mueve el foco. Una región viva que aparece con el contenido ya puesto no se anuncia de
  forma confiable, así que el usuario de lector de pantalla llega al login sin saber por qué. Es el mismo patrón que ya se marcó en
  instituciones-sin-vincular.
  Arreglo: `role="alert"` (los lectores lo anuncian al insertarse), o que el campo de correo o el formulario lo referencien con
  `aria-describedby`. Ajustar el test a ese rol.

- **[importante]** `docs/arquitectura.md:123` sigue diciendo "cierre por inactividad (§5.2) pendientes", y la fila `auth` no
  menciona `useInactividad`, `restante.ts` ni `components/AvisoInactividad`. Actualizar las dos cosas antes de cerrar.

### Observación (no bloquea, conviene abrir un issue)
- `AdminLayout.tsx:30` y `useInactividad.ts:50-54`. Si `signOut` no borra la sesión, el panel queda abierto con el temporizador
  muerto: `vencida = true` y el intervalo ya está limpio. En auth-js 2.117.3 pasa cuando el access token ya venció y el refresh falla
  por red. `_useSession` devuelve `AuthRetryableFetchError` y `_signOut` retorna sin `_removeSession` (`GoTrueClient.js:3431`). Hace
  falta estar sin red más que el tiempo de vida del token, así que es raro. Si pasa, un clic posterior ya no reinicia nada y la
  sesión sigue en `sessionStorage`.
  Opción: tras el `cerrarSesion`, si el usuario sigue presente, reintentar o tratar `vencidaPorInactividad` como sesión cerrada en
  la UI.

## Respuestas a los puntos pedidos

1. **Fugas y re-renders:** no hay. Los listeners se quitan con la misma `capture` y los intervalos se limpian en el cleanup y al vencer.
   `onVencida` va en un ref. El test de desmontaje solo comprueba que se llamó `removeEventListener` con cada tipo, no con el mismo
   handler, pero la implementación es correcta.
2. **Orden de hooks:** `useInactividad` está antes de `if (cargando)` y de `if (!usuario)`. Correcto.
3. **Carreras:** el doble cierre está cubierto. "Extender justo al vencer" falla si el tic se demoró (primer hallazgo); con los tics
   en hora, la gracia es de 1 s como máximo. Una mutación en vuelo termina con el JWT vigente; `queryClient.clear()` en `SIGNED_OUT`
   no la cancela, y no veo un daño concreto. El formulario a medias se pierde por Escape con dos diálogos (segundo hallazgo); por
   vencimiento es lo que pide §5.2.
4. **Tests:** fallan sin la implementación en todos los casos que revisé (por ejemplo, si `extender` no reiniciara, la prueba de 29 min
   de `AdminLayout` llamaría a `cerrarSesion`). Usan `advanceTimersByTime` con márgenes de 1 s y un intervalo determinista, así que no
   son frágiles. Faltan los casos sin tic (primer hallazgo) y el de dos diálogos.
5. **Accesibilidad del aviso:** el foco cae en "Seguir conectado" (el efecto hijo del `Dialog` corre antes y el del aviso lo
   corrige), Escape y el clic en el fondo mantienen la sesión, `role="timer"` no es región viva, y el `status` cambia solo en cuatro
   hitos, con tests. El nombre accesible se rompe con otro diálogo debajo (segundo hallazgo).
6. **Desvío 2 (la actividad ambiente no cancela el aviso):** es correcto y conviene mantenerlo. Un `alertdialog` pide una respuesta
   explícita. Si se ocultara con un `scroll` o un `Tab`, desaparecería debajo de la mano del usuario sin que sepa que extendió la
   sesión, y un lector de pantalla anunciaría un diálogo que se va solo. Con el foco atrapado, cualquier clic (botón o fondo), Enter,
   Espacio y Escape ya extienden, así que un usuario presente no queda atrapado (WCAG 2.2.1). Anotarlo en "Decisiones" del plan.
7. **`Dialog` con `role`:** no cambia los otros cinco usos (`DescargaModal`, `DialogoRecurso`, `DialogoVincular`, `DialogoCrear`,
   `ConfirmDialog`). El problema de los ids fijos ya existía, pero recién ahora puede haber dos diálogos abiertos a la vez.
8. **State del login:** `Navigate replace` reemplaza la entrada de `/admin`. Tras un login exitoso, `Navigate replace` hacia `from`
   descarta el `motivo`, y un cierre manual posterior monta un `AdminLayout` nuevo, sin la marca. Al recargar `/admin/login`, el
   mensaje reaparece porque `history.state` sobrevive a la recarga; sigue siendo verdad y no lo considero un defecto. La única forma
   de que aparezca un motivo equivocado es la observación de `signOut`.

## ¿Correr qa?
Sí, después de los arreglos. jsdom no cubre lo que más importa acá. Con `page.clock` de Playwright (adelantar 28 y 30 min) conviene
probar:
- el aviso, "Seguir conectado" y el vencimiento hasta el login con el mensaje;
- el aviso encima de `DialogoRecurso` abierto, con Escape (el diálogo de abajo tiene que seguir abierto con lo cargado);
- volver a una pestaña oculta pasados los 30 min (`visibilitychange`);
- dónde queda el foco al cerrar el aviso.

## Evidencia
- `npm run lint`: 0 errores, 4 warnings preexistentes (`TallerFormPage`, `ConfiguracionPage`, `AuthContext`, `DescargaModal`), ninguno
  en archivos tocados.
- `npm run typecheck` (`tsc -b`): sin errores.
- `npm test`: 85 archivos, 1471 tests, todos pasan.
- No se corrieron `test:e2e` ni `db:reset` (pedido del coordinador). No pude reproducir los dos diálogos en un test aparte: el rol
  revisor no puede escribir fuera del proyecto. El segundo hallazgo sale de leer el código: los ids son literales y los dos handlers
  de `keydown` están en `document`.

# Revisión 2

Alcance: el delta de la ronda (sin commitear). Diálogos apilados (`Dialog.tsx` con `useId`, `useFocusTrap.ts` con una pila de módulo y
sus tests, `Dialog.test.tsx`, `AdminLayout.test.tsx`), `useInactividad.ts` y su test, y `LoginPage` con `role="alert"`.

## Veredicto
Cambios necesarios

Los cuatro hallazgos de la Revisión 1 están resueltos y tienen test. Quedan dos problemas en la pila de `useFocusTrap`. Uno es de
comportamiento: el diálogo de abajo, si se cierra primero, saca el foco del de arriba. El otro es un test que no prueba lo que dice.
Los dos se arreglan con pocas líneas.

## Problemas

- **[importante]** `src/shared/hooks/useFocusTrap.ts:54-58`. Si el diálogo de **abajo** se cierra mientras el de arriba sigue abierto,
  su cleanup ejecuta `previouslyFocused?.focus()` y el foco sale del `alertdialog` hacia el disparador del diálogo de abajo, que está en
  `<main>`, detrás del fondo. El caso existe: `DialogoRecurso` se cierra solo cuando termina `onSubmit` (`DialogoRecurso.tsx:77-78`).
  El admin sube un archivo grande, se va, aparece el aviso y la subida termina con el aviso abierto. Pasan tres cosas:
  1. El foco queda detrás del modal. La trampa de arriba solo da la vuelta si el foco está en su primer o en su último elemento, así
     que Tab recorre la página de atrás.
  2. Enter sobre ese botón vuelve a abrir un `DialogoRecurso`. Ese diálogo nuevo queda arriba en la pila pero se dibuja debajo del
     aviso (está antes en el DOM y tiene el mismo `z-50`). Escape lo cierra a él y no al aviso.
  3. Cuando después se cierra el aviso, su `previouslyFocused` es un nodo que ya no está en el DOM, y el foco cae en `body`.

  Que el de arriba restaure el foco al cerrarse antes funciona bien, y lo cubre el último test del bloque.

  Arreglo: que cada entrada de la pila guarde su `previouslyFocused`. En el cleanup, si la entrada era la de arriba, se restaura el foco
  como ahora. Si no lo era, no se mueve el foco y la entrada que sigue arriba hereda ese destino
  (`pila[i].previouslyFocused = entrada.previouslyFocused`, porque la suya apuntaba dentro del diálogo que se fue).

  Test: con dos trampas, desactivar la de abajo deja el foco en `otroPrimero`. Al desmontar después la de arriba, el foco vuelve al
  disparador original de la de abajo.

- **[importante]** `src/shared/hooks/useFocusTrap.test.ts:122-136` ("una trampa que se desactiva sale de la pila aunque no sea la de
  arriba"). El test es vacuo: desmonta la de arriba **antes** del Escape, así que no quedan listeners y pasa con cualquier pila. Pasa
  sin la pila. Pasa con un `pila.pop()` en el cleanup, que al desactivar la de abajo quitaría el token de la de arriba y la dejaría sin
  Escape ni Tab. Pasa también con un cleanup que no quite el token cuando no es el de arriba, que es justo el token huérfano que el
  test dice cubrir.

  Arreglo: tres trampas A, B y C. Al desactivar B (la del medio), Escape tiene que llamar a C (eso detecta el `pop`). Al desmontar C,
  Escape tiene que llamar a A (eso detecta el huérfano). Con dos trampas solo se detecta el `pop`.

### Observación (sigue abierta de la Revisión 1)
- `src/shared/components/layout/AdminLayout.tsx:30`. El comentario "signOut borra la sesión local aunque falle la red" no es exacto. Con
  el access token vencido y sin red, auth-js 2.117.3 no borra la sesión, y el panel queda abierto con el temporizador muerto
  (`vencidaRef = true`). No bloquea. Según CLAUDE.md va como issue: no veo uno en el plan ni en la revisión, y el rol revisor no puede
  consultar `gh`. Corregir el comentario o abrir el issue antes del PR.

## Respuestas a los puntos pedidos

1. **Limpieza de la pila.** El token se agrega solo cuando el efecto pasa los dos `return` tempranos, y el cleanup existe solo en ese
   caso. Cada push tiene exactamente un `splice(indexOf(token), 1)`, así que `indexOf` nunca da `-1` (que con `splice(-1, 1)` borraría el
   de arriba). StrictMode (montar, limpiar, montar) queda balanceado: el cleanup simulado restaura el foco y el segundo montaje lo
   vuelve a capturar. El remount por `key` y el cambio entre `DialogoVincular` y `DialogoCrear` en un mismo commit limpian el viejo antes
   de agregar el nuevo. La desactivación sin desmontar (`open=false`, porque `active` está en las dependencias) también limpia. No
   encontré un camino a un token huérfano con la implementación actual. El único que llega a dejar un diálogo sin teclado es el del
   primer hallazgo, y lo hace por el foco, no por la pila.
   Restaurar el foco cuando se cierra primero el de abajo **no** funciona (primer hallazgo).
2. **Estado de módulo y tests.** Vitest aísla los módulos por archivo y `src/test/setup.ts` llama a `cleanup()` en cada `afterEach`, que
   desmonta todos los `renderHook` y `render`. La pila queda vacía entre tests aunque uno falle. No hay contaminación.
3. **Otros usos de `Dialog`.** Hay cinco: `DescargaModal`, `DialogoRecurso` (dos instancias en `RecursosPage`), `ConfirmDialog` (cinco
   pantallas), `DialogoVincular` y `DialogoCrear`. Más el aviso. Hoy ninguno abre dos a la vez: `SinVincularPage` usa un único estado
   `dialogo` y `RecursosPage` los abre por separado. Con un solo token, la guarda de la pila siempre deja pasar el evento y el
   comportamiento no cambia. Ningún archivo de `src/` ni de `e2e/` usaba `#dialog-title` ni `#dialog-description` (grep), así que
   `useId` no rompe selectores. `TagInput` maneja sus teclas con `onKeyDown` en el input y no depende de la trampa.
4. **¿Fallan sin la implementación?**
   - Sin `useId` fallan `Dialog.test.tsx` ("cada diálogo apilado…") y el nombre accesible en `AdminLayout.test.tsx`.
   - Sin la pila fallan "Escape solo lo atiende la de arriba", "Tab con foco en el último de la de abajo no se redirige" y el Escape
     de `AdminLayout.test.tsx`.
   - Sin la pila pasan "al desmontar la de arriba…", "Tab en el último de la de arriba…" y "al cerrar la de arriba el foco vuelve…".
     Valen como regresión.
   - "Una trampa que se desactiva…" es vacuo (segundo hallazgo).
   - Los cuatro tests nuevos de `useInactividad` (sin tic: `pointerdown`, `extender`, `visibilitychange` y la repetición después de
     cerrar) fallan con el código de la Revisión 1, porque los tres caminos reiniciaban o no revisaban.
5. **`useInactividad`.** Cierra bien. `alActividad` y `extender` llaman primero a `revisar`, que con el plazo vencido marca `vencidaRef`,
   limpia el intervalo, oculta el aviso y llama una sola vez a `onVencida`. Después, tanto los eventos como `extender` salen sin tocar
   `ultimaActividad`. `revisarRef` se asigna antes de crear el intervalo y se anula en el cleanup, así que `extender` sin el hook activo
   no revisa nada. El intervalo se limpia al vencer y en el cleanup, y los tests de desmontaje y de `activo=false` comprueban
   `getTimerCount() === 0`. Una actividad entre los 28 y los 30 min sin tic (equipo dormido) ahora muestra el aviso en lugar de
   reiniciar el plazo, como dice la decisión del plan.
6. **`LoginPage`.** `role="alert"` y su test cubren el hallazgo. Sin el motivo no aparece ninguna alerta. `docs/arquitectura.md` ya
   describe el dominio `auth` y sacó el "pendiente".

## Evidencia
- `npm run lint` (oxlint): 0 errores y 4 warnings, los mismos de antes (`ConfiguracionPage`, `TallerFormPage`, `AuthContext`,
  `DescargaModal`). Ninguno está en archivos tocados.
- `npm run typecheck` (`tsc -b`): sin errores.
- `npm test`: 86 archivos y 1485 tests, todos pasan.
- No se corrieron `test:e2e` ni `db:reset`. El análisis de que el test es vacuo y de la restauración del foco sale de leer el código:
  el rol revisor no puede escribir un test fuera del proyecto para comprobarlo.
