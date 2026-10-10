import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { crearWrapperQuery } from '@/test/utils'
import type { Taller } from '../types'
import { useTalleres } from './useTalleres'

// vi.mock se ejecuta antes que los imports: los datos que usa tienen que crearse con vi.hoisted.
const { talleres } = vi.hoisted(() => {
  const base: Omit<Taller, 'id' | 'categoriaId' | 'titulo' | 'etiquetas'> = {
    descripcion: '',
    destinatarios: ['docentes'],
    fecha: '2026-01-01',
    responsable: 'Ministerio',
    recursos: [],
    descargas: 0,
    estado: 'publicado',
  }
  const talleres: Taller[] = [
    { ...base, id: 't1', categoriaId: 10, titulo: 'Huerta escolar', etiquetas: ['ambiente'] },
    { ...base, id: 't2', categoriaId: 20, titulo: 'Programación', etiquetas: ['tecnología'] },
  ]
  return { talleres }
})

vi.mock('../mocks/talleres.mock', () => ({ talleresMock: talleres }))

describe('useTalleres', () => {
  it('filtra por categoriaId numérico', async () => {
    const { result } = renderHook(() => useTalleres({ categoriaId: 20 }), { wrapper: crearWrapperQuery() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map((t) => t.id)).toEqual(['t2'])
  })

  it('busca por etiqueta sin distinguir mayúsculas', async () => {
    const { result } = renderHook(() => useTalleres({ busqueda: 'AMBIENTE' }), { wrapper: crearWrapperQuery() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map((t) => t.id)).toEqual(['t1'])
  })
})
