# QA 1 (retroactivo)

## Veredicto
Funciona con observaciones

## Qué probé (`e2e/auth-configuracion.spec.ts`)
- Credenciales inválidas: "Correo o contraseña incorrectos", no entra — pasó
- `sin-permiso@dam.local`: "Tu cuenta no tiene permisos de administrador", queda en login y `/admin` redirige al login — pasó
- `/admin`, `/admin/configuracion`, `/admin/talleres` sin sesión redirigen al login — pasó
- Recarga mantiene la sesión; `/admin/login` con sesión redirige a `/admin`; "Cerrar sesión" lleva al login y `/admin` vuelve a redirigir — pasó
- Configuración: editar nombre y misión, "Cambios guardados", un visitante anónimo (contexto aparte) los ve en la home; nombre vacío no guarda — pasó

## Bugs
Ninguno.

## Observaciones
- `/contacto` tiene teléfono, correo y dirección fijos en el código (0800 555 1234, info@educacion.gob.ar, Pizzurno 935 CABA) y no lee la configuración: editar esos campos en `/admin/configuracion` no cambia esa página. Spec criterio 6 habla de header, footer y Home, así que no incumple, pero es un dato de ejemplo visible al público. Confirmar si es intencional.
- El footer muestra solo el nombre; teléfono, correo y redes configurados no se ven en el portal fuera de lo que use la home.
- No verifiqué la fila en `registro_operacion` (cubierto por pgTAP).

## Evidencia
`npm run test:e2e`: 16 passed (5 de este spec).
