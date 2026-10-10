import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLAVE_TALLERES } from '@/features/talleres/hooks/useTalleres'
import { crearQueryClient } from '@/test/utils'
import { actualizarRecurso, insertarRecurso, ordenarRecursos, urlFirmada } from '../consultas'
import { altaArchivo, eliminarRecurso, reemplazarArchivo } from '../secuencias'
import type { Recurso } from '../types'
import {
  useActualizarRecurso,
  useAltaArchivos,
  useCrearEnlace,
  useEliminarRecurso,
  useOrdenarRecursos,
  useReemplazarArchivo,
  useVerArchivo,
} from './useRecursos'

/*
 * Contrato (consultas.ts y secuencias.ts: ver secuencias.test.ts; ambos lanzan ante cualquier error):
 *   ordenarRecursos(tallerId: number, ids: number[]): Promise<void>      // rpc ordenar_recursos
 *   CLAVE_TALLERES = ['talleres']  (exportada desde talleres/hooks/useTalleres.ts)
 * Hooks de mutación (React Query); todos invalidan CLAVE_TALLERES al terminar bien y NO al fallar:
 *   useCrearEnlace().mutateAsync({ tallerId, nombre, url, recursos })
 *       -> insertarRecurso({ taller_id, nombre, tipo: 'ENLACE', url, orden: max(recursos.orden) + 1 })
 *   useActualizarRecurso().mutateAsync({ id, cambios })      -> actualizarRecurso(id, cambios)   // cambios: { nombre?, url? }
 *   useReemplazarArchivo().mutateAsync({ recurso, file })    -> reemplazarArchivo(recurso, file)
 *   useEliminarRecurso().mutateAsync(recurso)                -> eliminarRecurso(recurso)
 *   useOrdenarRecursos().mutateAsync({ tallerId, ids })      -> ordenarRecursos(tallerId, ids)
 * Lote de archivos:
 *   useAltaArchivos() -> { subir(tallerId: number, files: File[], recursos: Recurso[]): Promise<void>,
 *                          estados: { archivo: File; estado: 'esperando' | 'subiendo' | 'listo' | 'error'; motivo?: string }[],
 *                          enCurso: boolean }
 *   Procesa de a uno, en orden: altaArchivo(tallerId, file_i, max(recursos.orden) + 1 + i) (max de lista vacía = 0).
 *   Un error de un archivo no corta el lote: queda estado 'error' con `motivo` = mensajeDeErrorRecurso(error).
 *   Invalida CLAVE_TALLERES una sola vez, al terminar el lote.
 */
vi.mock('../consultas', () => ({
  subirArchivo: vi.fn(),
  borrarArchivo: vi.fn(),
  insertarRecurso: vi.fn(),
  actualizarRecurso: vi.fn(),
  eliminarFilaRecurso: vi.fn(),
  ordenarRecursos: vi.fn(),
  urlFirmada: vi.fn(),
}))
vi.mock('../secuencias', () => ({
  altaArchivo: vi.fn(),
  reemplazarArchivo: vi.fn(),
  eliminarRecurso: vi.fn(),
}))
vi.mock('@/features/talleres/consultas', () => ({
  obtenerCategorias: vi.fn(),
  crearCategoria: vi.fn(),
  actualizarCategoria: vi.fn(),
  obtenerTalleres: vi.fn(),
  guardarTaller: vi.fn(),
  cambiarEstadoTaller: vi.fn(),
}))

function recurso(id: number, orden: number, p: Partial<Recurso> = {}): Recurso {
  return {
    id,
    taller_id: 5,
    nombre: `Recurso ${id}`,
    tipo: 'PDF',
    ruta_archivo: `5/${id}.pdf`,
    url: null,
    tamanio_bytes: 100,
    orden,
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-10T00:00:00Z',
    ...p,
  }
}

function crearContexto() {
  const client = crearQueryClient()
  const invalidar = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children)
  return { invalidar, wrapper }
}

const invalidaTalleres = expect.objectContaining({ queryKey: CLAVE_TALLERES })

beforeEach(() => {
  vi.resetAllMocks()
})

describe('CLAVE_TALLERES', () => {
  it('es la clave única de los talleres: ["talleres"]', () => {
    expect(CLAVE_TALLERES).toEqual(['talleres'])
  })
})

