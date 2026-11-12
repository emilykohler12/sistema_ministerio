import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { actualizarLogo, borrarLogo, subirLogo } from './consultas'
import { cambiarLogo, quitarLogo } from './secuencias'
import type { Configuracion } from './types'

/*
 * Contrato de src/features/configuracion/consultas.ts: ver consultas.test.ts (todas lanzan ante cualquier error).
 * Contrato de src/features/configuracion/secuencias.ts (criterios 2, 4 y 5; el orden de las llamadas es parte del contrato).
 *   cambiarLogo(file: File, anterior: string | null): Promise<Configuracion>
 *     subirLogo(ruta, file) -> actualizarLogo(ruta, anterior) -> borrarLogo(anterior) solo si anterior no es null.
 *     Si subir falla: propaga, no actualiza ni borra. Si el servidor rechaza el UPDATE (code no vacío, p. ej. PGRST116):
 *     borra el archivo recién subido y propaga el error original. Con un corte de red (code ''): NO borra, console.warn
 *     con la ruta y propaga. Si falla solo el borrado del anterior: resuelve con la fila y console.warn con la ruta.
 *   quitarLogo(anterior: string): Promise<Configuracion>
 *     actualizarLogo(null, anterior) -> borrarLogo(anterior). Si el UPDATE falla: propaga y no borra. Si falla el borrado:
 *     resuelve con la fila y console.warn.
 */
vi.mock('./consultas', () => ({
  subirLogo: vi.fn(),
  borrarLogo: vi.fn(),
  actualizarLogo: vi.fn(),
  urlLogo: vi.fn(),
  obtenerConfiguracion: vi.fn(),
  guardarConfiguracion: vi.fn(),
}))

const ANTERIOR = '11111111-1111-1111-1111-111111111111.png'
const REGEX_RUTA = /^[0-9a-f-]{36}\.(png|jpg|webp)$/

const filaBase: Configuracion = {
  id: 1,
  nombre: 'Ministerio',
  logo_ruta: null,
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

const imagen = (nombre = 'logo.png') => new File(['x'], nombre)

let llamadas: string[]
let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.resetAllMocks()
  llamadas = []
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.mocked(subirLogo).mockImplementation(async (ruta) => {
    llamadas.push(`subir:${ruta}`)
  })
  vi.mocked(borrarLogo).mockImplementation(async (ruta) => {
    llamadas.push(`borrar:${ruta}`)
  })
  vi.mocked(actualizarLogo).mockImplementation(async (nueva, anterior) => {
    llamadas.push(`actualizar:${nueva}:${anterior}`)
    return { ...filaBase, logo_ruta: nueva }
  })
})

afterEach(() => {
  warn.mockRestore()
})

const rutaSubida = () => vi.mocked(subirLogo).mock.calls[0][0]

