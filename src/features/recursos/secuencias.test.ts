import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  actualizarRecurso,
  borrarArchivo,
  eliminarFilaRecurso,
  insertarRecurso,
  subirArchivo,
} from './consultas'
import { altaArchivo, eliminarRecurso, reemplazarArchivo } from './secuencias'
import type { Recurso } from './types'

/*
 * Contrato de consultas.ts (solo supabase, lanzan ante cualquier error):
 *   subirArchivo(ruta: string, file: File, mime: string): Promise<void>
 *   borrarArchivo(ruta: string): Promise<void>            // trata `data: []` de storage.remove() como falla
 *   insertarRecurso(nuevo: TablesInsert<'recurso'>): Promise<Recurso>
 *   actualizarRecurso(id: number, cambios: { nombre?, url?, ruta_archivo?, tipo?, tamanio_bytes?, orden? }): Promise<Recurso>
 *   eliminarFilaRecurso(id: number): Promise<void>
 * Contrato de secuencias.ts (criterio 7; el orden de las llamadas es parte del contrato):
 *   altaArchivo(tallerId: number, file: File, orden: number): Promise<Recurso>
 *     subirArchivo(ruta, file, mimeCanónico) -> insertarRecurso({ taller_id, nombre, tipo, ruta_archivo, tamanio_bytes: file.size, orden })
 *     si el insert falla: borrarArchivo(ruta) y se propaga el error original
 *   reemplazarArchivo(recurso: Recurso, file: File): Promise<Recurso>
 *     subirArchivo(rutaNueva, file, mime) -> actualizarRecurso(id, { ruta_archivo, tipo, tamanio_bytes }) -> borrarArchivo(rutaVieja)
 *     si el update falla: borrarArchivo(rutaNueva) y se propaga; si borrar la vieja falla: éxito + console.warn
 *   eliminarRecurso(recurso: Recurso): Promise<void>
 *     eliminarFilaRecurso(id) -> borrarArchivo(ruta) (solo archivos); si borrar el archivo falla: éxito + console.warn
 */
vi.mock('./consultas', () => ({
  subirArchivo: vi.fn(),
  borrarArchivo: vi.fn(),
  insertarRecurso: vi.fn(),
  actualizarRecurso: vi.fn(),
  eliminarFilaRecurso: vi.fn(),
  ordenarRecursos: vi.fn(),
  urlFirmada: vi.fn(),
}))

const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const RUTA_VIEJA = '5/viejo-uuid.pdf'

function recurso(p: Partial<Recurso> = {}): Recurso {
  return {
    id: 20,
    taller_id: 5,
    nombre: 'Guía de huerta',
    tipo: 'PDF',
    ruta_archivo: RUTA_VIEJA,
    url: null,
    tamanio_bytes: 100,
    orden: 2,
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-10T00:00:00Z',
    ...p,
  }
}

const enlace = recurso({
  id: 21,
  nombre: 'Video',
  tipo: 'ENLACE',
  ruta_archivo: null,
  url: 'https://youtu.be/dQw4w9WgXcQ',
  tamanio_bytes: null,
})

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
  vi.mocked(insertarRecurso).mockImplementation(async (nuevo) => {
    llamadas.push('insertar')
    return recurso({ ...nuevo, id: 99 } as Partial<Recurso>)
  })
  vi.mocked(actualizarRecurso).mockImplementation(async (id, cambios) => {
    llamadas.push(`actualizar:${id}`)
    return recurso({ id, ...cambios } as Partial<Recurso>)
  })
  vi.mocked(eliminarFilaRecurso).mockImplementation(async (id) => {
    llamadas.push(`eliminarFila:${id}`)
  })
})

afterEach(() => {
  warn.mockRestore()
})

const rutaSubida = () => vi.mocked(subirArchivo).mock.calls[0][0]

