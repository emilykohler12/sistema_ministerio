import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { borrarArchivo, eliminarFilaNormativa, guardarNormativa, subirArchivo } from './consultas'
import { altaNormativa, editarNormativa, eliminarNormativa } from './secuencias'
import type { DatosNormativa } from './types'

/*
 * Contrato de src/features/normativas/consultas.ts (solo supabase, lanzan ante cualquier error; bucket público `normativas`):
 *   subirArchivo(ruta: string, file: File): Promise<void>        // delega en shared/lib/storage con bucket 'normativas' y MIME application/pdf
 *   borrarArchivo(ruta: string): Promise<void>                   // idem; trata `data: []` como falla
 *   guardarNormativa(args: ArgsGuardarNormativa): Promise<{ id: number; ruta_anterior: string | null }>
 *       rpc guardar_normativa. args = { p_titulo, p_descripcion: string | null, p_numero, p_anio: number, p_etiquetas: string[],
 *       p_ruta_archivo?: string | null, p_id?: number }. `ruta_anterior` se tipa a mano como string | null (el tipo generado la
 *       da como string): es null salvo cuando la RPC reemplazó el archivo (revisión fase A, punto 1).
 *   eliminarFilaNormativa(id: number): Promise<string>          // delete de la fila (.select('ruta_archivo').single(): sin fila afectada falla); devuelve la ruta que la fila tenía en la base
 * Contrato de src/features/normativas/secuencias.ts (criterios 1, 3 y 4; el orden de las llamadas es parte del contrato).
 *   DatosNormativa (types.ts) = { titulo: string; descripcion: string | null; numero: string; anio: number; etiquetas: string[] }
 *   altaNormativa(datos: DatosNormativa, file: File): Promise<number>        // devuelve el id
 *     subirArchivo(rutaNueva(), file) -> guardarNormativa({ p_titulo, p_descripcion, p_numero, p_anio, p_etiquetas, p_ruta_archivo: ruta }) sin p_id
 *     si guardar falla con rechazo del servidor (code no vacío): borrarArchivo(ruta) y se propaga el error original;
 *     si falla sin respuesta del servidor (corte de red): NO borra, console.warn con la ruta, y se propaga.
 *   editarNormativa(id: number, datos: DatosNormativa, file?: File): Promise<number>
 *     sin file: NO sube; guardarNormativa({ ..., p_id: id, p_ruta_archivo: null }) (la base conserva su archivo); no borra nada.
 *     con file: subirArchivo(ruta, file) -> guardarNormativa({ ..., p_id: id, p_ruta_archivo: ruta }) -> borrarArchivo(ruta_anterior) si no es null.
 *       si guardar falla: compensa borrando la ruta nueva (mismas reglas que el alta) y propaga; si borrar la anterior falla:
 *       éxito + console.warn.
 *     En ningún caso borra otra cosa que la ruta que devolvió la RPC en `ruta_anterior`; si es null no borra.
 *   eliminarNormativa(id: number): Promise<void>
 *     eliminarFilaNormativa(id) -> borrarArchivo(la ruta que devolvió la fila borrada, no la de la caché); si borrar el archivo falla: éxito + console.warn.
 *     si borrar la fila falla: se propaga y NO se borra el archivo.
 */
vi.mock('./consultas', () => ({
  subirArchivo: vi.fn(),
  borrarArchivo: vi.fn(),
  guardarNormativa: vi.fn(),
  eliminarFilaNormativa: vi.fn(),
  obtenerNormativas: vi.fn(),
  contarDescargaNormativa: vi.fn(),
}))

const RUTA_VIEJA = '11111111-1111-1111-1111-111111111111.pdf'
const REGEX_RUTA = /^[0-9a-f-]{36}\.pdf$/

const datos: DatosNormativa = {
  titulo: 'Régimen académico',
  descripcion: 'Texto ordenado',
  numero: '1234/24',
  anio: 2024,
  etiquetas: ['evaluación', 'primaria'],
}

const pdf = () => new File(['%PDF'], 'resolucion.pdf', { type: 'application/pdf' })

let llamadas: string[]
let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.resetAllMocks()
  llamadas = []
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.mocked(subirArchivo).mockImplementation(async (ruta) => {
    llamadas.push(`subir:${ruta}`)
  })
  vi.mocked(borrarArchivo).mockImplementation(async (ruta) => {
    llamadas.push(`borrar:${ruta}`)
  })
  vi.mocked(guardarNormativa).mockImplementation(async (args) => {
    llamadas.push('guardar')
    return { id: args.p_id ?? 30, ruta_anterior: null }
  })
  vi.mocked(eliminarFilaNormativa).mockImplementation(async () => {
    llamadas.push('fila')
    return RUTA_VIEJA
  })
})

