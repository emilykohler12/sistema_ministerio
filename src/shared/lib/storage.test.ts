import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { borrarArchivo, borrarOAvisar, compensar, subirArchivo } from './storage'

/*
 * Contrato de src/shared/lib/storage.ts (se extrae de recursos/consultas.ts y recursos/secuencias.ts; el bucket es parámetro):
 *   subirArchivo(bucket: string, ruta: string, file: File, mime: string): Promise<void>
 *       upload sin upsert; el MIME canónico viaja en un `File` nuevo (storage-js ignora `contentType` con File). Lanza el error de storage.
 *   borrarArchivo(bucket: string, ruta: string): Promise<void>
 *       remove([ruta]); lanza si hay error y también si `data` viene vacío (nada borrado).
 *   borrarOAvisar(borrar: (ruta: string) => Promise<void>, ruta: string, contexto: string): Promise<void>
 *       llama a `borrar(ruta)`; si falla, NO propaga: console.warn con el contexto y la ruta (huérfano).
 *   compensar(borrar, ruta: string, error: unknown, contexto: string): Promise<void>
 *       si `error` es un rechazo del servidor (objeto con `code` string no vacío) -> borrarOAvisar(borrar, ruta, contexto);
 *       si no (corte de red, code '' o sin code) -> NO borra y emite console.warn con la ruta (posible huérfano).
 *       Nunca propaga ni relanza `error`: eso lo hace quien llama.
 *   esRechazoDelServidor es privado (se prueba a través de compensar).
 * `borrar` se inyecta para que cada dominio pase su propio borrarArchivo de `consultas` (así sus tests siguen mockeando `./consultas`).
 * Solo se mockea `@/shared/lib/supabase` (el cliente) para subirArchivo y borrarArchivo.
 */
const { upload, remove, from } = vi.hoisted(() => {
  const upload = vi.fn()
  const remove = vi.fn()
  const from = vi.fn(() => ({ upload, remove }))
  return { upload, remove, from }
})
vi.mock('@/shared/lib/supabase', () => ({ supabase: { storage: { from } } }))

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  from.mockImplementation(() => ({ upload, remove }))
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warn.mockRestore()
})

describe('subirArchivo', () => {
  it('sube al bucket indicado, en la ruta dada y sin upsert', async () => {
    upload.mockResolvedValue({ data: { path: 'x' }, error: null })
    await subirArchivo('normativas', 'abc.pdf', new File(['x'], 'a.pdf'), 'application/pdf')
    expect(from).toHaveBeenCalledWith('normativas')
    expect(upload).toHaveBeenCalledTimes(1)
    expect(upload.mock.calls[0][0]).toBe('abc.pdf')
    expect(upload.mock.calls[0][2]).toMatchObject({ upsert: false })
  })

  it('usa otro bucket cuando se pide otro', async () => {
    upload.mockResolvedValue({ data: { path: 'x' }, error: null })
    await subirArchivo('talleres', '5/a.pdf', new File(['x'], 'a.pdf'), 'application/pdf')
    expect(from).toHaveBeenCalledWith('talleres')
  })

  it('manda el MIME canónico en un File nuevo, no el type original del archivo', async () => {
    upload.mockResolvedValue({ data: { path: 'x' }, error: null })
    await subirArchivo('normativas', 'abc.pdf', new File(['x'], 'a.pdf', { type: '' }), 'application/pdf')
    const enviado = upload.mock.calls[0][1] as File
    expect(enviado).toBeInstanceOf(File)
    expect(enviado.type).toBe('application/pdf')
    expect(enviado.name).toBe('a.pdf')
  })

  it('propaga el error de storage', async () => {
    const error = { statusCode: '413', message: 'too large' }
    upload.mockResolvedValue({ data: null, error })
    await expect(subirArchivo('normativas', 'abc.pdf', new File(['x'], 'a.pdf'), 'application/pdf')).rejects.toBe(error)
  })
})

describe('borrarArchivo', () => {
  it('borra la ruta del bucket indicado', async () => {
    remove.mockResolvedValue({ data: [{ name: 'abc.pdf' }], error: null })
    await borrarArchivo('normativas', 'abc.pdf')
    expect(from).toHaveBeenCalledWith('normativas')
    expect(remove).toHaveBeenCalledWith(['abc.pdf'])
  })

  it('propaga el error de storage', async () => {
    const error = { message: 'boom' }
    remove.mockResolvedValue({ data: null, error })
    await expect(borrarArchivo('normativas', 'abc.pdf')).rejects.toBe(error)
  })

  it('trata data vacío (nada borrado, sin error) como falla', async () => {
    remove.mockResolvedValue({ data: [], error: null })
    await expect(borrarArchivo('normativas', 'abc.pdf')).rejects.toThrow()
  })
})

describe('borrarOAvisar', () => {
  it('borra la ruta con la función recibida y no avisa si sale bien', async () => {
    const borrar = vi.fn().mockResolvedValue(undefined)
    await borrarOAvisar(borrar, 'abc.pdf', 'reemplazo')
    expect(borrar).toHaveBeenCalledWith('abc.pdf')
    expect(warn).not.toHaveBeenCalled()
  })

  it('si borrar falla no propaga: avisa con console.warn, con el contexto y la ruta', async () => {
    const borrar = vi.fn().mockRejectedValue(new Error('storage caído'))
    await expect(borrarOAvisar(borrar, 'abc.pdf', 'reemplazo')).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    const texto = JSON.stringify(warn.mock.calls[0])
    expect(texto).toContain('abc.pdf')
    expect(texto).toContain('reemplazo')
  })
})

describe('compensar', () => {
  it('ante un rechazo del servidor (code no vacío) borra el archivo recién subido', async () => {
    const borrar = vi.fn().mockResolvedValue(undefined)
    await compensar(borrar, 'abc.pdf', { code: '23505', message: 'duplicado' }, 'el alta falló')
    expect(borrar).toHaveBeenCalledWith('abc.pdf')
    expect(warn).not.toHaveBeenCalled()
  })

  it('con code vacío (corte de red) NO borra: avisa del posible huérfano con la ruta', async () => {
    const borrar = vi.fn()
    await compensar(borrar, 'abc.pdf', { message: 'fetch failed', code: '', status: 0 }, 'el alta falló')
    expect(borrar).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(warn.mock.calls[0])).toContain('abc.pdf')
  })

  it('sin code, o con algo que no es un objeto de error, tampoco borra', async () => {
    const borrar = vi.fn()
    for (const error of [new Error('sin red'), { message: 'x' }, { code: 42501 }, null, undefined, 'texto']) {
      await compensar(borrar, 'abc.pdf', error, 'ctx')
    }
    expect(borrar).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(6)
  })

  it('si el rechazo es del servidor pero borrar falla, no propaga y avisa', async () => {
    const borrar = vi.fn().mockRejectedValue(new Error('storage caído'))
    await expect(compensar(borrar, 'abc.pdf', { code: 'PGRST116' }, 'ctx')).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(warn.mock.calls[0])).toContain('abc.pdf')
  })
})
