import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  actualizarEstablecimiento,
  crearEstablecimiento,
  obtenerEstablecimiento,
  obtenerLocalidades,
} from '@/features/establecimientos/consultas'
import type { Establecimiento } from '@/features/establecimientos/types'
import { renderConProviders } from '@/test/utils'
import { EstablecimientoFormPage } from './EstablecimientoFormPage'

/*
 * Criterios 3 a 6, 9 y 10 en el formulario. Se mockea solo `establecimientos/consultas` (contrato: ver
 * useEstablecimientos.test.ts); `errores.ts`, hooks y la página son los reales. Textos y roles asumidos:
 *  - etiquetas "Nombre del establecimiento", "CUE (opcional)" y "Localidad" (select, valor = id de localidad);
 *    botones "Crear establecimiento" / "Guardar cambios" / "Cancelar" / "Reintentar".
 *  - rutas /admin/establecimientos/nuevo (localidad precargada desde ?localidad=) y /admin/establecimientos/:id/editar.
 *  - zod espejo de la base: nombre con trim, obligatorio, máx. 200; CUE vacío -> null, solo dígitos, máx. 20. Los errores
 *    de validación salen en elementos con role="alert" y no guardan.
 *  - 23505 del nombre / del CUE: mensajes exactos de abajo, junto al campo (role alert). Otro error (incluido un 23505
 *    de otra constraint): el mensaje general. No navega.
 *  - crear: crearEstablecimiento({ cue, nombre, localidad_id }); editar: actualizarEstablecimiento(id, { cue, nombre, localidad_id }).
 *  - al guardar vuelve a /admin/establecimientos?localidad=<localidad_id guardada>.
 *  - id inválido o inexistente al editar: texto /no encontrad/i y sin formulario.
 */
vi.mock('@/features/establecimientos/consultas', () => ({
  obtenerLocalidades: vi.fn(),
  obtenerEstablecimientos: vi.fn(),
  obtenerEstablecimiento: vi.fn(),
  crearEstablecimiento: vi.fn(),
  actualizarEstablecimiento: vi.fn(),
}))

const MSG_NOMBRE = 'Ya existe un establecimiento con ese nombre en esta localidad (puede estar dado de baja)'
const MSG_CUE = 'Ya existe un establecimiento con ese CUE'
const MSG_GENERAL = 'No pudimos guardar el establecimiento. Probá de nuevo.'
const ERR_NOMBRE = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "establecimiento_localidad_nombre_uniq"',
}
const ERR_CUE = { code: '23505', message: 'duplicate key value violates unique constraint "establecimiento_cue_key"' }
const ERR_OTRO = { code: '23505', message: 'duplicate key value violates unique constraint "otra_key"' }

const existente: Establecimiento = {
  id: 7,
  cue: '5400123',
  nombre: 'Escuela Normal',
  localidad_id: 2,
  activo: true,
  created_at: '2026-10-10T00:00:00Z',
  updated_at: '2026-10-10T00:00:00Z',
}

function Listado() {
  const { search } = useLocation()
  return <p>Listado {search}</p>
}

function renderPagina(ruta: string) {
  return renderConProviders(
    <Routes>
      <Route path="/admin/establecimientos/nuevo" element={<EstablecimientoFormPage />} />
      <Route path="/admin/establecimientos/:id/editar" element={<EstablecimientoFormPage />} />
      <Route path="/admin/establecimientos" element={<Listado />} />
    </Routes>,
    { ruta },
  )
}

const nombre = () => screen.getByLabelText('Nombre del establecimiento')
const cue = () => screen.getByLabelText('CUE (opcional)')
const localidad = () => screen.getByLabelText('Localidad')

async function localidadesListas() {
  await waitFor(() => expect(within_options()).toBeGreaterThan(1))
}
function within_options() {
  return (screen.getByLabelText('Localidad') as HTMLSelectElement).options.length
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(obtenerLocalidades).mockResolvedValue([
    { id: 1, nombre: '25 de Mayo' },
    { id: 2, nombre: 'Posadas' },
    { id: 3, nombre: 'Oberá' },
  ])
  vi.mocked(obtenerEstablecimiento).mockImplementation(async (id) => (id === 7 ? existente : null))
})

