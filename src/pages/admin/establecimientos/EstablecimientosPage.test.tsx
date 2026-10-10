import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  actualizarEstablecimiento,
  obtenerEstablecimientos,
  obtenerLocalidades,
} from '@/features/establecimientos/consultas'
import type { Establecimiento } from '@/features/establecimientos/types'
import { renderConProviders } from '@/test/utils'
import { EstablecimientosPage } from './EstablecimientosPage'

/*
 * Criterios 7, 8 y 9 en el panel. Se mockea solo `establecimientos/consultas` (contrato: ver useEstablecimientos.test.ts);
 * hooks, filtrar y la página son los reales. Textos y roles asumidos:
 *  - Select (combobox) con etiqueta "Localidad" y una opción por localidad; el valor es el id. Su valor sale de ?localidad=<id>.
 *  - Sin localidad válida elegida: texto "Elegí una localidad para ver sus establecimientos" y no se consulta nada.
 *  - Campo de búsqueda con etiqueta "Buscar por nombre o CUE" (role textbox).
 *  - Una fila (role row) por establecimiento con nombre y CUE; los inactivos llevan el texto "Inactivo".
 *  - Cada fila: enlace "Editar" a /admin/establecimientos/<id>/editar; los activos, botón "Dar de baja" (abre role dialog
 *    con botones "Dar de baja" y "Cancelar"; al confirmar actualizarEstablecimiento(id, { activo: false }));
 *    los inactivos, botón "Reactivar" (actualizarEstablecimiento(id, { activo: true })).
 *  - Estado vacío: "Esta localidad todavía no tiene establecimientos" y enlaces "Nuevo establecimiento" a
 *    /admin/establecimientos/nuevo?localidad=<id> (todos los enlaces con ese nombre llevan la localidad).
 *  - Al elegir una localidad se actualiza la URL (?localidad=<id>).
 *  - Si la carga falla, un alert con "Reintentar".
 */
vi.mock('@/features/establecimientos/consultas', () => ({
  obtenerLocalidades: vi.fn(),
  obtenerEstablecimientos: vi.fn(),
  obtenerEstablecimiento: vi.fn(),
  crearEstablecimiento: vi.fn(),
  actualizarEstablecimiento: vi.fn(),
}))

function est(id: number, p: Partial<Establecimiento> = {}): Establecimiento {
  return {
    id,
    cue: null,
    nombre: `Escuela ${id}`,
    localidad_id: 2,
    activo: true,
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-10T00:00:00Z',
    ...p,
  }
}

const normal = est(1, { nombre: 'Escuela Normal', cue: '5400123' })
const jardin = est(2, { nombre: 'Jardín Ñandú', cue: '5400456' })
const baja = est(3, { nombre: 'Instituto Cerrado', cue: '5400789', activo: false })

function Ubicacion() {
  const { search } = useLocation()
  return <p data-testid="search">{search}</p>
}

function renderPagina(ruta = '/admin/establecimientos?localidad=2') {
  return renderConProviders(
    <>
      <Routes>
        <Route path="/admin/establecimientos" element={<EstablecimientosPage />} />
      </Routes>
      <Ubicacion />
    </>,
    { ruta },
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(obtenerLocalidades).mockResolvedValue([
    { id: 1, nombre: '25 de Mayo' },
    { id: 2, nombre: 'Posadas' },
  ])
  vi.mocked(obtenerEstablecimientos).mockResolvedValue([normal, jardin, baja])
  vi.mocked(actualizarEstablecimiento).mockResolvedValue(normal)
})

const fila = async (texto: string) => within(await screen.findByRole('row', { name: new RegExp(texto) }))

