import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { obtenerTalleres } from '@/features/talleres/consultas'
import type { Taller } from '@/features/talleres/types'
import { renderConProviders } from '@/test/utils'
import { TalleresCatalogoPage } from './TalleresCatalogoPage'

/*
 * El catálogo sale solo de obtenerTalleres (el nivel se deduce de taller.categoria.nivel_id): ya no
 * depende de obtenerCategorias. Solo se muestran los publicados.
 */
vi.mock('@/features/talleres/consultas', () => ({
  obtenerCategorias: vi.fn(),
  crearCategoria: vi.fn(),
  actualizarCategoria: vi.fn(),
  obtenerTalleres: vi.fn(),
  guardarTaller: vi.fn(),
  cambiarEstadoTaller: vi.fn(),
}))

const SIN_RESULTADOS = 'No encontramos talleres'

function taller(id: number, nombre: string, p: Partial<Taller> & { nivel_id?: number } = {}): Taller {
  const { nivel_id = 3, ...resto } = p
  return {
    id,
    categoria_id: 7,
    nombre,
    descripcion: '',
    estado: 'PUBLICADO',
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-10T00:00:00Z',
    categoria: { nivel_id },
    destinatario: [],
    etiqueta: [],
    ...resto,
  }
}

const datos = [
  taller(1, 'Cuidados en redes', { nivel_id: 3, destinatario: [{ id: 1, nombre: 'Directivos' }], etiqueta: [{ id: 1, nombre: 'Ciberseguridad' }] }),
  taller(2, 'Huerta escolar', { nivel_id: 2, destinatario: [{ id: 4, nombre: 'Docentes' }], descripcion: 'Cultivo en el patio' }),
  taller(3, 'Borrador secreto', { estado: 'BORRADOR', nivel_id: 3 }),
  taller(4, 'Taller dado de baja', { estado: 'INACTIVO', nivel_id: 2 }),
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(obtenerTalleres).mockResolvedValue(datos)
})

describe('TalleresCatalogoPage: publicados', () => {
  it('muestra solo los talleres publicados, no borradores ni inactivos', async () => {
    renderConProviders(<TalleresCatalogoPage />)
    expect(await screen.findByText('Cuidados en redes')).toBeInTheDocument()
    expect(screen.getByText('Huerta escolar')).toBeInTheDocument()
    expect(screen.queryByText('Borrador secreto')).not.toBeInTheDocument()
    expect(screen.queryByText('Taller dado de baja')).not.toBeInTheDocument()
  })

  it('cada tarjeta muestra el nivel de su categoría', async () => {
    renderConProviders(<TalleresCatalogoPage />)
    await screen.findByText('Cuidados en redes')
    const tarjetas = screen.getAllByRole('article')
    expect(within(tarjetas[0]).getByText(/secundario/i)).toBeInTheDocument()
    expect(within(tarjetas[1]).getByText(/primario/i)).toBeInTheDocument()
  })

  it('con todos los talleres sin publicar muestra "sin resultados"', async () => {
    vi.mocked(obtenerTalleres).mockResolvedValue([datos[2], datos[3]])
    renderConProviders(<TalleresCatalogoPage />)
    expect(await screen.findByText(SIN_RESULTADOS)).toBeInTheDocument()
  })
})

describe('TalleresCatalogoPage: búsqueda', () => {
  it('busca en el nombre sin distinguir mayúsculas ni tildes', async () => {
    renderConProviders(<TalleresCatalogoPage />)
    await screen.findByText('Cuidados en redes')
    await userEvent.type(screen.getByLabelText('Buscar por nombre o etiqueta'), 'CUIDÁDOS')
    expect(screen.getByText('Cuidados en redes')).toBeInTheDocument()
    expect(screen.queryByText('Huerta escolar')).not.toBeInTheDocument()
  })

  it('busca en la descripción y en las etiquetas', async () => {
    renderConProviders(<TalleresCatalogoPage />)
    await screen.findByText('Cuidados en redes')
    const buscador = screen.getByLabelText('Buscar por nombre o etiqueta')

    await userEvent.type(buscador, 'patio')
    expect(screen.getByText('Huerta escolar')).toBeInTheDocument()
    expect(screen.queryByText('Cuidados en redes')).not.toBeInTheDocument()

    await userEvent.clear(buscador)
    await userEvent.type(buscador, 'ciberseguridad')
    expect(screen.getByText('Cuidados en redes')).toBeInTheDocument()
    expect(screen.queryByText('Huerta escolar')).not.toBeInTheDocument()
  })

  it('una búsqueda que solo coincide con un borrador no lo muestra', async () => {
    renderConProviders(<TalleresCatalogoPage />)
    await screen.findByText('Cuidados en redes')
    await userEvent.type(screen.getByLabelText('Buscar por nombre o etiqueta'), 'secreto')
    expect(screen.queryByText('Borrador secreto')).not.toBeInTheDocument()
    expect(screen.getByText(SIN_RESULTADOS)).toBeInTheDocument()
  })
})

describe('TalleresCatalogoPage: filtros', () => {
  it('ofrece los 5 niveles', () => {
    vi.mocked(obtenerTalleres).mockResolvedValue([])
    renderConProviders(<TalleresCatalogoPage />)
    const select = screen.getByLabelText('Nivel')
    expect(select.querySelectorAll('option')).toHaveLength(6) // "Nivel" + 5 niveles
  })

  it('filtra por nivel a través de la categoría del taller', async () => {
    renderConProviders(<TalleresCatalogoPage />)
    await screen.findByText('Cuidados en redes')
    await userEvent.selectOptions(screen.getByLabelText('Nivel'), '2')
    expect(screen.getByText('Huerta escolar')).toBeInTheDocument()
    expect(screen.queryByText('Cuidados en redes')).not.toBeInTheDocument()
  })

  it('filtra por destinatario', async () => {
    renderConProviders(<TalleresCatalogoPage />)
    await screen.findByText('Cuidados en redes')
    await userEvent.selectOptions(screen.getByLabelText('Destinado a'), '1')
    expect(screen.getByText('Cuidados en redes')).toBeInTheDocument()
    expect(screen.queryByText('Huerta escolar')).not.toBeInTheDocument()
  })

  it('combina nivel y destinatario: sin coincidencias muestra "sin resultados"', async () => {
    renderConProviders(<TalleresCatalogoPage />)
    await screen.findByText('Cuidados en redes')
    await userEvent.selectOptions(screen.getByLabelText('Nivel'), '2')
    await userEvent.selectOptions(screen.getByLabelText('Destinado a'), '1')
    expect(screen.getByText(SIN_RESULTADOS)).toBeInTheDocument()
  })
})

describe('TalleresCatalogoPage: carga y error', () => {
  it('mientras cargan los talleres muestra el esqueleto, no "sin resultados"', () => {
    vi.mocked(obtenerTalleres).mockReturnValue(new Promise(() => {}))
    renderConProviders(<TalleresCatalogoPage />)
    expect(screen.queryByText(SIN_RESULTADOS)).not.toBeInTheDocument()
    // El skeleton no tiene rol accesible: se lo detecta por su clase.
    expect(document.querySelector('.animate-pulse')).not.toBeNull()
  })

  it('si falla la carga muestra el error con reintento, no "sin resultados"; reintentar lo recupera', async () => {
    vi.mocked(obtenerTalleres).mockRejectedValueOnce(new Error('sin red'))
    renderConProviders(<TalleresCatalogoPage />)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText(SIN_RESULTADOS)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Cuidados en redes')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
