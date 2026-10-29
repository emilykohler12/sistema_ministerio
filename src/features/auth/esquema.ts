import { z } from 'zod'

const LIMITE_BYTES = 72

export const esquemaRecuperacion = z.object({
  correo: z.email('Ingresá un correo válido'),
})

export const esquemaNuevaContrasena = z
  .object({
    password: z
      .string()
      .min(8, 'La contraseña debe tener al menos 8 caracteres')
      .refine(
        (p) => new TextEncoder().encode(p).length <= LIMITE_BYTES,
        'Usá como máximo 72 caracteres (menos si tiene tildes o ñ)',
      ),
    confirmacion: z.string(),
  })
  .refine((v) => v.password === v.confirmacion, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmacion'],
  })

export type DatosRecuperacion = z.infer<typeof esquemaRecuperacion>
export type DatosNuevaContrasena = z.infer<typeof esquemaNuevaContrasena>
