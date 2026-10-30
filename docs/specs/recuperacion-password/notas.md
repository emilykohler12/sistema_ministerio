# Notas de #21 (hallazgos bajos que no entran en el corte)

- **`PantallaAuth` compartida.** La tarjeta de las pantallas de auth está en `LoginPage`, `RecuperarPage` y `NuevaContrasenaPage`, con las mismas clases de avisos y el mensaje «Tu cuenta no tiene
  permisos de administrador» duplicado. Extraer `features/auth/components/PantallaAuth.tsx` (`{ titulo, descripcion?, children }`) y un `MENSAJE_SIN_PERMISO` cuando #34 sume una cuarta pantalla.
- **`MotivoLogin` tipado.** `LoginPage` lee `location.state.motivo` con un cast y `NuevaContrasenaPage` y `AdminLayout` mandan el texto suelto. Exportar `type MotivoLogin = 'inactividad' | 'contrasena-actualizada'`
  y usar `satisfies` en los `navigate`. Toca `AdminLayout`.
- **Sesión de recuperación tras un fallo.** Si `updateUser` falla y la persona abandona o recarga, queda la sesión que abrió `verifyOtp` en el `sessionStorage` de la pestaña. Aceptado en #21; ver el issue propuesto.