describe('altaArchivo', () => {
  it('sube el archivo con el MIME canónico de su extensión (aunque file.type venga vacío) a <tallerId>/<uuid>.<ext>', async () => {
    const file = new File(['contenido'], 'Planilla de notas.docx', { type: '' })
    await altaArchivo(5, file, 3)

    expect(subirArchivo).toHaveBeenCalledTimes(1)
    const [ruta, subido, mime] = vi.mocked(subirArchivo).mock.calls[0]
    expect(ruta).toMatch(/^5\/[0-9a-f-]{36}\.docx$/)
    expect(subido).toBe(file)
    expect(mime).toBe(MIME_DOCX)
  })

  it('inserta la fila después de subir, con nombre sin extensión, tipo por extensión, tamanio_bytes = file.size y el orden dado', async () => {
    const file = new File(['0123456789'], 'Planilla de notas.docx', { type: '' })
    const resultado = await altaArchivo(5, file, 3)

    expect(llamadas).toEqual([`subir:${rutaSubida()}`, 'insertar'])
    expect(insertarRecurso).toHaveBeenCalledTimes(1)
    expect(vi.mocked(insertarRecurso).mock.calls[0][0]).toEqual({
      taller_id: 5,
      nombre: 'Planilla de notas',
      tipo: 'DOCX',
      ruta_archivo: rutaSubida(),
      tamanio_bytes: 10,
      orden: 3,
    })
    expect(resultado.id).toBe(99)
    expect(borrarArchivo).not.toHaveBeenCalled()
  })

  it('si el insert falla, borra el archivo subido y propaga el error original', async () => {
    const original = { code: '42501', message: 'rls' }
    vi.mocked(insertarRecurso).mockImplementation(async () => {
      llamadas.push('insertar')
      throw original
    })

    await expect(altaArchivo(5, new File(['x'], 'guia.pdf'), 1)).rejects.toBe(original)

    expect(llamadas).toEqual([`subir:${rutaSubida()}`, 'insertar', `borrar:${rutaSubida()}`])
  })

  it('si el insert falla y la compensación también, igual propaga el error original del insert', async () => {
    const original = new Error('insert falló')
    vi.mocked(insertarRecurso).mockRejectedValue(original)
    vi.mocked(borrarArchivo).mockRejectedValue(new Error('borrado falló'))

    await expect(altaArchivo(5, new File(['x'], 'guia.pdf'), 1)).rejects.toBe(original)
  })

  it('si la subida falla, no inserta ni borra nada y propaga el error', async () => {
    const original = { statusCode: '413', message: 'too big' }
    vi.mocked(subirArchivo).mockRejectedValue(original)

    await expect(altaArchivo(5, new File(['x'], 'guia.pdf'), 1)).rejects.toBe(original)

    expect(insertarRecurso).not.toHaveBeenCalled()
    expect(borrarArchivo).not.toHaveBeenCalled()
  })
})

describe('altaArchivo: falla ambigua (la escritura pudo confirmarse)', () => {
  it('si el insert falla sin respuesta del servidor (code vacío), NO borra el archivo: avisa del posible huérfano y propaga', async () => {
    const corte = { message: 'TypeError: fetch failed', code: '', status: 0 }
    vi.mocked(insertarRecurso).mockImplementation(async () => {
      llamadas.push('insertar')
      throw corte
    })

    await expect(altaArchivo(5, new File(['x'], 'guia.pdf'), 1)).rejects.toBe(corte)

    expect(borrarArchivo).not.toHaveBeenCalled()
    expect(llamadas).toEqual([`subir:${rutaSubida()}`, 'insertar'])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(warn.mock.calls[0])).toContain(rutaSubida())
  })

  it('un error sin code (por ejemplo un Error de red) tampoco borra el archivo', async () => {
    const original = new Error('sin red')
    vi.mocked(insertarRecurso).mockRejectedValue(original)

    await expect(altaArchivo(5, new File(['x'], 'guia.pdf'), 1)).rejects.toBe(original)

    expect(borrarArchivo).not.toHaveBeenCalled()
  })

  it('un rechazo del servidor (code no vacío) sigue borrando el archivo', async () => {
    vi.mocked(insertarRecurso).mockRejectedValue({ code: '23514', message: 'check' })

    await expect(altaArchivo(5, new File(['x'], 'guia.pdf'), 1)).rejects.toMatchObject({ code: '23514' })

    expect(borrarArchivo).toHaveBeenCalledWith(rutaSubida())
  })
})

describe('reemplazarArchivo: falla ambigua (la escritura pudo confirmarse)', () => {
  it('si el update falla sin respuesta del servidor (code vacío), NO borra ni el nuevo ni el viejo: avisa y propaga', async () => {
    const corte = { message: 'TypeError: fetch failed', code: '', status: 0 }
    vi.mocked(actualizarRecurso).mockImplementation(async (id) => {
      llamadas.push(`actualizar:${id}`)
      throw corte
    })

    await expect(reemplazarArchivo(recurso(), new File(['x'], 'otro.docx'))).rejects.toBe(corte)

    expect(borrarArchivo).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(warn.mock.calls[0])).toContain(rutaSubida())
  })
})