afterEach(() => {
  warn.mockRestore()
})

const rutaSubida = () => vi.mocked(subirArchivo).mock.calls[0][0]
const argsGuardar = () => vi.mocked(guardarNormativa).mock.calls[0][0]

describe('altaNormativa', () => {
  it('sube el PDF a una ruta <uuid>.pdf y recién entonces guarda la fila con esa ruta y los datos', async () => {
    const file = pdf()
    const id = await altaNormativa(datos, file)

    expect(id).toBe(30)
    expect(rutaSubida()).toMatch(REGEX_RUTA)
    expect(vi.mocked(subirArchivo).mock.calls[0][1]).toBe(file)
    expect(llamadas).toEqual([`subir:${rutaSubida()}`, 'guardar'])
    expect(argsGuardar()).toEqual({
      p_titulo: 'Régimen académico',
      p_descripcion: 'Texto ordenado',
      p_numero: '1234/24',
      p_anio: 2024,
      p_etiquetas: ['evaluación', 'primaria'],
      p_ruta_archivo: rutaSubida(),
    })
    expect(argsGuardar().p_id).toBeUndefined()
  })

  it('si subir falla, propaga el error y no guarda ni borra', async () => {
    const original = { statusCode: '413', message: 'too large' }
    vi.mocked(subirArchivo).mockRejectedValue(original)
    await expect(altaNormativa(datos, pdf())).rejects.toBe(original)
    expect(guardarNormativa).not.toHaveBeenCalled()
    expect(borrarArchivo).not.toHaveBeenCalled()
  })

  it('si la base rechaza el guardado (23505), borra el archivo subido y propaga el error original', async () => {
    const original = { code: '23505', message: 'duplicado' }
    vi.mocked(guardarNormativa).mockRejectedValue(original)
    await expect(altaNormativa(datos, pdf())).rejects.toBe(original)
    expect(llamadas).toEqual([`subir:${rutaSubida()}`, `borrar:${rutaSubida()}`])
    expect(warn).not.toHaveBeenCalled()
  })

  it('si el guardado falla sin respuesta del servidor (code vacío), NO borra: avisa del posible huérfano y propaga', async () => {
    const corte = { message: 'TypeError: fetch failed', code: '', status: 0 }
    vi.mocked(guardarNormativa).mockRejectedValue(corte)
    await expect(altaNormativa(datos, pdf())).rejects.toBe(corte)
    expect(borrarArchivo).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(warn.mock.calls[0])).toContain(rutaSubida())
  })

  it('si además falla el borrado de compensación, propaga el error del guardado y avisa', async () => {
    const original = { code: '23505', message: 'duplicado' }
    vi.mocked(guardarNormativa).mockRejectedValue(original)
    vi.mocked(borrarArchivo).mockRejectedValue(new Error('storage caído'))
    await expect(altaNormativa(datos, pdf())).rejects.toBe(original)
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

describe('editarNormativa sin archivo', () => {
  it('no sube nada, manda p_ruta_archivo null (conserva el de la base) y el id', async () => {
    const id = await editarNormativa(8, datos)
    expect(id).toBe(8)
    expect(subirArchivo).not.toHaveBeenCalled()
    expect(argsGuardar()).toEqual({
      p_id: 8,
      p_titulo: 'Régimen académico',
      p_descripcion: 'Texto ordenado',
      p_numero: '1234/24',
      p_anio: 2024,
      p_etiquetas: ['evaluación', 'primaria'],
      p_ruta_archivo: null,
    })
  })

  it('no borra ningún archivo (la RPC devuelve ruta_anterior null cuando no hay reemplazo)', async () => {
    vi.mocked(guardarNormativa).mockResolvedValue({ id: 8, ruta_anterior: null })
    await editarNormativa(8, datos)
    expect(borrarArchivo).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('si guardar falla, propaga el error y no borra nada', async () => {
    const original = { code: '23505', message: 'duplicado' }
    vi.mocked(guardarNormativa).mockRejectedValue(original)
    await expect(editarNormativa(8, datos)).rejects.toBe(original)
    expect(borrarArchivo).not.toHaveBeenCalled()
  })
})

describe('editarNormativa con archivo nuevo (reemplazo)', () => {
  beforeEach(() => {
    vi.mocked(guardarNormativa).mockImplementation(async (args) => {
      llamadas.push('guardar')
      return { id: args.p_id ?? 30, ruta_anterior: RUTA_VIEJA }
    })
  })

  it('sube el nuevo, actualiza la fila con la ruta nueva y borra la ruta anterior que devolvió la RPC', async () => {
    const id = await editarNormativa(8, datos, pdf())
    expect(id).toBe(8)
    expect(rutaSubida()).toMatch(REGEX_RUTA)
    expect(rutaSubida()).not.toBe(RUTA_VIEJA)
    expect(argsGuardar()).toMatchObject({ p_id: 8, p_ruta_archivo: rutaSubida() })
    expect(llamadas).toEqual([`subir:${rutaSubida()}`, 'guardar', `borrar:${RUTA_VIEJA}`])
  })

  it('si la RPC devuelve ruta_anterior null no borra nada', async () => {
    vi.mocked(guardarNormativa).mockResolvedValue({ id: 8, ruta_anterior: null })
    await editarNormativa(8, datos, pdf())
    expect(borrarArchivo).not.toHaveBeenCalled()
  })

  it('si guardar falla por rechazo del servidor, borra el archivo nuevo (no el viejo) y propaga', async () => {
    const original = { code: '23505', message: 'duplicado' }
    vi.mocked(guardarNormativa).mockRejectedValue(original)
    await expect(editarNormativa(8, datos, pdf())).rejects.toBe(original)
    expect(llamadas).toEqual([`subir:${rutaSubida()}`, `borrar:${rutaSubida()}`])
  })

  it('si guardar falla sin respuesta del servidor, no borra ni el nuevo ni el viejo: avisa y propaga', async () => {
    const corte = { message: 'TypeError: fetch failed', code: '', status: 0 }
    vi.mocked(guardarNormativa).mockRejectedValue(corte)
    await expect(editarNormativa(8, datos, pdf())).rejects.toBe(corte)
    expect(borrarArchivo).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(warn.mock.calls[0])).toContain(rutaSubida())
  })

  it('si falla subir, propaga y no toca la fila ni borra nada', async () => {
    const original = { statusCode: '415', message: 'mime' }
    vi.mocked(subirArchivo).mockRejectedValue(original)
    await expect(editarNormativa(8, datos, pdf())).rejects.toBe(original)
    expect(guardarNormativa).not.toHaveBeenCalled()
    expect(borrarArchivo).not.toHaveBeenCalled()
  })

  it('si borrar el archivo anterior falla, la edición es exitosa y registra un console.warn con la ruta', async () => {
    vi.mocked(borrarArchivo).mockRejectedValue(new Error('storage caído'))
    await expect(editarNormativa(8, datos, pdf())).resolves.toBe(8)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(warn.mock.calls[0])).toContain(RUTA_VIEJA)
  })
})

describe('eliminarNormativa', () => {
  it('borra la fila y después el archivo', async () => {
    await eliminarNormativa(8)
    expect(eliminarFilaNormativa).toHaveBeenCalledWith(8)
    expect(llamadas).toEqual(['fila', `borrar:${RUTA_VIEJA}`])
  })

  it('borra la ruta que devolvió la fila borrada (la de la base), no una de la caché', async () => {
    const rutaDeLaBase = '22222222-2222-2222-2222-222222222222.pdf'
    vi.mocked(eliminarFilaNormativa).mockResolvedValue(rutaDeLaBase)
    await eliminarNormativa(8)
    expect(borrarArchivo).toHaveBeenCalledTimes(1)
    expect(borrarArchivo).toHaveBeenCalledWith(rutaDeLaBase)
  })

  it('si borrar la fila falla, propaga el error y NO borra el archivo', async () => {
    const original = { code: 'PGRST116', message: 'rls' }
    vi.mocked(eliminarFilaNormativa).mockRejectedValue(original)
    await expect(eliminarNormativa(8)).rejects.toBe(original)
    expect(borrarArchivo).not.toHaveBeenCalled()
  })

  it('si borrar el archivo falla, la baja es exitosa y registra un console.warn con el huérfano', async () => {
    vi.mocked(borrarArchivo).mockRejectedValue(new Error('storage caído'))
    await expect(eliminarNormativa(8)).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(warn.mock.calls[0])).toContain(RUTA_VIEJA)
  })
})
