import { describe, expect, it } from 'vitest'
import { ENTIDADES_FILTRABLES, describir, entidadDeTabla, esEntidad, tablasDeEntidad } from './entidades'
import type { Operacion } from './types'

/*
 * Contrato (spec criterios 1 y 3; crítica 4 y 5, respuesta):
 *   entidadDeTabla(tabla: string): string      // etiqueta de la entidad; una tabla desconocida se muestra con su nombre físico
 *   ENTIDADES_FILTRABLES: { valor: string; etiqueta: string; tablas: string[] }[]   // sin Nivel, Localidad ni Destinatario
 *   esEntidad(valor: string): boolean          // ¿es un `valor` de ENTIDADES_FILTRABLES?
 *   tablasDeEntidad(valor: string): string[]   // las tablas físicas del filtro
 *   describir(op: Operacion): string
 *     - nombre (o título, en normativa) de `datos_nuevos ?? datos_anteriores`; si no hay, `#<registro_id>`
 *     - puentes (registro_id NULL): "<col1> <v1> · <col2> <v2>" con los dos ids, en el orden de las columnas del jsonb
 *   El mapa interno es un Record<Exclude<keyof Tables, 'registro_operacion'>, Entidad> con satisfies (lo verifica typecheck).
 */
function op(p: Partial<Operacion>): Operacion {
  return {
    id: 1,
    usuario_id: null,
    operacion: 'INSERT',
    tabla: 'taller',
    registro_id: '7',
    datos_anteriores: null,
    datos_nuevos: null,
    fecha_hora: '2026-10-16T12:00:00Z',
    ...p,
  }
}

describe('entidadDeTabla', () => {
  it.each([
    ['taller', 'Taller'],
    ['taller_destinatario', 'Taller'],
    ['taller_etiqueta', 'Taller'],
    ['normativa', 'Normativa'],
    ['normativa_etiqueta', 'Normativa'],
    ['categoria', 'Categoría'],
    ['recurso', 'Recurso'],
    ['establecimiento', 'Establecimiento'],
    ['etiqueta', 'Etiqueta'],
    ['configuracion', 'Configuración'],
    ['registro_descarga', 'Descarga'],
    ['nivel_educativo', 'Nivel'],
    ['localidad', 'Localidad'],
    ['destinatario', 'Destinatario'],
  ])('la tabla %s es la entidad %s', (tabla, entidad) => {
    expect(entidadDeTabla(tabla)).toBe(entidad)
  })

  it('una tabla que ya no existe se muestra con su nombre físico', () => {
    expect(entidadDeTabla('tabla_vieja')).toBe('tabla_vieja')
  })
})

describe('ENTIDADES_FILTRABLES', () => {
  const valores = ENTIDADES_FILTRABLES.map((e) => e.valor)

  it('ofrece las entidades que el panel puede escribir', () => {
    expect(valores).toEqual(
      expect.arrayContaining([
        'taller',
        'categoria',
        'recurso',
        'normativa',
        'establecimiento',
        'etiqueta',
        'configuracion',
      ]),
    )
  })

  it('no ofrece Nivel, Localidad ni Destinatario (solo SELECT: siempre darían vacío)', () => {
    const tablas = ENTIDADES_FILTRABLES.flatMap((e) => e.tablas)
    expect(tablas).not.toContain('nivel_educativo')
    expect(tablas).not.toContain('localidad')
    expect(tablas).not.toContain('destinatario')
    const etiquetas = ENTIDADES_FILTRABLES.map((e) => e.etiqueta)
    expect(etiquetas).not.toContain('Nivel')
    expect(etiquetas).not.toContain('Localidad')
    expect(etiquetas).not.toContain('Destinatario')
  })

  it('Taller agrupa el taller y sus puentes; Normativa, la normativa y su puente', () => {
    expect([...tablasDeEntidad('taller')].sort()).toEqual(['taller', 'taller_destinatario', 'taller_etiqueta'])
    expect([...tablasDeEntidad('normativa')].sort()).toEqual(['normativa', 'normativa_etiqueta'])
  })

  it('cada valor y cada etiqueta son únicos y la etiqueta coincide con entidadDeTabla de sus tablas', () => {
    expect(new Set(valores).size).toBe(valores.length)
    expect(new Set(ENTIDADES_FILTRABLES.map((e) => e.etiqueta)).size).toBe(valores.length)
    for (const e of ENTIDADES_FILTRABLES) for (const t of e.tablas) expect(entidadDeTabla(t)).toBe(e.etiqueta)
  })

  it('una tabla no pertenece a dos entidades', () => {
    const tablas = ENTIDADES_FILTRABLES.flatMap((e) => e.tablas)
    expect(new Set(tablas).size).toBe(tablas.length)
  })
})

describe('esEntidad', () => {
  it('acepta un valor del selector y rechaza otro', () => {
    expect(esEntidad('taller')).toBe(true)
    expect(esEntidad('inventada')).toBe(false)
    expect(esEntidad('')).toBe(false)
    expect(esEntidad('nivel_educativo')).toBe(false)
  })
})

describe('describir', () => {
  it('usa el nombre de datos_nuevos', () => {
    expect(describir(op({ datos_nuevos: { id: 7, nombre: 'Taller de robótica' } }))).toBe('Taller de robótica')
  })

  it('en una normativa usa el título', () => {
    expect(describir(op({ tabla: 'normativa', datos_nuevos: { id: 7, titulo: 'Resolución 10', numero: '10' } }))).toBe(
      'Resolución 10',
    )
  })

  it('en una baja (solo datos_anteriores) usa el nombre anterior', () => {
    expect(
      describir(
        op({
          operacion: 'DELETE',
          datos_anteriores: { id: 7, nombre: 'Borrado' },
          datos_nuevos: null,
        }),
      ),
    ).toBe('Borrado')
  })

  it('en una modificación prefiere datos_nuevos (el nombre vigente)', () => {
    expect(
      describir(
        op({
          operacion: 'UPDATE',
          datos_anteriores: { id: 7, nombre: 'Viejo' },
          datos_nuevos: { id: 7, nombre: 'Nuevo' },
        }),
      ),
    ).toBe('Nuevo')
  })

  it('sin nombre ni título muestra #<registro_id>', () => {
    expect(
      describir(
        op({
          tabla: 'registro_descarga',
          registro_id: '42',
          datos_nuevos: { id: 42, cargo: 'Docente' },
        }),
      ),
    ).toBe('#42')
  })

  it('con jsonb nulo en ambos lados muestra #<registro_id>', () => {
    expect(describir(op({ registro_id: '9' }))).toBe('#9')
  })

  it('una puente (registro_id NULL) muestra sus dos ids', () => {
    expect(
      describir(
        op({
          tabla: 'taller_etiqueta',
          registro_id: null,
          datos_nuevos: { taller_id: 5, etiqueta_id: 12 },
        }),
      ),
    ).toBe('taller_id 5 · etiqueta_id 12')
  })

  it('una puente borrada toma los ids de datos_anteriores', () => {
    expect(
      describir(
        op({
          tabla: 'normativa_etiqueta',
          operacion: 'DELETE',
          registro_id: null,
          datos_anteriores: { normativa_id: 3, etiqueta_id: 8 },
        }),
      ),
    ).toBe('normativa_id 3 · etiqueta_id 8')
  })

  it('un nombre vacío cae a #<registro_id>', () => {
    expect(describir(op({ registro_id: '5', datos_nuevos: { id: 5, nombre: '' } }))).toBe('#5')
  })
})