describe('EstablecimientoFormPage: alta', () => {
  it('precarga la localidad desde ?localidad=', async () => {
    renderPagina('/admin/establecimientos/nuevo?localidad=3')
    await localidadesListas()
    await waitFor(() => expect(localidad()).toHaveValue('3'))
  })

  it('crea con nombre sin espacios en los bordes, CUE vacío como null y vuelve al listado de la localidad', async () => {
    vi.mocked(crearEstablecimiento).mockResolvedValue({ ...existente, id: 8 })
    renderPagina('/admin/establecimientos/nuevo?localidad=3')
    await localidadesListas()
    await waitFor(() => expect(localidad()).toHaveValue('3'))
    await userEvent.type(nombre(), '  Escuela Nueva  ')
    await userEvent.click(screen.getByRole('button', { name: 'Crear establecimiento' }))

    await waitFor(() => expect(crearEstablecimiento).toHaveBeenCalledTimes(1))
    expect(crearEstablecimiento).toHaveBeenCalledWith({ cue: null, nombre: 'Escuela Nueva', localidad_id: 3 })
    expect(await screen.findByText('Listado ?localidad=3')).toBeInTheDocument()
  })

  it('guarda el CUE con dígitos (sin espacios en los bordes)', async () => {
    vi.mocked(crearEstablecimiento).mockResolvedValue({ ...existente, id: 8 })
    renderPagina('/admin/establecimientos/nuevo?localidad=2')
    await localidadesListas()
    await waitFor(() => expect(localidad()).toHaveValue('2'))
    await userEvent.type(nombre(), 'Escuela Nueva')
    await userEvent.type(cue(), ' 5400999 ')
    await userEvent.click(screen.getByRole('button', { name: 'Crear establecimiento' }))
    await waitFor(() => expect(crearEstablecimiento).toHaveBeenCalledTimes(1))
    expect(crearEstablecimiento).toHaveBeenCalledWith({ cue: '5400999', nombre: 'Escuela Nueva', localidad_id: 2 })
  })

  it('con el nombre en blanco muestra un error de validación y no guarda', async () => {
    renderPagina('/admin/establecimientos/nuevo?localidad=2')
    await localidadesListas()
    await userEvent.type(nombre(), '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Crear establecimiento' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(crearEstablecimiento).not.toHaveBeenCalled()
  })

  it('con un nombre de más de 200 caracteres muestra un error y no guarda', async () => {
    renderPagina('/admin/establecimientos/nuevo?localidad=2')
    await localidadesListas()
    await userEvent.click(nombre())
    await userEvent.paste('a'.repeat(201))
    await userEvent.click(screen.getByRole('button', { name: 'Crear establecimiento' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(crearEstablecimiento).not.toHaveBeenCalled()
  })

  it('con un CUE que no son solo dígitos muestra un error y no guarda (criterio 5)', async () => {
    renderPagina('/admin/establecimientos/nuevo?localidad=2')
    await localidadesListas()
    await userEvent.type(nombre(), 'Escuela Nueva')
    await userEvent.type(cue(), '54A0123')
    await userEvent.click(screen.getByRole('button', { name: 'Crear establecimiento' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(crearEstablecimiento).not.toHaveBeenCalled()
  })

  it('sin localidad elegida muestra un error y no guarda', async () => {
    renderPagina('/admin/establecimientos/nuevo')
    await localidadesListas()
    await userEvent.type(nombre(), 'Escuela Nueva')
    await userEvent.click(screen.getByRole('button', { name: 'Crear establecimiento' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(crearEstablecimiento).not.toHaveBeenCalled()
  })
})

describe('EstablecimientoFormPage: errores de la base (criterios 3, 4 y 6)', () => {
  async function enviarAlta() {
    renderPagina('/admin/establecimientos/nuevo?localidad=2')
    await localidadesListas()
    await waitFor(() => expect(localidad()).toHaveValue('2'))
    await userEvent.type(nombre(), 'Escuela Nueva')
    await userEvent.click(screen.getByRole('button', { name: 'Crear establecimiento' }))
  }

  it('con el nombre repetido en la localidad marca el campo nombre y no navega', async () => {
    vi.mocked(crearEstablecimiento).mockRejectedValue(ERR_NOMBRE)
    await enviarAlta()
    expect(await screen.findByText(MSG_NOMBRE)).toBeInTheDocument()
    expect(screen.queryByText(MSG_CUE)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Listado/)).not.toBeInTheDocument()
  })

  it('con el CUE repetido marca el campo CUE y no el del nombre', async () => {
    vi.mocked(crearEstablecimiento).mockRejectedValue(ERR_CUE)
    await enviarAlta()
    expect(await screen.findByText(MSG_CUE)).toBeInTheDocument()
    expect(screen.queryByText(MSG_NOMBRE)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Listado/)).not.toBeInTheDocument()
  })

  it('con un 23505 de otra constraint muestra el error general, no el de nombre ni el de CUE', async () => {
    vi.mocked(crearEstablecimiento).mockRejectedValue(ERR_OTRO)
    await enviarAlta()
    expect(await screen.findByText(MSG_GENERAL)).toBeInTheDocument()
    expect(screen.queryByText(MSG_NOMBRE)).not.toBeInTheDocument()
    expect(screen.queryByText(MSG_CUE)).not.toBeInTheDocument()
  })

  it('ante cualquier otro error muestra el error general y no navega', async () => {
    vi.mocked(crearEstablecimiento).mockRejectedValue(new Error('sin red'))
    await enviarAlta()
    expect(await screen.findByText(MSG_GENERAL)).toBeInTheDocument()
    expect(screen.queryByText(/^Listado/)).not.toBeInTheDocument()
  })
})

describe('EstablecimientoFormPage: edición', () => {
  it('carga los valores, guarda { cue, nombre, localidad_id } y vuelve a la localidad guardada (que cambió)', async () => {
    vi.mocked(actualizarEstablecimiento).mockResolvedValue({ ...existente, localidad_id: 3 })
    renderPagina('/admin/establecimientos/7/editar')
    await waitFor(() => expect(nombre()).toHaveValue('Escuela Normal'))
    await localidadesListas()
    expect(cue()).toHaveValue('5400123')
    await waitFor(() => expect(localidad()).toHaveValue('2'))

    await userEvent.selectOptions(localidad(), 'Oberá')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(actualizarEstablecimiento).toHaveBeenCalledTimes(1))
    expect(actualizarEstablecimiento).toHaveBeenCalledWith(7, {
      cue: '5400123',
      nombre: 'Escuela Normal',
      localidad_id: 3,
    })
    expect(crearEstablecimiento).not.toHaveBeenCalled()
    expect(await screen.findByText('Listado ?localidad=3')).toBeInTheDocument()
  })

  it('un establecimiento sin CUE se edita con el campo vacío y guarda cue null', async () => {
    vi.mocked(obtenerEstablecimiento).mockResolvedValue({ ...existente, cue: null })
    vi.mocked(actualizarEstablecimiento).mockResolvedValue(existente)
    renderPagina('/admin/establecimientos/7/editar')
    await waitFor(() => expect(nombre()).toHaveValue('Escuela Normal'))
    await localidadesListas()
    expect(cue()).toHaveValue('')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(actualizarEstablecimiento).toHaveBeenCalledTimes(1))
    expect(vi.mocked(actualizarEstablecimiento).mock.calls[0][1]).toMatchObject({ cue: null })
  })

  it('al editar, el nombre repetido marca el campo nombre', async () => {
    vi.mocked(actualizarEstablecimiento).mockRejectedValue(ERR_NOMBRE)
    renderPagina('/admin/establecimientos/7/editar')
    await waitFor(() => expect(nombre()).toHaveValue('Escuela Normal'))
    await localidadesListas()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText(MSG_NOMBRE)).toBeInTheDocument()
  })

  it('al editar, el CUE repetido marca el campo CUE', async () => {
    vi.mocked(actualizarEstablecimiento).mockRejectedValue(ERR_CUE)
    renderPagina('/admin/establecimientos/7/editar')
    await waitFor(() => expect(nombre()).toHaveValue('Escuela Normal'))
    await localidadesListas()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText(MSG_CUE)).toBeInTheDocument()
  })

  it('si la carga falla muestra un alert con "Reintentar" y no el formulario; reintentar lo recupera', async () => {
    vi.mocked(obtenerEstablecimiento).mockRejectedValueOnce(new Error('sin red'))
    renderPagina('/admin/establecimientos/7/editar')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByLabelText('Nombre del establecimiento')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(nombre()).toHaveValue('Escuela Normal'))
  })
})

describe('EstablecimientoFormPage: error al cargar las localidades', () => {
  it('muestra un alert con "Reintentar" y no el formulario; reintentar lo recupera', async () => {
    vi.mocked(obtenerLocalidades).mockRejectedValueOnce(new Error('sin red'))
    renderPagina('/admin/establecimientos/nuevo?localidad=2')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByLabelText('Nombre del establecimiento')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await localidadesListas()
    await waitFor(() => expect(localidad()).toHaveValue('2'))
  })
})

describe('EstablecimientoFormPage: no encontrado (criterio 10)', () => {
  it('un id inexistente muestra "no encontrado" y no el formulario', async () => {
    renderPagina('/admin/establecimientos/999/editar')
    expect(await screen.findByText(/no encontrad/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('Nombre del establecimiento')).not.toBeInTheDocument()
  })

  it('un id inválido muestra "no encontrado" sin consultar', async () => {
    renderPagina('/admin/establecimientos/abc/editar')
    expect(await screen.findByText(/no encontrad/i)).toBeInTheDocument()
    expect(obtenerEstablecimiento).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Nombre del establecimiento')).not.toBeInTheDocument()
  })

  it('un id fuera del rango de un int de Postgres es "no encontrado" sin consultar', async () => {
    renderPagina('/admin/establecimientos/99999999999/editar')
    expect(await screen.findByText(/no encontrad/i)).toBeInTheDocument()
    expect(obtenerEstablecimiento).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
  })

  it('un id cero o negativo también es "no encontrado"', async () => {
    renderPagina('/admin/establecimientos/0/editar')
    expect(await screen.findByText(/no encontrad/i)).toBeInTheDocument()
  })
})
