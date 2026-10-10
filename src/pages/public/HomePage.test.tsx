import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { obtenerConfiguracion } from '@/features/configuracion/consultas'
import { obtenerNormativas } from '@/features/normativas/consultas'
import type { Normativa } from '@/features/normativas/types'
import { obtenerTalleres } from '@/features/talleres/consultas'
import { renderConProviders } from '@/test/utils'
import { HomePage } from './HomePage'

/*
 * Criterios 5 y 6 en la Home. Se mockean solo los módulos `consultas` (normativas, talleres, configuración).
 * La sección "Normativas" muestra las tres primeras en el orden de la lista (año desc, id desc, que ya aplica
 * useNormativas), y cada una con un enlace "Descargar" al PDF público (href = url, target="_blank"),
 * como en NormativasPublicPage.
 */
vi.mock('@/features/normativas/consultas', () => ({
  subirArchivo: vi.fn(),
  borrarArchivo: vi.fn(),
  guardarNormativa: vi.fn(),
  eliminarFilaNormativa: vi.fn(),
  obtenerNormativas: vi.fn(),
  contarDescargaNormativa: vi.fn(),
}))
vi.mock('@/features/talleres/consultas', () => ({
  obtenerCategorias: vi.fn(),
  crearCategoria: vi.fn(),
  actualizarCategoria: vi.fn(),
  obtenerTalleres: vi.fn(),
  guardarTaller: vi.fn(),
  cambiarEstadoTaller: vi.fn(),
}))
vi.mock('@/features/configuracion/consultas', () => ({
  obtenerConfiguracion: vi.fn(),
  guardarConfiguracion: vi.fn(),
}))

function normativa(id: number, anio: number): Normativa {
  return {
    id,
    titulo: `Normativa ${id}`,
    descripcion: null,
    numero: `${id}/${anio}`,
    anio,
    ruta_archivo: `00000000-0000-0000-0000-00000000000${id}.pdf`,
    descargas: 0,
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-10T00:00:00Z',
    etiqueta: [],
    url: `https://ejemplo.test/normativas/${id}.pdf`,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(obtenerTalleres).mockResolvedValue([])
  vi.mocked(obtenerConfiguracion).mockRejectedValue(new Error('sin configuración'))
})

async function seccionNormativas() {
  const titulo = await screen.findByRole('heading', { name: 'Normativas' })
  return within(titulo.closest('section') as HTMLElement)
}

describe('HomePage: normativas', () => {
  it('muestra solo las tres primeras: año descendente y luego id descendente', async () => {
    vi.mocked(obtenerNormativas).mockResolvedValue([
      normativa(1, 2020),
      normativa(2, 2024),
      normativa(3, 2022),
      normativa(4, 2024),
      normativa(5, 2021),
    ])
    renderConProviders(<HomePage />)
    const seccion = await seccionNormativas()
    const items = await seccion.findAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Normativa 4')
    expect(items[1]).toHaveTextContent('Normativa 2')
    expect(items[2]).toHaveTextContent('Normativa 3')
  })

  it('cada una trae un enlace "Descargar" al PDF público en otra pestaña', async () => {
    vi.mocked(obtenerNormativas).mockResolvedValue([normativa(7, 2024)])
    renderConProviders(<HomePage />)
    const seccion = await seccionNormativas()
    const enlace = await seccion.findByRole('link', { name: /Descargar/ })
    expect(enlace).toHaveAttribute('href', 'https://ejemplo.test/normativas/7.pdf')
    expect(enlace).toHaveAttribute('target', '_blank')
  })

  it('sin normativas muestra el estado vacío', async () => {
    vi.mocked(obtenerNormativas).mockResolvedValue([])
    renderConProviders(<HomePage />)
    expect(await screen.findByText('No hay normativas publicadas')).toBeInTheDocument()
  })
})