describe('useCrearEnlace', () => {
  it('inserta un recurso ENLACE al final de la lista (max + 1) e invalida los talleres', async () => {
    vi.mocked(insertarRecurso).mockResolvedValue(recurso(30, 5, { tipo: 'ENLACE', ruta_archivo: null, tamanio_bytes: null }))
    const { wrapper, invalidar } = crearContexto()
    const { result } = renderHook(() => useCrearEnlace(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        tallerId: 5,
        nombre: 'Video de la clase',
        url: 'https://youtu.be/dQw4w9WgXcQ',
        recursos: [recurso(1, 1), recurso(2, 4)],
      })
    })

    expect(vi.mocked(insertarRecurso).mock.calls[0][0]).toEqual({
      taller_id: 5,
      nombre: 'Video de la clase',
      tipo: 'ENLACE',
      url: 'https://youtu.be/dQw4w9WgXcQ',
      orden: 5,
    })
    expect(invalidar).toHaveBeenCalledWith(invalidaTalleres)
  })

  it('el primer recurso de un taller sin recursos queda con orden 1', async () => {
    vi.mocked(insertarRecurso).mockResolvedValue(recurso(30, 1))
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useCrearEnlace(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ tallerId: 5, nombre: 'Sitio', url: 'https://example.com', recursos: [] })
    })

    expect(vi.mocked(insertarRecurso).mock.calls[0][0]).toMatchObject({ orden: 1 })
  })

  it('si insertarRecurso falla, expone el error y no invalida', async () => {
    vi.mocked(insertarRecurso).mockRejectedValue({ code: '23514' })
    const { wrapper, invalidar } = crearContexto()
    const { result } = renderHook(() => useCrearEnlace(), { wrapper })

    await act(async () => {
      result.current.mutate({ tallerId: 5, nombre: 'Sitio', url: 'http://malo', recursos: [] })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalidar).not.toHaveBeenCalled()
  })
})

describe('useActualizarRecurso', () => {
  it('llama a actualizarRecurso(id, cambios) e invalida los talleres', async () => {
    vi.mocked(actualizarRecurso).mockResolvedValue(recurso(1, 1))
    const { wrapper, invalidar } = crearContexto()
    const { result } = renderHook(() => useActualizarRecurso(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: 1, cambios: { nombre: 'Nuevo nombre' } })
    })

    expect(actualizarRecurso).toHaveBeenCalledWith(1, { nombre: 'Nuevo nombre' })
    expect(invalidar).toHaveBeenCalledWith(invalidaTalleres)
  })

  it('si falla, no invalida', async () => {
    vi.mocked(actualizarRecurso).mockRejectedValue(new Error('sin red'))
    const { wrapper, invalidar } = crearContexto()
    const { result } = renderHook(() => useActualizarRecurso(), { wrapper })

    await act(async () => {
      result.current.mutate({ id: 1, cambios: { nombre: 'x' } })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalidar).not.toHaveBeenCalled()
  })
})

describe('useReemplazarArchivo', () => {
  it('llama a reemplazarArchivo(recurso, file) e invalida los talleres', async () => {
    const actual = recurso(1, 1)
    const file = new File(['x'], 'nuevo.pdf')
    vi.mocked(reemplazarArchivo).mockResolvedValue(actual)
    const { wrapper, invalidar } = crearContexto()
    const { result } = renderHook(() => useReemplazarArchivo(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ recurso: actual, file })
    })

    expect(reemplazarArchivo).toHaveBeenCalledWith(actual, file)
    expect(invalidar).toHaveBeenCalledWith(invalidaTalleres)
  })

  it('si falla, expone el error y no invalida', async () => {
    vi.mocked(reemplazarArchivo).mockRejectedValue({ status: 413 })
    const { wrapper, invalidar } = crearContexto()
    const { result } = renderHook(() => useReemplazarArchivo(), { wrapper })

    await act(async () => {
      result.current.mutate({ recurso: recurso(1, 1), file: new File(['x'], 'nuevo.pdf') })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toEqual({ status: 413 })
    expect(invalidar).not.toHaveBeenCalled()
  })
})

