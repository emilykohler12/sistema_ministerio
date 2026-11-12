import { beforeEach, describe, expect, it, vi } from 'vitest'
import { borrarArchivo, subirArchivo } from '@/shared/lib/storage'
import { actualizarLogo, borrarLogo, subirLogo, urlLogo } from './consultas'
import type { Configuracion } from './types'

/*
 * Contrato (logo institucional, criterios 2, 4, 5 y 9). src/features/configuracion/consultas.ts, solo supabase:
 *   subirLogo(ruta: string, file: File): Promise<void>     // shared/lib/storage.subirArchivo('logo', ruta, file, mimeDeLogo(file))
 *   borrarLogo(ruta: string): Promise<void>                // shared/lib/storage.borrarArchivo('logo', ruta)
 *   urlLogo(ruta: string): string                          // supabase.storage.from('logo').getPublicUrl(ruta).data.publicUrl
 *   actualizarLogo(nueva: string | null, anterior: string | null): Promise<Configuracion>
 *     from('configuracion').update({ logo_ruta: nueva }).eq('id', 1)
 *       .eq('logo_ruta', anterior)  |  .is('logo_ruta', null) si anterior es null
 *       .select().single(); lanza el error (conserva `code`: PGRST116 si la fila ya no apuntaba a `anterior`).
 */
const { from, storageFrom, getPublicUrl } = vi.hoisted(() => {
  const getPublicUrl = vi.fn()
  return { from: vi.fn(), storageFrom: vi.fn(() => ({ getPublicUrl })), getPublicUrl }
})
vi.mock('@/shared/lib/supabase', () => ({ supabase: { from, storage: { from: storageFrom } } }))
vi.mock('@/shared/lib/storage', () => ({ subirArchivo: vi.fn(), borrarArchivo: vi.fn() }))

const fila: Configuracion = {
  id: 1,
  nombre: 'Ministerio',
  logo_ruta: 'nueva.png',
  telefono: '',
  correo: '',
  direccion: '',
  facebook: '',
  instagram: '',
  quienes_somos: '',
  mision: '',
  vision: '',
  updated_at: '2026-10-10T00:00:00Z',
}

/** Builder encadenable que registra cada llamada en orden y resuelve en `single()`. */
function cadena(resultado: () => Promise<unknown>) {
  const llamadas: Array<[string, unknown[]]> = []
  const b: Record<string, unknown> = {}
  for (const metodo of ['update', 'eq', 'is', 'select']) {
    b[metodo] = vi.fn((...args: unknown[]) => {
      llamadas.push([metodo, args])
      return b
    })
  }
  b.single = vi.fn((...args: unknown[]) => {
    llamadas.push(['single', args])
    return resultado()
  })
  return { b, llamadas }
}

beforeEach(() => {
  vi.clearAllMocks()
  storageFrom.mockImplementation(() => ({ getPublicUrl }))
})

describe('actualizarLogo', () => {
  it('con logo anterior: update de logo_ruta condicionado a id 1 y a la ruta anterior, y devuelve la fila', async () => {
    const { b, llamadas } = cadena(async () => ({ data: fila, error: null }))
    from.mockReturnValue(b)

    await expect(actualizarLogo('nueva.png', 'vieja.png')).resolves.toEqual(fila)

    expect(from).toHaveBeenCalledWith('configuracion')
    expect(llamadas).toEqual([
      ['update', [{ logo_ruta: 'nueva.png' }]],
      ['eq', ['id', 1]],
      ['eq', ['logo_ruta', 'vieja.png']],
      ['select', []],
      ['single', []],
    ])
  })

  it('sin logo anterior (null) condiciona con .is("logo_ruta", null) y no con .eq', async () => {
    const { b, llamadas } = cadena(async () => ({ data: fila, error: null }))
    from.mockReturnValue(b)

    await actualizarLogo('nueva.png', null)

    expect(llamadas).toEqual([
      ['update', [{ logo_ruta: 'nueva.png' }]],
      ['eq', ['id', 1]],
      ['is', ['logo_ruta', null]],
      ['select', []],
      ['single', []],
    ])
  })

  it('para quitar el logo manda logo_ruta null condicionado a la ruta anterior', async () => {
    const { b, llamadas } = cadena(async () => ({ data: { ...fila, logo_ruta: null }, error: null }))
    from.mockReturnValue(b)

    const resultado = await actualizarLogo(null, 'vieja.png')

    expect(resultado.logo_ruta).toBeNull()
    expect(llamadas[0]).toEqual(['update', [{ logo_ruta: null }]])
    expect(llamadas).toContainEqual(['eq', ['logo_ruta', 'vieja.png']])
  })

  it('si la fila ya no apuntaba al logo anterior (PGRST116) lanza el error con su code', async () => {
    const error = { code: 'PGRST116', message: 'The result contains 0 rows' }
    const { b } = cadena(async () => ({ data: null, error }))
    from.mockReturnValue(b)

    await expect(actualizarLogo('nueva.png', 'vieja.png')).rejects.toBe(error)
  })

  it('si la consulta rechaza (red), propaga el rechazo', async () => {
    const corte = new TypeError('fetch failed')
    const { b } = cadena(() => Promise.reject(corte))
    from.mockReturnValue(b)

    await expect(actualizarLogo('nueva.png', null)).rejects.toBe(corte)
  })
})

describe('subirLogo y borrarLogo', () => {
  it('subirLogo sube al bucket "logo" con el MIME que sale de la extensión', async () => {
    const file = new File(['x'], 'foto.JPEG', { type: '' })
    await subirLogo('abc.jpg', file)
    expect(subirArchivo).toHaveBeenCalledWith('logo', 'abc.jpg', file, 'image/jpeg')
  })

  it('subirLogo propaga el rechazo de Storage', async () => {
    const original = { statusCode: '413', message: 'too large' }
    vi.mocked(subirArchivo).mockRejectedValue(original)
    await expect(subirLogo('abc.png', new File(['x'], 'a.png'))).rejects.toBe(original)
  })

  it('borrarLogo borra del bucket "logo"', async () => {
    await borrarLogo('abc.png')
    expect(borrarArchivo).toHaveBeenCalledWith('logo', 'abc.png')
  })

  it('borrarLogo propaga el rechazo de Storage', async () => {
    const original = new Error('storage caído')
    vi.mocked(borrarArchivo).mockRejectedValue(original)
    await expect(borrarLogo('abc.png')).rejects.toBe(original)
  })
})

describe('urlLogo', () => {
  it('arma la URL pública con getPublicUrl del bucket "logo"', () => {
    getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://storage.test/logo/abc.png' } })
    expect(urlLogo('abc.png')).toBe('https://storage.test/logo/abc.png')
    expect(storageFrom).toHaveBeenCalledWith('logo')
    expect(getPublicUrl).toHaveBeenCalledWith('abc.png')
  })
})
