import { describe, expect, it } from 'vitest'
import { esquemaDescarga } from './esquema'
import { CARGOS, type DatosDescarga } from './types'

/*
 * Contrato (corte descargas, criterio 2). src/features/descargas/esquema.ts, puro:
 *   esquemaDescarga: z.object con los mismos límites que la base (registro_descarga) y los refine de "Otro" y "Otra".
 *   Entrada = DatosDescarga (types.ts):
 *     { cargo: string; cargo_otro?: string | null; localidad_id: number;
 *       institucion_tipo: 'PADRON' | 'OTRA' | 'SIN_INSTITUCION';
 *       establecimiento_id?: number | null; institucion_otra?: string | null }
 *   - cargo: uno de CARGOS = ['Director/a', 'Vicedirector/a', 'Secretario/a', 'Docente', 'Supervisor/a', 'Otro']
 *   - cargo "Otro": cargo_otro obligatorio (recortado), 1 a 100 caracteres. Con otro cargo, un cargo_otro residual se acepta
 *     (la RPC lo anula).
 *   - institucion_tipo 'OTRA': institucion_otra obligatoria (recortada), 1 a 200. Con otro tipo se acepta un residual.
 *   - institucion_tipo 'PADRON': establecimiento_id obligatorio. Con otro tipo, un id residual se acepta (la RPC lo anula).
 *   - localidad_id: entero positivo.
 *   Los errores de campo traen el nombre del campo en `path[0]`.
 */
const base: DatosDescarga = {
  cargo: 'Docente',
  cargo_otro: null,
  localidad_id: 1,
  institucion_tipo: 'SIN_INSTITUCION',
  establecimiento_id: null,
  institucion_otra: null,
}

const camposConError = (datos: unknown) => {
  const r = esquemaDescarga.safeParse(datos)
  return r.success ? [] : r.error.issues.map((i) => String(i.path[0]))
}

describe('CARGOS', () => {
  it('son los seis cargos de la base, con "Otro" al final', () => {
    expect([...CARGOS]).toEqual(['Director/a', 'Vicedirector/a', 'Secretario/a', 'Docente', 'Supervisor/a', 'Otro'])
  })
})

describe('esquemaDescarga', () => {
  it('acepta Docente sin institución', () => {
    expect(esquemaDescarga.safeParse(base).success).toBe(true)
  })

  it('acepta cada cargo de la lista', () => {
    for (const cargo of CARGOS) {
      const datos = { ...base, cargo, cargo_otro: cargo === 'Otro' ? 'Bibliotecario' : null }
      expect(esquemaDescarga.safeParse(datos).success, cargo).toBe(true)
    }
  })

  it('rechaza un cargo que no está en la lista', () => {
    expect(camposConError({ ...base, cargo: 'Ministro' })).toContain('cargo')
    expect(camposConError({ ...base, cargo: '' })).toContain('cargo')
  })

  it('rechaza una localidad ausente, cero o no entera', () => {
    expect(camposConError({ ...base, localidad_id: 0 })).toContain('localidad_id')
    expect(camposConError({ ...base, localidad_id: 1.5 })).toContain('localidad_id')
    expect(camposConError({ ...base, localidad_id: undefined })).toContain('localidad_id')
  })

  describe('cargo "Otro"', () => {
    const otro = { ...base, cargo: 'Otro' }

    it('exige cargo_otro: ausente, nulo, vacío o solo espacios se rechazan', () => {
      for (const cargo_otro of [undefined, null, '', '   ']) {
        expect(camposConError({ ...otro, cargo_otro }), String(cargo_otro)).toContain('cargo_otro')
      }
    })

    it('acepta de 1 a 100 caracteres y rechaza 101', () => {
      expect(esquemaDescarga.safeParse({ ...otro, cargo_otro: 'x' }).success).toBe(true)
      expect(esquemaDescarga.safeParse({ ...otro, cargo_otro: 'x'.repeat(100) }).success).toBe(true)
      expect(camposConError({ ...otro, cargo_otro: 'x'.repeat(101) })).toContain('cargo_otro')
    })

    it('recorta los espacios de los extremos antes de medir', () => {
      const r = esquemaDescarga.safeParse({ ...otro, cargo_otro: `  ${'x'.repeat(100)}  ` })
      expect(r.success).toBe(true)
      if (r.success) expect(r.data.cargo_otro).toBe('x'.repeat(100))
    })

    it('con otro cargo, un cargo_otro residual no invalida el formulario', () => {
      expect(esquemaDescarga.safeParse({ ...base, cargo: 'Docente', cargo_otro: 'residual' }).success).toBe(true)
    })
  })

  describe('institución "Otra"', () => {
    const otra = { ...base, institucion_tipo: 'OTRA' as const }

    it('exige institucion_otra: ausente, nula, vacía o solo espacios se rechazan', () => {
      for (const institucion_otra of [undefined, null, '', '   ']) {
        expect(camposConError({ ...otra, institucion_otra }), String(institucion_otra)).toContain('institucion_otra')
      }
    })

    it('acepta de 1 a 200 caracteres y rechaza 201', () => {
      expect(esquemaDescarga.safeParse({ ...otra, institucion_otra: 'x' }).success).toBe(true)
      expect(esquemaDescarga.safeParse({ ...otra, institucion_otra: 'x'.repeat(200) }).success).toBe(true)
      expect(camposConError({ ...otra, institucion_otra: 'x'.repeat(201) })).toContain('institucion_otra')
    })

    it('recorta los espacios de los extremos', () => {
      const r = esquemaDescarga.safeParse({ ...otra, institucion_otra: '  Escuela 5  ' })
      expect(r.success).toBe(true)
      if (r.success) expect(r.data.institucion_otra).toBe('Escuela 5')
    })

    it('con otro tipo, una institucion_otra residual no invalida el formulario', () => {
      expect(esquemaDescarga.safeParse({ ...base, institucion_otra: 'residual' }).success).toBe(true)
    })
  })

  describe('institución del padrón', () => {
    const padron = { ...base, institucion_tipo: 'PADRON' as const }

    it('exige establecimiento_id', () => {
      expect(camposConError({ ...padron, establecimiento_id: null })).toContain('establecimiento_id')
      expect(camposConError({ ...padron, establecimiento_id: undefined })).toContain('establecimiento_id')
    })

    it('acepta un establecimiento', () => {
      expect(esquemaDescarga.safeParse({ ...padron, establecimiento_id: 12 }).success).toBe(true)
    })

    it('con otro tipo, un establecimiento_id residual no invalida el formulario', () => {
      expect(esquemaDescarga.safeParse({ ...base, establecimiento_id: 12 }).success).toBe(true)
    })
  })

  it('rechaza un tipo de institución desconocido', () => {
    expect(camposConError({ ...base, institucion_tipo: 'OTRO' })).toContain('institucion_tipo')
  })
})
