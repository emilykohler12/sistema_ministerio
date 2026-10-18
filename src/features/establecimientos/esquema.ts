import { z } from 'zod'

// Espejo de la base: nombre no vacío (sin espacios en los bordes) de hasta varchar(200); CUE vacío -> null,
// solo dígitos y hasta varchar(20); localidad obligatoria.
export const esquemaEstablecimiento = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, 'Ingresá el nombre del establecimiento')
    .max(200, 'El nombre no puede superar los 200 caracteres'),
  cue: z
    .string()
    .trim()
    .max(20, 'El CUE no puede superar los 20 dígitos')
    .regex(/^[0-9]*$/, 'El CUE solo puede tener dígitos')
    .transform((valor) => (valor === '' ? null : valor)),
  localidad_id: z.string().min(1, 'Elegí una localidad').transform(Number),
})
