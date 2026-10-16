import { beforeEach, describe, expect, it, vi } from 'vitest'
import { actualizarRecurso, eliminarFilaRecurso } from './consultas'

/*
 * Contrato (fix-ruta-recursos). src/features/recursos/consultas.ts, solo supabase. Se mockea `supabase.from` como una
 * cadena que registra cada llamada: lo que se prueba es la consulta que se arma (los filtros y las columnas), porque de
 * eso depende que la base decida con su propia ruta y no con la de la caché.
 *   actualizarRecurso(id, cambios, rutaAnterior?): update(cambios).eq('id', id) [.eq('ruta_archivo', rutaAnterior)].select().single()
 *   eliminarFilaRecurso(id): delete().eq('id', id).select('ruta_archivo').single() -> data.ruta_archivo (string | null)
 *   ambas lanzan el `error` de PostgREST tal como llega (conserva `code`, por ejemplo PGRST116).
 */
const { from, cadena, resultado } = vi.hoisted(() => {
  const resultado: { actual: { data: unknown; error: unknown } } = { actual: { data: null, error: null } }
  const cadena = {
    update: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    single: vi.fn(),
  }
  const from = vi.fn()
  return { from, cadena, resultado }
})
vi.mock('@/shared/lib/supabase', () => ({ supabase: { from } }))

beforeEach(() => {
  vi.resetAllMocks()
  resultado.actual = { data: null, error: null }
  from.mockReturnValue(cadena)
  cadena.update.mockReturnValue(cadena)
  cadena.delete.mockReturnValue(cadena)
  cadena.eq.mockReturnValue(cadena)
  cadena.select.mockReturnValue(cadena)
  cadena.single.mockImplementation(async () => resultado.actual)
})

describe('actualizarRecurso', () => {
  const cambios = { ruta_archivo: '5/nuevo.pdf', tipo: 'PDF' as const, tamanio_bytes: 10 }
  const fila = { id: 20, ruta_archivo: '5/nuevo.pdf' }

  it('con rutaAnterior filtra por id y por la ruta que la fila debe tener todavía', async () => {
    resultado.actual = { data: fila, error: null }

    await expect(actualizarRecurso(20, cambios, '5/viejo.pdf')).resolves.toBe(fila)

    expect(from).toHaveBeenCalledWith('recurso')
    expect(cadena.update).toHaveBeenCalledWith(cambios)
    expect(cadena.eq.mock.calls).toEqual([
      ['id', 20],
      ['ruta_archivo', '5/viejo.pdf'],
    ])
    expect(cadena.single).toHaveBeenCalledTimes(1)
  })

  it('sin rutaAnterior (Editar) filtra solo por id', async () => {
    resultado.actual = { data: fila, error: null }

    await actualizarRecurso(20, { nombre: 'Nuevo nombre' })

    expect(cadena.eq.mock.calls).toEqual([['id', 20]])
  })

  it('lanza tal cual el error de PostgREST cuando no afectó ninguna fila (PGRST116)', async () => {
    const error = { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: null }
    resultado.actual = { data: null, error }

    await expect(actualizarRecurso(20, cambios, '5/viejo.pdf')).rejects.toBe(error)
  })
})

describe('eliminarFilaRecurso', () => {
  it('borra por id, pide la columna ruta_archivo y devuelve la ruta que la fila tenía en la base', async () => {
    resultado.actual = { data: { ruta_archivo: '5/vigente.pdf' }, error: null }

    await expect(eliminarFilaRecurso(20)).resolves.toBe('5/vigente.pdf')

    expect(from).toHaveBeenCalledWith('recurso')
    expect(cadena.delete).toHaveBeenCalledTimes(1)
    expect(cadena.eq.mock.calls).toEqual([['id', 20]])
    expect(cadena.select).toHaveBeenCalledWith('ruta_archivo')
    expect(cadena.single).toHaveBeenCalledTimes(1)
  })

  it('devuelve null si la fila era un enlace', async () => {
    resultado.actual = { data: { ruta_archivo: null }, error: null }

    await expect(eliminarFilaRecurso(21)).resolves.toBeNull()
  })

  it('lanza tal cual el error de PostgREST cuando no quedó ninguna fila (PGRST116)', async () => {
    const error = { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: null }
    resultado.actual = { data: null, error }

    await expect(eliminarFilaRecurso(20)).rejects.toBe(error)
  })
})
