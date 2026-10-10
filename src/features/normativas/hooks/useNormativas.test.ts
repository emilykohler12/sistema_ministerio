import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearQueryClient } from '@/test/utils'
import { contarDescargaNormativa, obtenerNormativas } from '../consultas'
import { altaNormativa, editarNormativa, eliminarNormativa } from '../secuencias'
import type { DatosNormativa, Normativa } from '../types'
import {
  CLAVE_NORMATIVAS,
  contarDescarga,
  useEliminarNormativa,
  useGuardarNormativa,
  useNormativa,
  useNormativas,
} from './useNormativas'

/*
 * Contrato (consultas.ts y secuencias.ts: ver secuencias.test.ts). Hooks delgados de src/features/normativas/hooks/useNormativas.ts:
 *   obtenerNormativas(): Promise<Normativa[]>      // todas (select público); la URL pública ya viene en cada fila (`url`)
 *   contarDescargaNormativa(id: number): Promise<void>      // rpc contar_descarga_normativa
 *   CLAVE_NORMATIVAS = ['normativas'] as const    // una sola clave; cada hook filtra con `select`
 *   useNormativas(filtro: { busqueda?: string } = {})   -> data: Normativa[] ordenadas (año desc, id desc: ordenarNormativas)
 *                                                         y filtradas (filtrarNormativas); la home usa los 3 primeros
 *   useNormativa(id: number | null)                     -> data: la Normativa con ese id, o null si no está (o id null)
 *   useGuardarNormativa().mutateAsync({ id?: number; datos: DatosNormativa; archivo?: File })
 *       sin id -> altaNormativa(datos, archivo); con id -> editarNormativa(id, datos, archivo). Devuelve el id.
 *       Al terminar bien invalida ['normativas'] y ['etiquetas']; al fallar, ninguna.
 *   useEliminarNormativa().mutateAsync(id: number)      -> eliminarNormativa(id); invalida ['normativas'] si sale bien
 *   contarDescarga(id: number): void      // función común, no un hook
 *       Llama a contarDescargaNormativa(id) sin esperar la respuesta, solo la primera vez por normativa en la visita
 *       (marca en sessionStorage, que sobrevive entre llamadas y montajes). Si la consulta es rechazada, no lanza ni deja un rechazo sin atender.
 */
vi.mock('../consultas', () => ({
  subirArchivo: vi.fn(),
  borrarArchivo: vi.fn(),
  guardarNormativa: vi.fn(),
  eliminarFilaNormativa: vi.fn(),
  obtenerNormativas: vi.fn(),
  contarDescargaNormativa: vi.fn(),
}))
vi.mock('../secuencias', () => ({
  altaNormativa: vi.fn(),
  editarNormativa: vi.fn(),
  eliminarNormativa: vi.fn(),
}))

function normativa(id: number, p: Partial<Normativa> = {}): Normativa {
  return {
    id,
    titulo: `Normativa ${id}`,
    descripcion: null,
    numero: `${id}/24`,
    anio: 2024,
    ruta_archivo: `00000000-0000-0000-0000-00000000000${id}.pdf`,
    descargas: 0,
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-10T00:00:00Z',
    etiqueta: [],
    url: `https://ejemplo.test/normativas/${id}.pdf`,
    ...p,
  }
}

const todas = [
  normativa(1, { titulo: 'Régimen de evaluación', anio: 2022 }),
  normativa(2, { titulo: 'Asistencia', anio: 2024 }),
  normativa(3, { titulo: 'Convivencia', anio: 2024, etiqueta: [{ id: 1, nombre: 'Alumnos' }] }),
  normativa(4, { titulo: 'Calendario', anio: 2023 }),
]

const datos: DatosNormativa = { titulo: 'Nueva', descripcion: null, numero: '9/25', anio: 2025, etiquetas: ['x'] }

