import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { borrarArchivo, eliminarFilaNormativa, obtenerNormativas } from '@/features/normativas/consultas'
import type { Normativa } from '@/features/normativas/types'
import { renderConProviders } from '@/test/utils'
import { NormativasAdminPage } from './NormativasAdminPage'

/*
 * Criterios 4 y 5 en el panel. Se mockea solo `normativas/consultas` (contrato: ver secuencias.test.ts y
 * useNormativas.test.ts); hooks, secuencias y la página son los reales. Textos y roles asumidos:
 *  - un campo de texto (role textbox) de búsqueda; una fila (role row) por normativa con título, número, año, descargas.
 *  - cada fila tiene el enlace "Editar" a /admin/normativas/nueva?editar=<id> y el botón "Eliminar".
 *  - "Eliminar" abre un diálogo de confirmación (role dialog) con botón "Eliminar" y "Cancelar".
 *    Al confirmar: se borra la fila y después el archivo (eliminarNormativa) con la ruta que devuelve la fila borrada.
 *    Al cancelar no pasa nada.
 *  - si la baja falla muestra un elemento con role="alert".
 */
vi.mock('@/features/normativas/consultas', () => ({
  subirArchivo: vi.fn(),
  borrarArchivo: vi.fn(),
  guardarNormativa: vi.fn(),
  eliminarFilaNormativa: vi.fn(),
  obtenerNormativas: vi.fn(),
  contarDescargaNormativa: vi.fn(),
}))

function normativa(id: number, p: Partial<Normativa> = {}): Normativa {
  return {
    id,
    titulo: `Normativa ${id}`,
    descripcion: null,
    numero: `${id}/24`,
    anio: 2024,
    ruta_archivo: `0000000${id}-0000-0000-0000-000000000000.pdf`,
    descargas: 0,
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-10T00:00:00Z',
    etiqueta: [],
    url: `https://ejemplo.test/normativas/${id}.pdf`,
    ...p,
  }
}

const regimen = normativa(1, { titulo: 'Régimen de evaluación', anio: 2022, descargas: 7, etiqueta: [{ id: 1, nombre: 'Primaria' }] })
const asistencia = normativa(2, { titulo: 'Asistencia', anio: 2024 })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(obtenerNormativas).mockResolvedValue([regimen, asistencia])
  vi.mocked(eliminarFilaNormativa).mockResolvedValue(regimen.ruta_archivo)
  vi.mocked(borrarArchivo).mockResolvedValue(undefined)
})

const fila = async (texto: string) => within(await screen.findByRole('row', { name: new RegExp(texto) }))

describe('NormativasAdminPage: lista', () => {
  it('lista las normativas (año desc) con número, año y contador de descargas', async () => {
    renderConProviders(<NormativasAdminPage />)
    const regimenFila = await fila('Régimen de evaluación')
    expect(regimenFila.getByText('1/24')).toBeInTheDocument()
    expect(regimenFila.getByText('2022')).toBeInTheDocument()
    expect(regimenFila.getByText('7')).toBeInTheDocument()
    const filas = screen.getAllByRole('row').slice(1)
    expect(filas[0]).toHaveTextContent('Asistencia')
    expect(filas[1]).toHaveTextContent('Régimen de evaluación')
  })

  it('"Editar" lleva al formulario con el id numérico', async () => {
    renderConProviders(<NormativasAdminPage />)
    const f = await fila('Asistencia')
    expect(f.getByRole('link', { name: 'Editar' })).toHaveAttribute('href', '/admin/normativas/nueva?editar=2')
  })

  it('busca sin distinguir mayúsculas ni tildes', async () => {
    renderConProviders(<NormativasAdminPage />)
    await fila('Asistencia')
    await userEvent.type(screen.getByRole('textbox'), 'REGIMEN')
    await waitFor(() => expect(screen.queryByRole('row', { name: /Asistencia/ })).not.toBeInTheDocument())
    expect(screen.getByRole('row', { name: /Régimen de evaluación/ })).toBeInTheDocument()
  })
})

describe('NormativasAdminPage: eliminar (criterio 4)', () => {
  it('pide confirmación y no borra nada hasta confirmar', async () => {
    renderConProviders(<NormativasAdminPage />)
    const f = await fila('Régimen de evaluación')
    await userEvent.click(f.getByRole('button', { name: 'Eliminar' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(eliminarFilaNormativa).not.toHaveBeenCalled()
    expect(borrarArchivo).not.toHaveBeenCalled()
  })

  it('al confirmar borra la fila de esa normativa y después su archivo', async () => {
    const orden: string[] = []
    vi.mocked(eliminarFilaNormativa).mockImplementation(async () => {
      orden.push('fila')
      return regimen.ruta_archivo
    })
    vi.mocked(borrarArchivo).mockImplementation(async () => {
      orden.push('archivo')
    })
    renderConProviders(<NormativasAdminPage />)
    const f = await fila('Régimen de evaluación')
    await userEvent.click(f.getByRole('button', { name: 'Eliminar' }))
    const dialogo = within(await screen.findByRole('dialog'))
    await userEvent.click(dialogo.getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => expect(borrarArchivo).toHaveBeenCalledTimes(1))
    expect(eliminarFilaNormativa).toHaveBeenCalledWith(1)
    expect(borrarArchivo).toHaveBeenCalledWith(regimen.ruta_archivo)
    expect(orden).toEqual(['fila', 'archivo'])
  })

  it('al cancelar no borra nada', async () => {
    renderConProviders(<NormativasAdminPage />)
    const f = await fila('Régimen de evaluación')
    await userEvent.click(f.getByRole('button', { name: 'Eliminar' }))
    const dialogo = within(await screen.findByRole('dialog'))
    await userEvent.click(dialogo.getByRole('button', { name: 'Cancelar' }))

    expect(eliminarFilaNormativa).not.toHaveBeenCalled()
    expect(borrarArchivo).not.toHaveBeenCalled()
  })

  it('tras la baja vuelve a pedir la lista (la fila desaparece)', async () => {
    renderConProviders(<NormativasAdminPage />)
    const f = await fila('Régimen de evaluación')
    vi.mocked(obtenerNormativas).mockResolvedValue([asistencia])
    await userEvent.click(f.getByRole('button', { name: 'Eliminar' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => expect(screen.queryByRole('row', { name: /Régimen de evaluación/ })).not.toBeInTheDocument())
    expect(obtenerNormativas).toHaveBeenCalledTimes(2)
  })

  it('si falla el borrado de la fila avisa con un alert y no borra el archivo', async () => {
    vi.mocked(eliminarFilaNormativa).mockRejectedValue({ code: 'PGRST116' })
    renderConProviders(<NormativasAdminPage />)
    const f = await fila('Régimen de evaluación')
    await userEvent.click(f.getByRole('button', { name: 'Eliminar' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Eliminar' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(borrarArchivo).not.toHaveBeenCalled()
  })
})