describe('useEliminarRecurso', () => {
  it('llama a eliminarRecurso(recurso) e invalida los talleres', async () => {
    const actual = recurso(1, 1)
    vi.mocked(eliminarRecurso).mockResolvedValue(undefined)
    const { wrapper, invalidar } = crearContexto()
    const { result } = renderHook(() => useEliminarRecurso(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync(actual)
    })

    expect(eliminarRecurso).toHaveBeenCalledWith(actual)
    expect(invalidar).toHaveBeenCalledWith(invalidaTalleres)
  })

  it('si falla, no invalida', async () => {
    vi.mocked(eliminarRecurso).mockRejectedValue(new Error('rls'))
    const { wrapper, invalidar } = crearContexto()
    const { result } = renderHook(() => useEliminarRecurso(), { wrapper })

    await act(async () => {
      result.current.mutate(recurso(1, 1))
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalidar).not.toHaveBeenCalled()
  })
})

describe('useOrdenarRecursos', () => {
  it('llama a ordenarRecursos(tallerId, ids) con la lista completa e invalida los talleres', async () => {
    vi.mocked(ordenarRecursos).mockResolvedValue(undefined)
    const { wrapper, invalidar } = crearContexto()
    const { result } = renderHook(() => useOrdenarRecursos(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ tallerId: 5, ids: [3, 1, 2] })
    })

    expect(ordenarRecursos).toHaveBeenCalledWith(5, [3, 1, 2])
    expect(invalidar).toHaveBeenCalledWith(invalidaTalleres)
  })

  it('si falla, no invalida', async () => {
    vi.mocked(ordenarRecursos).mockRejectedValue({ code: 'P0001' })
    const { wrapper, invalidar } = crearContexto()
    const { result } = renderHook(() => useOrdenarRecursos(), { wrapper })

    await act(async () => {
      result.current.mutate({ tallerId: 5, ids: [1] })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalidar).not.toHaveBeenCalled()
  })
})

describe('useAltaArchivos', () => {
  const a = new File(['a'], 'a.pdf')
  const b = new File(['b'], 'b.pdf')
  const c = new File(['c'], 'c.pdf')
  const existentes = [recurso(1, 2), recurso(2, 4)]

  it('sube cada archivo con orden max + 1 + i, calculado sobre la lista del momento de empezar', async () => {
    vi.mocked(altaArchivo).mockImplementation(async (_t, file, orden) => recurso(100 + orden, orden, { nombre: file.name }))
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useAltaArchivos(), { wrapper })

    await act(async () => {
      await result.current.subir(5, [a, b, c], existentes)
    })

    expect(vi.mocked(altaArchivo).mock.calls).toEqual([
      [5, a, 5],
      [5, b, 6],
      [5, c, 7],
    ])
  })

  it('con una lista vacía de recursos el primero queda con orden 1', async () => {
    vi.mocked(altaArchivo).mockResolvedValue(recurso(100, 1))
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useAltaArchivos(), { wrapper })

    await act(async () => {
      await result.current.subir(5, [a, b], [])
    })

    expect(vi.mocked(altaArchivo).mock.calls.map((llamada) => llamada[2])).toEqual([1, 2])
  })

  it('procesa de a uno: no arranca el siguiente hasta que termina el anterior', async () => {
    const pendientes: Array<() => void> = []
    vi.mocked(altaArchivo).mockImplementation(
      (_t, _f, orden) => new Promise<Recurso>((resolver) => pendientes.push(() => resolver(recurso(100 + orden, orden)))),
    )
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useAltaArchivos(), { wrapper })

    let terminado: Promise<void>
    act(() => {
      terminado = result.current.subir(5, [a, b], existentes)
    })

    await waitFor(() => expect(altaArchivo).toHaveBeenCalledTimes(1))
    expect(altaArchivo).toHaveBeenLastCalledWith(5, a, 5)

    await act(async () => pendientes[0]())
    await waitFor(() => expect(altaArchivo).toHaveBeenCalledTimes(2))
    expect(altaArchivo).toHaveBeenLastCalledWith(5, b, 6)

    await act(async () => {
      pendientes[1]()
      await terminado
    })
  })

  it('reporta el estado de cada archivo: esperando, subiendo y listo', async () => {
    const pendientes: Array<() => void> = []
    vi.mocked(altaArchivo).mockImplementation(
      (_t, _f, orden) => new Promise<Recurso>((resolver) => pendientes.push(() => resolver(recurso(100 + orden, orden)))),
    )
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useAltaArchivos(), { wrapper })

    let terminado: Promise<void>
    act(() => {
      terminado = result.current.subir(5, [a, b], existentes)
    })

    await waitFor(() => expect(result.current.estados.map((e) => e.estado)).toEqual(['subiendo', 'esperando']))
    expect(result.current.estados.map((e) => e.archivo)).toEqual([a, b])
    expect(result.current.enCurso).toBe(true)

    await act(async () => pendientes[0]())
    await waitFor(() => expect(result.current.estados.map((e) => e.estado)).toEqual(['listo', 'subiendo']))

    await act(async () => {
      pendientes[1]()
      await terminado
    })
    expect(result.current.estados.map((e) => e.estado)).toEqual(['listo', 'listo'])
    expect(result.current.enCurso).toBe(false)
  })

  it('si un archivo falla queda en "error" con el motivo y el lote sigue con los demás', async () => {
    vi.mocked(altaArchivo).mockImplementation(async (_t, file, orden) => {
      if (file === b) throw { status: 413, statusCode: '413', message: 'too big' }
      return recurso(100 + orden, orden)
    })
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useAltaArchivos(), { wrapper })

    await act(async () => {
      await result.current.subir(5, [a, b, c], existentes)
    })

    expect(altaArchivo).toHaveBeenCalledTimes(3)
    expect(result.current.estados.map((e) => e.estado)).toEqual(['listo', 'error', 'listo'])
    expect(result.current.estados[1].motivo).toMatch(/tamaño/i)
    expect(result.current.estados[0].motivo).toBeUndefined()
  })

  it('invalida los talleres una sola vez, al terminar el lote (no por archivo)', async () => {
    const pendientes: Array<() => void> = []
    vi.mocked(altaArchivo).mockImplementation(
      (_t, _f, orden) => new Promise<Recurso>((resolver) => pendientes.push(() => resolver(recurso(100 + orden, orden)))),
    )
    const { wrapper, invalidar } = crearContexto()
    const { result } = renderHook(() => useAltaArchivos(), { wrapper })

    let terminado: Promise<void>
    act(() => {
      terminado = result.current.subir(5, [a, b, c], existentes)
    })

    await waitFor(() => expect(altaArchivo).toHaveBeenCalledTimes(1))
    await act(async () => pendientes[0]())
    await waitFor(() => expect(altaArchivo).toHaveBeenCalledTimes(2))
    expect(invalidar).not.toHaveBeenCalled()

    await act(async () => pendientes[1]())
    await waitFor(() => expect(altaArchivo).toHaveBeenCalledTimes(3))
    expect(invalidar).not.toHaveBeenCalled()

    await act(async () => {
      pendientes[2]()
      await terminado
    })
    expect(invalidar).toHaveBeenCalledTimes(1)
    expect(invalidar).toHaveBeenCalledWith(invalidaTalleres)
  })

  it('invalida una sola vez aunque algún archivo del lote falle', async () => {
    vi.mocked(altaArchivo).mockImplementation(async (_t, file, orden) => {
      if (file === a) throw new Error('sin red')
      return recurso(100 + orden, orden)
    })
    const { wrapper, invalidar } = crearContexto()
    const { result } = renderHook(() => useAltaArchivos(), { wrapper })

    await act(async () => {
      await result.current.subir(5, [a, b], existentes)
    })

    expect(invalidar).toHaveBeenCalledTimes(1)
  })
})

