import { describe, expect, it } from 'vitest'
import { esquemaEstablecimiento } from './esquema'

/*
 * Contrato de src/features/establecimientos/esquema.ts (puro; sale de EstablecimientoFormPage, espejo de la base):
 *   esquemaEstablecimiento: z.object({ nombre, cue, localidad_id })
 *     nombre       trim, 1..200   -> 'Ingresá el nombre del establecimiento' / 'El nombre no puede superar los 200 caracteres'
 *     cue          trim, "" -> null, solo dígitos, hasta 20 -> 'El CUE solo puede tener dígitos' / 'El CUE no puede superar los 20 dígitos'
 *     localidad_id string no vacío -> number   -> 'Elegí una localidad'
 *   El diálogo "Crear establecimiento" usa esquemaEstablecimiento.omit({ localidad_id: true }).
 */
const valido = { nombre: 'Escuela 1', cue: '5400123', localidad_id: '2' }

function mensajes(entrada: unknown, campo: string): string[] {
  const r = esquemaEstablecimiento.safeParse(entrada)
  if (r.success) return []
  return r.error.issues.filter((i) => i.path[0] === campo).map((i) => i.message)
}

describe('esquemaEstablecimiento', () => {
  it('acepta datos válidos y convierte la localidad a número', () => {
    expect(esquemaEstablecimiento.parse(valido)).toEqual({ nombre: 'Escuela 1', cue: '5400123', localidad_id: 2 })
  })

  it('recorta el nombre y el CUE', () => {
    const r = esquemaEstablecimiento.parse({ ...valido, nombre: '  Escuela 1  ', cue: ' 123 ' })
    expect(r.nombre).toBe('Escuela 1')
    expect(r.cue).toBe('123')
  })

  it('rechaza un nombre vacío o en blanco', () => {
    expect(mensajes({ ...valido, nombre: '   ' }, 'nombre')).toEqual(['Ingresá el nombre del establecimiento'])
  })

  it('rechaza un nombre de más de 200 caracteres y acepta uno de exactamente 200', () => {
    expect(mensajes({ ...valido, nombre: 'a'.repeat(201) }, 'nombre')).toEqual([
      'El nombre no puede superar los 200 caracteres',
    ])
    expect(esquemaEstablecimiento.safeParse({ ...valido, nombre: 'a'.repeat(200) }).success).toBe(true)
  })

  it('un CUE vacío o en blanco queda en null', () => {
    expect(esquemaEstablecimiento.parse({ ...valido, cue: '' }).cue).toBeNull()
    expect(esquemaEstablecimiento.parse({ ...valido, cue: '   ' }).cue).toBeNull()
  })

  it('rechaza un CUE con letras', () => {
    expect(mensajes({ ...valido, cue: '54A0' }, 'cue')).toEqual(['El CUE solo puede tener dígitos'])
  })

  it('rechaza un CUE de más de 20 dígitos y acepta uno de 20', () => {
    expect(mensajes({ ...valido, cue: '1'.repeat(21) }, 'cue')).toEqual(['El CUE no puede superar los 20 dígitos'])
    expect(esquemaEstablecimiento.safeParse({ ...valido, cue: '1'.repeat(20) }).success).toBe(true)
  })

  it('exige elegir una localidad', () => {
    expect(mensajes({ ...valido, localidad_id: '' }, 'localidad_id')).toEqual(['Elegí una localidad'])
  })

  it('con omit({ localidad_id: true }) valida solo nombre y CUE', () => {
    const sinLocalidad = esquemaEstablecimiento.omit({ localidad_id: true })
    expect(sinLocalidad.parse({ nombre: ' Escuela 9 ', cue: '' })).toEqual({ nombre: 'Escuela 9', cue: null })
    expect(sinLocalidad.safeParse({ nombre: '', cue: '' }).success).toBe(false)
  })
})