describe('cambiarLogo con logo anterior', () => {
  it('sube a <uuid>.<ext>, actualiza la fila condicionada al anterior y recién entonces borra el anterior', async () => {
    const file = imagen('foto.JPEG')
    const fila = await cambiarLogo(file, ANTERIOR)

    expect(rutaSubida()).toMatch(REGEX_RUTA)
    expect(rutaSubida().endsWith('.jpg')).toBe(true)
    expect(vi.mocked(subirLogo).mock.calls[0][1]).toBe(file)
    expect(llamadas).toEqual([`subir:${rutaSubida()}`, `actualizar:${rutaSubida()}:${ANTERIOR}`, `borrar:${ANTERIOR}`])
    expect(fila.logo_ruta).toBe(rutaSubida())
  })

  it('devuelve la fila que respondió el UPDATE', async () => {
    const devuelta = { ...filaBase, logo_ruta: 'x.png', updated_at: '2026-11-11T00:00:00Z' }
    vi.mocked(actualizarLogo).mockResolvedValue(devuelta)
    await expect(cambiarLogo(imagen(), ANTERIOR)).resolves.toBe(devuelta)
  })

  it('si subir falla, propaga el error y no actualiza ni borra nada', async () => {
    const original = { statusCode: '413', message: 'too large' }
    vi.mocked(subirLogo).mockRejectedValue(original)
    await expect(cambiarLogo(imagen(), ANTERIOR)).rejects.toBe(original)
    expect(actualizarLogo).not.toHaveBeenCalled()
    expect(borrarLogo).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('si el servidor rechaza el UPDATE (PGRST116), borra el archivo recién subido, no el anterior, y propaga', async () => {
    const original = { code: 'PGRST116', message: '0 rows' }
    vi.mocked(actualizarLogo).mockRejectedValue(original)
    await expect(cambiarLogo(imagen(), ANTERIOR)).rejects.toBe(original)
    expect(llamadas).toEqual([`subir:${rutaSubida()}`, `borrar:${rutaSubida()}`])
    expect(borrarLogo).not.toHaveBeenCalledWith(ANTERIOR)
    expect(warn).not.toHaveBeenCalled()
  })

  it('si el UPDATE falla por un corte de red (code vacío), NO borra: avisa del posible huérfano y propaga', async () => {
    const corte = { message: 'TypeError: fetch failed', code: '', status: 0 }
    vi.mocked(actualizarLogo).mockRejectedValue(corte)
    await expect(cambiarLogo(imagen(), ANTERIOR)).rejects.toBe(corte)
    expect(borrarLogo).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(warn.mock.calls[0])).toContain(rutaSubida())
  })

  it('si el UPDATE rechaza con un error sin code (excepción de red), tampoco borra', async () => {
    vi.mocked(actualizarLogo).mockRejectedValue(new TypeError('fetch failed'))
    await expect(cambiarLogo(imagen(), ANTERIOR)).rejects.toBeInstanceOf(TypeError)
    expect(borrarLogo).not.toHaveBeenCalled()
  })

  it('si además falla el borrado de compensación, propaga el error del UPDATE y avisa', async () => {
    const original = { code: 'PGRST116', message: '0 rows' }
    vi.mocked(actualizarLogo).mockRejectedValue(original)
    vi.mocked(borrarLogo).mockRejectedValue(new Error('storage caído'))
    await expect(cambiarLogo(imagen(), ANTERIOR)).rejects.toBe(original)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('si falla solo el borrado del anterior, el cambio es exitoso y avisa del huérfano con su ruta', async () => {
    vi.mocked(borrarLogo).mockRejectedValue(new Error('storage caído'))
    const fila = await cambiarLogo(imagen(), ANTERIOR)
    expect(fila.logo_ruta).toBe(rutaSubida())
    expect(warn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(warn.mock.calls[0])).toContain(ANTERIOR)
  })
})

describe('cambiarLogo sin logo anterior', () => {
  it('actualiza con anterior null (condición .is null) y no borra nada', async () => {
    await cambiarLogo(imagen('logo.webp'), null)
    expect(rutaSubida().endsWith('.webp')).toBe(true)
    expect(llamadas).toEqual([`subir:${rutaSubida()}`, `actualizar:${rutaSubida()}:null`])
    expect(borrarLogo).not.toHaveBeenCalled()
  })

  it('si el servidor rechaza el UPDATE, borra el archivo recién subido y propaga', async () => {
    const original = { code: 'PGRST116', message: '0 rows' }
    vi.mocked(actualizarLogo).mockRejectedValue(original)
    await expect(cambiarLogo(imagen(), null)).rejects.toBe(original)
    expect(llamadas).toEqual([`subir:${rutaSubida()}`, `borrar:${rutaSubida()}`])
  })
})

describe('quitarLogo', () => {
  it('pone la fila en NULL condicionada al anterior y después borra el archivo', async () => {
    const fila = await quitarLogo(ANTERIOR)
    expect(llamadas).toEqual([`actualizar:null:${ANTERIOR}`, `borrar:${ANTERIOR}`])
    expect(fila.logo_ruta).toBeNull()
  })

  it('si el UPDATE falla, propaga el error y NO borra el archivo', async () => {
    const original = { code: 'PGRST116', message: '0 rows' }
    vi.mocked(actualizarLogo).mockRejectedValue(original)
    await expect(quitarLogo(ANTERIOR)).rejects.toBe(original)
    expect(borrarLogo).not.toHaveBeenCalled()
  })

  it('si el UPDATE rechaza por red, propaga y no borra', async () => {
    vi.mocked(actualizarLogo).mockRejectedValue(new TypeError('fetch failed'))
    await expect(quitarLogo(ANTERIOR)).rejects.toBeInstanceOf(TypeError)
    expect(borrarLogo).not.toHaveBeenCalled()
  })

  it('si falla el borrado del archivo, el logo ya está quitado: resuelve y avisa con la ruta', async () => {
    vi.mocked(borrarLogo).mockRejectedValue(new Error('storage caído'))
    const fila = await quitarLogo(ANTERIOR)
    expect(fila.logo_ruta).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(warn.mock.calls[0])).toContain(ANTERIOR)
  })
})