describe('reemplazarArchivo', () => {
  const nuevoDocx = () => new File(['0123456789'], 'otro nombre.docx', { type: '' })

  it('sube el archivo nuevo al prefijo del taller del recurso, con el MIME canónico', async () => {
    await reemplazarArchivo(recurso(), nuevoDocx())

    const [ruta, , mime] = vi.mocked(subirArchivo).mock.calls[0]
    expect(ruta).toMatch(/^5\/[0-9a-f-]{36}\.docx$/)
    expect(ruta).not.toBe(RUTA_VIEJA)
    expect(mime).toBe(MIME_DOCX)
  })

  it('orden: sube el nuevo, actualiza la fila y recién entonces borra el anterior', async () => {
    await reemplazarArchivo(recurso(), nuevoDocx())

    expect(llamadas).toEqual([`subir:${rutaSubida()}`, 'actualizar:20', `borrar:${RUTA_VIEJA}`])
  })

  it('actualiza solo ruta, tipo y tamaño: conserva nombre, orden e id', async () => {
    const resultado = await reemplazarArchivo(recurso(), nuevoDocx())

    expect(actualizarRecurso).toHaveBeenCalledTimes(1)
    expect(vi.mocked(actualizarRecurso).mock.calls[0]).toEqual([
      20,
      { ruta_archivo: rutaSubida(), tipo: 'DOCX', tamanio_bytes: 10 },
    ])
    expect(resultado.id).toBe(20)
  })

  it('si el update falla, borra el archivo nuevo (no el viejo) y propaga el error original', async () => {
    const original = { code: '42501', message: 'rls' }
    vi.mocked(actualizarRecurso).mockImplementation(async (id) => {
      llamadas.push(`actualizar:${id}`)
      throw original
    })

    await expect(reemplazarArchivo(recurso(), nuevoDocx())).rejects.toBe(original)

    expect(llamadas).toEqual([`subir:${rutaSubida()}`, 'actualizar:20', `borrar:${rutaSubida()}`])
    expect(borrarArchivo).not.toHaveBeenCalledWith(RUTA_VIEJA)
  })

  it('si la subida falla, no toca la fila ni borra nada', async () => {
    const original = new Error('sin red')
    vi.mocked(subirArchivo).mockRejectedValue(original)

    await expect(reemplazarArchivo(recurso(), nuevoDocx())).rejects.toBe(original)

    expect(actualizarRecurso).not.toHaveBeenCalled()
    expect(borrarArchivo).not.toHaveBeenCalled()
  })

  it('si borrar el archivo viejo falla, la operación es exitosa y registra un console.warn', async () => {
    vi.mocked(borrarArchivo).mockRejectedValue(new Error('no se pudo borrar'))

    await expect(reemplazarArchivo(recurso(), nuevoDocx())).resolves.toMatchObject({ id: 20 })

    expect(warn).toHaveBeenCalledTimes(1)
  })
})

describe('eliminarRecurso', () => {
  it('orden: borra la fila y después el archivo de Storage', async () => {
    await eliminarRecurso(recurso())

    expect(llamadas).toEqual(['eliminarFila:20', `borrar:${RUTA_VIEJA}`])
    expect(warn).not.toHaveBeenCalled()
  })

  it('si borrar el archivo falla, la operación es exitosa y registra un console.warn con el huérfano', async () => {
    vi.mocked(borrarArchivo).mockRejectedValue(new Error('no se pudo borrar'))

    await expect(eliminarRecurso(recurso())).resolves.toBeUndefined()

    expect(warn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(warn.mock.calls[0])).toContain(RUTA_VIEJA)
  })

  it('si borrar la fila falla, propaga el error y NO toca el archivo (la fila seguiría apuntando a él)', async () => {
    const original = { code: '42501', message: 'rls' }
    vi.mocked(eliminarFilaRecurso).mockRejectedValue(original)

    await expect(eliminarRecurso(recurso())).rejects.toBe(original)

    expect(borrarArchivo).not.toHaveBeenCalled()
  })

  it('un enlace solo borra la fila: no toca Storage', async () => {
    await eliminarRecurso(enlace)

    expect(llamadas).toEqual(['eliminarFila:21'])
    expect(borrarArchivo).not.toHaveBeenCalled()
  })
})