describe('useAltaArchivos: un lote nuevo limpia el anterior', () => {
  it('subir con una lista vacía reinicia los estados (los errores del lote anterior desaparecen)', async () => {
    vi.mocked(altaArchivo).mockRejectedValue(new Error('sin red'))
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useAltaArchivos(), { wrapper })

    await act(async () => {
      await result.current.subir(5, [new File(['a'], 'a.pdf')], [])
    })
    expect(result.current.estados.map((e) => e.estado)).toEqual(['error'])

    await act(async () => {
      await result.current.subir(5, [], [])
    })

    expect(result.current.estados).toEqual([])
    expect(altaArchivo).toHaveBeenCalledTimes(1)
  })
})

/*
 * useVerArchivo().mutateAsync(ruta): pide urlFirmada(ruta) y abre la URL con window.open en otra pestaña. Si firmar falla,
 * no abre nada y el error queda en la mutación.
 */
describe('useVerArchivo', () => {
  it('firma la ruta y abre la URL en otra pestaña', async () => {
    vi.mocked(urlFirmada).mockResolvedValue('https://storage.example/firmada?token=abc')
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null)
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useVerArchivo(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync('5/a.pdf')
    })

    expect(urlFirmada).toHaveBeenCalledWith('5/a.pdf')
    expect(abrir.mock.calls[0][0]).toBe('https://storage.example/firmada?token=abc')
    expect(abrir.mock.calls[0][1]).toBe('_blank')
    abrir.mockRestore()
  })

  it('si no se puede firmar, expone el error y no abre nada', async () => {
    vi.mocked(urlFirmada).mockRejectedValue(new Error('rls'))
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null)
    const { wrapper } = crearContexto()
    const { result } = renderHook(() => useVerArchivo(), { wrapper })

    await act(async () => {
      result.current.mutate('5/a.pdf')
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(abrir).not.toHaveBeenCalled()
    abrir.mockRestore()
  })
})