function crearContexto() {
  const client = crearQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children)
  return { client, wrapper }
}

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  vi.mocked(obtenerNormativas).mockResolvedValue(todas)
})

afterEach(() => {
  sessionStorage.clear()
})

describe('CLAVE_NORMATIVAS', () => {
  it('es la clave única de las normativas: ["normativas"]', () => {
    expect(CLAVE_NORMATIVAS).toEqual(['normativas'])
  })
})

describe('useNormativas', () => {
  it('devuelve las normativas ordenadas por año descendente y luego id descendente', async () => {
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useNormativas(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map((n) => n.id)).toEqual([3, 2, 4, 1])
  })

  it('filtra por la búsqueda (sin tildes ni mayúsculas) y mantiene el orden', async () => {
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useNormativas({ busqueda: 'ALUMNOS' }), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map((n) => n.id)).toEqual([3])

    const { result: tilde } = renderHook(() => useNormativas({ busqueda: 'regimen' }), { wrapper })
    await waitFor(() => expect(tilde.current.isSuccess).toBe(true))
    expect(tilde.current.data?.map((n) => n.id)).toEqual([1])
  })

  it('varios hooks con la clave única comparten una sola consulta', async () => {
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => [useNormativas(), useNormativas({ busqueda: 'a' }), useNormativa(2)], { wrapper })
    await waitFor(() => expect(result.current.every((q) => q.isSuccess)).toBe(true))
    expect(obtenerNormativas).toHaveBeenCalledTimes(1)
  })

  it('si obtenerNormativas falla, expone el error', async () => {
    vi.mocked(obtenerNormativas).mockRejectedValue(new Error('sin red'))
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useNormativas(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useNormativa', () => {
  it('devuelve la normativa con ese id numérico', async () => {
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useNormativa(2), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.titulo).toBe('Asistencia')
  })

  it('devuelve null si no existe o si el id es null', async () => {
    const { wrapper } = crearContexto()
    const { result: inexistente } = renderHook(() => useNormativa(999), { wrapper })
    const { result: sinId } = renderHook(() => useNormativa(null), { wrapper })
    await waitFor(() => expect(inexistente.current.isSuccess && sinId.current.isSuccess).toBe(true))
    expect(inexistente.current.data).toBeNull()
    expect(sinId.current.data).toBeNull()
  })
})

describe('useGuardarNormativa', () => {
  it('sin id llama a altaNormativa(datos, archivo), devuelve el id e invalida normativas y etiquetas', async () => {
    vi.mocked(altaNormativa).mockResolvedValue(31)
    const { client, wrapper } = crearContexto()
    client.setQueryData(['normativas'], todas)
    client.setQueryData(['etiquetas'], [])
    const archivo = new File(['%PDF'], 'a.pdf')
    const { result } = renderHook(() => useGuardarNormativa(), { wrapper })

    let id: number | undefined
    await act(async () => {
      id = await result.current.mutateAsync({ datos, archivo })
    })

    expect(id).toBe(31)
    expect(altaNormativa).toHaveBeenCalledWith(datos, archivo)
    expect(editarNormativa).not.toHaveBeenCalled()
    expect(client.getQueryState(['normativas'])?.isInvalidated).toBe(true)
    expect(client.getQueryState(['etiquetas'])?.isInvalidated).toBe(true)
  })

  it('con id llama a editarNormativa(id, datos, archivo) y también invalida ambas claves', async () => {
    vi.mocked(editarNormativa).mockResolvedValue(8)
    const { client, wrapper } = crearContexto()
    client.setQueryData(['normativas'], todas)
    client.setQueryData(['etiquetas'], [])
    const { result } = renderHook(() => useGuardarNormativa(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: 8, datos })
    })

    expect(editarNormativa).toHaveBeenCalledWith(8, datos, undefined)
    expect(altaNormativa).not.toHaveBeenCalled()
    expect(client.getQueryState(['normativas'])?.isInvalidated).toBe(true)
    expect(client.getQueryState(['etiquetas'])?.isInvalidated).toBe(true)
  })

  it('si la secuencia falla, expone el error y no invalida nada', async () => {
    vi.mocked(altaNormativa).mockRejectedValue({ code: '23505' })
    const { client, wrapper } = crearContexto()
    client.setQueryData(['normativas'], todas)
    client.setQueryData(['etiquetas'], [])
    const { result } = renderHook(() => useGuardarNormativa(), { wrapper })

    await act(async () => {
      result.current.mutate({ datos, archivo: new File(['x'], 'a.pdf') })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error).toEqual({ code: '23505' })
    expect(client.getQueryState(['normativas'])?.isInvalidated).toBe(false)
    expect(client.getQueryState(['etiquetas'])?.isInvalidated).toBe(false)
  })
})

