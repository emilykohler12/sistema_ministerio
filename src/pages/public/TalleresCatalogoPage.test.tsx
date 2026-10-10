import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { obtenerCategorias } from '@/features/talleres/consultas'
import { renderConProviders } from '@/test/utils'
import { TalleresCatalogoPage } from './TalleresCatalogoPage'

vi.mock('@/features/talleres/consultas', () => ({
  obtenerCategorias: vi.fn(),
  crearCategoria: vi.fn(),
  actualizarCategoria: vi.fn(),
}))

const SIN_RESULTADOS = 'No encontramos talleres'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TalleresCatalogoPage: filtro por nivel', () => {
  it('ofrece los 5 niveles', () => {
    vi.mocked(obtenerCategorias).mockResolvedValue([])
    renderConProviders(<TalleresCatalogoPage />)
    const select = screen.getByLabelText('Nivel')
    expect(select.querySelectorAll('option')).toHaveLength(6) // "Nivel" + 5 niveles
  })

  it('mientras cargan las categorías del nivel elegido muestra la carga, no "sin resultados"', async () => {
    vi.mocked(obtenerCategorias).mockReturnValue(new Promise(() => {}))
    renderConProviders(<TalleresCatalogoPage />)
    // Sin nivel elegido, los talleres (mock) cargan y no hay nada que mostrar.
    expect(await screen.findByText(SIN_RESULTADOS)).toBeInTheDocument()
    // El skeleton no tiene rol accesible: se lo detecta por su clase.
    expect(document.querySelector('.animate-pulse')).toBeNull()

    await userEvent.selectOptions(screen.getByLabelText('Nivel'), '3')
    expect(screen.queryByText(SIN_RESULTADOS)).not.toBeInTheDocument()
    expect(document.querySelector('.animate-pulse')).not.toBeNull()
  })

  it('si fallan las categorías del nivel elegido muestra el error con reintento, no "sin resultados"', async () => {
    vi.mocked(obtenerCategorias).mockRejectedValueOnce(new Error('sin red'))
    vi.mocked(obtenerCategorias).mockResolvedValue([])
    renderConProviders(<TalleresCatalogoPage />)
    expect(await screen.findByText(SIN_RESULTADOS)).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Nivel'), '3')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText(SIN_RESULTADOS)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText(SIN_RESULTADOS)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
