// @vitest-environment node
// armarReferencias es pura: arma las referencias por bucket a partir de las filas ya leídas de la base.
//
// Firma asumida:
//   armarReferencias({ recursos, normativas, configuracion }) -> Referencias (bucket -> rutas que alguna fila referencia)
//   recursos: { ruta_archivo: string | null }[]   (los enlaces no tienen archivo)
//   normativas: { ruta_archivo: string }[]
//   configuracion: { logo_ruta: string | null }   (la fila única; quien la lee falla cerrada si no existe: sin la
//                                                  fila no se sabría qué logo está en uso y todo el bucket parecería huérfano)
import { describe, expect, it } from 'vitest'
import { armarReferencias } from './referencias.ts'

describe('armarReferencias', () => {
  it('arma una clave por bucket con las rutas de cada tabla', () => {
    const referencias = armarReferencias({
      recursos: [{ ruta_archivo: '1/a.pdf' }, { ruta_archivo: '2/b.png' }],
      normativas: [{ ruta_archivo: 'n1.pdf' }],
      configuracion: { logo_ruta: 'l1.png' },
    })
    expect(referencias).toEqual({ talleres: ['1/a.pdf', '2/b.png'], normativas: ['n1.pdf'], logo: ['l1.png'] })
  })

  it('descarta los recursos sin archivo (enlaces)', () => {
    const referencias = armarReferencias({
      recursos: [{ ruta_archivo: null }, { ruta_archivo: '1/a.pdf' }],
      normativas: [],
      configuracion: { logo_ruta: null },
    })
    expect(referencias.talleres).toEqual(['1/a.pdf'])
  })

  it('con logo_ruta null el bucket logo no tiene referencias, pero la clave existe', () => {
    const referencias = armarReferencias({ recursos: [], normativas: [], configuracion: { logo_ruta: null } })
    expect(referencias).toHaveProperty('logo', [])
  })
})