describe('useEliminarNormativa', () => {
  it('llama a eliminarNormativa con el id e invalida la lista', async () => {
    vi.mocked(eliminarNormativa).mockResolvedValue(undefined)
    const { client, wrapper } = crearContexto()
    client.setQueryData(['normativas'], todas)
    const { result } = renderHook(() => useEliminarNormativa(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(todas[0].id)
    })

    expect(eliminarNormativa).toHaveBeenCalledWith(todas[0].id)
    expect(client.getQueryState(['normativas'])?.isInvalidated).toBe(true)
  })

  it('si falla, expone el error y no invalida', async () => {
    vi.mocked(eliminarNormativa).mockRejectedValue({ code: 'PGRST116' })
    const { client, wrapper } = crearContexto()
    client.setQueryData(['normativas'], todas)
    const { result } = renderHook(() => useEliminarNormativa(), { wrapper })

    await act(async () => {
      result.current.mutate(todas[0].id)
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(client.getQueryState(['normativas'])?.isInvalidated).toBe(false)
  })
})

// tsconfig.app.json no incluye los tipos de Node: se declara lo único que se usa de `process`.
const proceso = (globalThis as unknown as { process: { on(e: string, f: () => void): void; off(e: string, f: () => void): void } }).process

describe('contarDescarga', () => {
  it('cuenta la descarga de la normativa la primera vez', () => {
    vi.mocked(contarDescargaNormativa).mockResolvedValue(undefined)
    contarDescarga(7)
    expect(contarDescargaNormativa).toHaveBeenCalledTimes(1)
    expect(contarDescargaNormativa).toHaveBeenCalledWith(7)
  })

  it('no vuelve a contar la misma normativa en la visita', () => {
    vi.mocked(contarDescargaNormativa).mockResolvedValue(undefined)
    contarDescarga(7)
    contarDescarga(7)
    expect(contarDescargaNormativa).toHaveBeenCalledTimes(1)
  })

  it('cuenta una vez cada normativa distinta', () => {
    vi.mocked(contarDescargaNormativa).mockResolvedValue(undefined)
    contarDescarga(7)
    contarDescarga(8)
    contarDescarga(8)
    expect(vi.mocked(contarDescargaNormativa).mock.calls.map((c) => c[0])).toEqual([7, 8])
  })

  it('no espera la respuesta: devuelve de inmediato aunque la consulta no termine', () => {
    vi.mocked(contarDescargaNormativa).mockReturnValue(new Promise(() => {}))
    expect(contarDescarga(7)).toBeUndefined()
  })

  it('si la consulta falla (promesa rechazada), no lanza ni deja un rechazo sin atender', async () => {
    const sinAtender = vi.fn()
    proceso.on('unhandledRejection', sinAtender)
    vi.mocked(contarDescargaNormativa).mockRejectedValue(new Error('sin red'))
    expect(() => contarDescarga(7)).not.toThrow()
    await new Promise((r) => setTimeout(r, 10))
    proceso.off('unhandledRejection', sinAtender)
    expect(sinAtender).not.toHaveBeenCalled()
  })
})