describe('EstablecimientosPage: sin localidad (criterio 8)', () => {
  it('pide elegir una localidad y no consulta establecimientos', async () => {
    renderPagina('/admin/establecimientos')
    expect(await screen.findByText('Elegí una localidad para ver sus establecimientos')).toBeInTheDocument()
    expect(obtenerEstablecimientos).not.toHaveBeenCalled()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('ofrece una opción por localidad', async () => {
    renderPagina('/admin/establecimientos')
    const select = await screen.findByLabelText('Localidad')
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Posadas' })).toBeInTheDocument())
    expect(within(select).getByRole('option', { name: '25 de Mayo' })).toBeInTheDocument()
  })

  it('un ?localidad= inválido se trata como sin localidad', async () => {
    renderPagina('/admin/establecimientos?localidad=abc')
    expect(await screen.findByText('Elegí una localidad para ver sus establecimientos')).toBeInTheDocument()
    expect(obtenerEstablecimientos).not.toHaveBeenCalled()
  })
})

describe('EstablecimientosPage: localidad inexistente y error de localidades', () => {
  it('un ?localidad= que no está en la lista pide elegir una y no consulta establecimientos', async () => {
    renderPagina('/admin/establecimientos?localidad=40000')
    expect(await screen.findByText('Elegí una localidad para ver sus establecimientos')).toBeInTheDocument()
    await waitFor(() => expect(obtenerLocalidades).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 20))
    expect(obtenerEstablecimientos).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('si fallan las localidades muestra un alert con "Reintentar" que las recupera', async () => {
    vi.mocked(obtenerLocalidades).mockRejectedValueOnce(new Error('sin red'))
    renderPagina()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await fila('Escuela Normal')
  })
})

describe('EstablecimientosPage: elegir localidad (criterio 9)', () => {
  it('al elegir una localidad la guarda en la URL y lista sus establecimientos', async () => {
    renderPagina('/admin/establecimientos')
    const select = await screen.findByLabelText('Localidad')
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Posadas' })).toBeInTheDocument())
    await userEvent.selectOptions(select, 'Posadas')

    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('?localidad=2'))
    expect(obtenerEstablecimientos).toHaveBeenCalledWith(2)
    await fila('Escuela Normal')
  })

  it('con ?localidad=2 en la URL preselecciona la localidad y lista sus establecimientos', async () => {
    renderPagina()
    await fila('Escuela Normal')
    expect(screen.getByLabelText('Localidad')).toHaveValue('2')
    expect(obtenerEstablecimientos).toHaveBeenCalledWith(2)
  })
})

describe('EstablecimientosPage: lista (criterio 7)', () => {
  it('muestra todos los establecimientos con su CUE y marca los inactivos como "Inactivo"', async () => {
    renderPagina()
    const activa = await fila('Escuela Normal')
    expect(activa.getByText('5400123')).toBeInTheDocument()
    expect(activa.queryByText('Inactivo')).not.toBeInTheDocument()
    const inactiva = await fila('Instituto Cerrado')
    expect(inactiva.getByText('Inactivo')).toBeInTheDocument()
  })

  it('busca por nombre sin distinguir mayúsculas ni tildes', async () => {
    renderPagina()
    await fila('Escuela Normal')
    await userEvent.type(screen.getByRole('textbox', { name: 'Buscar por nombre o CUE' }), 'NANDU')
    await waitFor(() => expect(screen.queryByRole('row', { name: /Escuela Normal/ })).not.toBeInTheDocument())
    expect(screen.getByRole('row', { name: /Jardín Ñandú/ })).toBeInTheDocument()
  })

  it('busca por CUE', async () => {
    renderPagina()
    await fila('Escuela Normal')
    await userEvent.type(screen.getByRole('textbox', { name: 'Buscar por nombre o CUE' }), '5400789')
    await waitFor(() => expect(screen.queryByRole('row', { name: /Escuela Normal/ })).not.toBeInTheDocument())
    expect(screen.getByRole('row', { name: /Instituto Cerrado/ })).toBeInTheDocument()
  })

  it('"Editar" lleva al formulario con el id numérico', async () => {
    renderPagina()
    const f = await fila('Jardín Ñandú')
    expect(f.getByRole('link', { name: 'Editar' })).toHaveAttribute('href', '/admin/establecimientos/2/editar')
  })

  it('si la carga falla muestra un alert con "Reintentar" que la recupera', async () => {
    vi.mocked(obtenerEstablecimientos).mockRejectedValueOnce(new Error('sin red'))
    renderPagina()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await fila('Escuela Normal')
  })
})

describe('EstablecimientosPage: estado vacío (criterio 8)', () => {
  it('sin establecimientos muestra el vacío con "Nuevo establecimiento" que lleva la localidad', async () => {
    vi.mocked(obtenerEstablecimientos).mockResolvedValue([])
    renderPagina()
    expect(await screen.findByText('Esta localidad todavía no tiene establecimientos')).toBeInTheDocument()
    const enlaces = screen.getAllByRole('link', { name: 'Nuevo establecimiento' })
    expect(enlaces.length).toBeGreaterThan(0)
    for (const e of enlaces) expect(e).toHaveAttribute('href', '/admin/establecimientos/nuevo?localidad=2')
  })
})

describe('EstablecimientosPage: baja y reactivación (criterio 7)', () => {
  it('"Dar de baja" pide confirmación y no cambia nada hasta confirmar', async () => {
    renderPagina()
    const f = await fila('Escuela Normal')
    await userEvent.click(f.getByRole('button', { name: 'Dar de baja' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(actualizarEstablecimiento).not.toHaveBeenCalled()
  })

  it('al confirmar marca activo=false en ese establecimiento y vuelve a pedir la lista', async () => {
    renderPagina()
    const f = await fila('Escuela Normal')
    await userEvent.click(f.getByRole('button', { name: 'Dar de baja' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Dar de baja' }))

    await waitFor(() => expect(actualizarEstablecimiento).toHaveBeenCalledWith(1, { activo: false }))
    await waitFor(() => expect(obtenerEstablecimientos).toHaveBeenCalledTimes(2))
  })

  it('al cancelar no cambia nada', async () => {
    renderPagina()
    const f = await fila('Escuela Normal')
    await userEvent.click(f.getByRole('button', { name: 'Dar de baja' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    expect(actualizarEstablecimiento).not.toHaveBeenCalled()
  })

  it('un inactivo no ofrece "Dar de baja" y "Reactivar" marca activo=true sin confirmación', async () => {
    renderPagina()
    const f = await fila('Instituto Cerrado')
    expect(f.queryByRole('button', { name: 'Dar de baja' })).not.toBeInTheDocument()
    await userEvent.click(f.getByRole('button', { name: 'Reactivar' }))
    await waitFor(() => expect(actualizarEstablecimiento).toHaveBeenCalledWith(3, { activo: true }))
  })

  it('si la baja falla avisa con un alert', async () => {
    vi.mocked(actualizarEstablecimiento).mockRejectedValue(new Error('sin red'))
    renderPagina()
    const f = await fila('Escuela Normal')
    await userEvent.click(f.getByRole('button', { name: 'Dar de baja' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Dar de baja' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
