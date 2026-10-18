import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  actualizarEstablecimiento,
  crearEstablecimiento,
  obtenerEstablecimientos,
  obtenerLocalidades,
  obtenerSinVincular,
  vincularInstitucion,
} from '@/features/establecimientos/consultas'
import type { Establecimiento, GrupoSinVincular } from '@/features/establecimientos/types'
import { renderConProviders } from '@/test/utils'
import { SinVincularPage } from './SinVincularPage'

/*
 * Pantalla /admin/establecimientos/sin-vincular (issue #19, criterios 1, 3, 4, 5, 7 y 9). Se mockea solo
 * `establecimientos/consultas`; hooks, esquema, errores y la página son los reales. Contrato de la interfaz:
 *  - h1 "Instituciones sin vincular" (tabindex -1): recibe el foco después de vincular o crear.
 *  - Tabla con una fila (role row) por grupo, en el orden en que llega; celdas con localidad, nombre, variantes (texto de cada
 *    variante, y la palabra "También" solo si hay), descargas y última descarga. En cada fila los botones "Vincular" y
 *    "Crear establecimiento".
 *  - Select (combobox) con etiqueta "Localidad": "Todas las localidades" + las localidades de los grupos cargados (sin useLocalidades).
 *  - Vacío: "No hay instituciones sin vincular". Carga: sin vacío, sin alert y sin filas. Error: alert con "Reintentar".
 *  - Diálogo "Vincular institución": Buscador con etiqueta "Buscar establecimiento"; un fieldset (role group, nombre
 *    /establecimientos/i) con un radio por establecimiento ACTIVO de la localidad del grupo (useEstablecimientos); botones
 *    "Vincular" (deshabilitado sin elección y mientras guarda) y "Cancelar". Error de la consulta: alert con "Reintentar".
 *    Error DA005: alert dentro del diálogo con "ya no está disponible"; el diálogo sigue abierto.
 *  - Diálogo "Crear establecimiento": textbox "Nombre del establecimiento" con el nombre del grupo, textbox "CUE (opcional)",
 *    la localidad fija como texto (sin combobox) y el botón "Crear y vincular". Crea con { nombre, cue, localidad_id } y vincula
 *    con el nombre ORIGINAL del grupo. Nombre duplicado: un alert dentro del diálogo con el mensaje de siempre y la guía
 *    ("Vincular" y "reactivar"). Si crea y falla la vinculación: alert con "Reintentar", que solo vincula con el id creado.
 *  - Resultado en un role="status" de la página, siempre montado (vacío al principio) y del que solo cambia el texto: "Ya estaba
 *    vinculado" si la RPC devuelve 0; si no, un texto con "vincul".
 *  - Mientras guardan, los dos diálogos no se cierran: "Cancelar" deshabilitado y Escape sin efecto.
 */
vi.mock('@/features/establecimientos/consultas', () => ({
  obtenerLocalidades: vi.fn(),
  obtenerEstablecimientos: vi.fn(),
  obtenerEstablecimiento: vi.fn(),
  crearEstablecimiento: vi.fn(),
  actualizarEstablecimiento: vi.fn(),
  obtenerSinVincular: vi.fn(),
  vincularInstitucion: vi.fn(),
}))

function grupo(p: Partial<GrupoSinVincular>): GrupoSinVincular {
  return {
    localidad_id: 2,
    localidad: 'Posadas',
    nombre: 'Escuela',
    variantes: [],
    descargas: 1,
    ultima: '2026-10-16T15:00:00Z',
    ...p,
  }
}

function est(id: number, p: Partial<Establecimiento> = {}): Establecimiento {
  return {
    id,
    cue: null,
    nombre: `Establecimiento ${id}`,
    localidad_id: 2,
    activo: true,
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-10T00:00:00Z',
    ...p,
  }
}

const g123 = grupo({ nombre: 'Escuela 123', variantes: ['ESCUELA 123'], descargas: 3 })
const g999 = grupo({ nombre: 'Escuela 999' })
const gNorte = grupo({ localidad_id: 5, localidad: 'Oberá', nombre: 'Colegio Norte' })

const normal = est(40, { nombre: 'Escuela Normal' })
const jardin = est(41, { nombre: 'Jardín Ñandú' })
const cerrado = est(42, { nombre: 'Instituto Cerrado', activo: false })

function renderPagina() {
  return renderConProviders(<SinVincularPage />, { ruta: '/admin/establecimientos/sin-vincular' })
}

const fila = async (texto: RegExp) => within(await screen.findByRole('row', { name: texto }))
const titulo = () => screen.getByRole('heading', { level: 1, name: 'Instituciones sin vincular' })

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(obtenerSinVincular).mockResolvedValue([g123, g999, gNorte])
  vi.mocked(obtenerEstablecimientos).mockResolvedValue([normal, jardin, cerrado])
  vi.mocked(vincularInstitucion).mockResolvedValue(3)
  vi.mocked(crearEstablecimiento).mockResolvedValue(est(50, { nombre: 'Escuela 123' }))
})

async function abrirVincular(texto = /Escuela 123/) {
  const f = await fila(texto)
  await userEvent.click(f.getByRole('button', { name: 'Vincular' }))
  return await screen.findByRole('dialog')
}

async function abrirCrear(texto = /Escuela 123/) {
  const f = await fila(texto)
  await userEvent.click(f.getByRole('button', { name: 'Crear establecimiento' }))
  return await screen.findByRole('dialog')
}

describe('SinVincularPage: lista (criterio 1)', () => {
  it('muestra una fila por grupo con localidad, nombre, variantes y descargas', async () => {
    renderPagina()
    const f = await fila(/Escuela 123/)
    expect(f.getByText('Posadas')).toBeInTheDocument()
    expect(f.getByText('Escuela 123')).toBeInTheDocument()
    expect(f.getByText(/ESCUELA 123/)).toBeInTheDocument()
    expect(f.getByText('3')).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /Escuela 999/ })).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /Colegio Norte/ })).toBeInTheDocument()
  })

  it('un grupo sin variantes no muestra la leyenda de variantes', async () => {
    renderPagina()
    const f = await fila(/Escuela 999/)
    expect(f.queryByText(/también/i)).not.toBeInTheDocument()
  })

  it('respeta el orden en que llegan los grupos', async () => {
    renderPagina()
    await fila(/Escuela 123/)
    const filas = screen.getAllByRole('row').slice(1)
    expect(filas).toHaveLength(3)
    expect(filas[0]).toHaveTextContent('Escuela 123')
    expect(filas[1]).toHaveTextContent('Escuela 999')
    expect(filas[2]).toHaveTextContent('Colegio Norte')
  })

  it('el filtro de localidad ofrece solo las localidades de los grupos y filtra en el cliente', async () => {
    renderPagina()
    await fila(/Escuela 123/)
    const select = screen.getByLabelText('Localidad')
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Todas las localidades',
      'Oberá',
      'Posadas',
    ])
    expect(obtenerLocalidades).not.toHaveBeenCalled()

    await userEvent.selectOptions(select, 'Oberá')
    expect(screen.getByRole('row', { name: /Colegio Norte/ })).toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /Escuela 123/ })).not.toBeInTheDocument()
  })
})

describe('SinVincularPage: estados (criterio 7)', () => {
  it('sin grupos muestra "No hay instituciones sin vincular"', async () => {
    vi.mocked(obtenerSinVincular).mockResolvedValue([])
    renderPagina()
    expect(await screen.findByText('No hay instituciones sin vincular')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('mientras carga no muestra el vacío, ni error, ni filas', async () => {
    vi.mocked(obtenerSinVincular).mockReturnValue(new Promise(() => {}))
    renderPagina()
    await new Promise((r) => setTimeout(r, 20))
    expect(titulo()).toBeInTheDocument()
    expect(screen.queryByText('No hay instituciones sin vincular')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /Escuela/ })).not.toBeInTheDocument()
  })

  it('si la carga falla muestra un alert con "Reintentar" que la recupera', async () => {
    vi.mocked(obtenerSinVincular).mockRejectedValueOnce(new Error('sin red'))
    renderPagina()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('No hay instituciones sin vincular')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await fila(/Escuela 123/)
  })
})

describe('SinVincularPage: vincular (criterios 4, 5 y 9)', () => {
  it('abre el diálogo con los establecimientos ACTIVOS de la localidad del grupo, como radios en un fieldset', async () => {
    renderPagina()
    const dialogo = within(await abrirVincular())
    const grupoRadios = await dialogo.findByRole('group', { name: /establecimientos/i })
    expect(obtenerEstablecimientos).toHaveBeenCalledWith(2)
    expect(within(grupoRadios).getAllByRole('radio')).toHaveLength(2)
    expect(within(grupoRadios).getByRole('radio', { name: /Escuela Normal/ })).toBeInTheDocument()
    expect(within(grupoRadios).getByRole('radio', { name: /Jardín Ñandú/ })).toBeInTheDocument()
    expect(dialogo.queryByRole('radio', { name: /Instituto Cerrado/ })).not.toBeInTheDocument()
  })

  it('"Vincular" está deshabilitado hasta elegir un establecimiento', async () => {
    renderPagina()
    const dialogo = within(await abrirVincular())
    await dialogo.findByRole('radio', { name: /Escuela Normal/ })
    expect(dialogo.getByRole('button', { name: 'Vincular' })).toBeDisabled()
    await userEvent.click(dialogo.getByRole('radio', { name: /Escuela Normal/ }))
    expect(dialogo.getByRole('button', { name: 'Vincular' })).toBeEnabled()
  })

  it('el foco no salta mientras se escribe en el buscador y este filtra los radios', async () => {
    renderPagina()
    const dialogo = within(await abrirVincular())
    await dialogo.findByRole('radio', { name: /Escuela Normal/ })
    const buscador = dialogo.getByRole('textbox', { name: 'Buscar establecimiento' })
    await userEvent.type(buscador, 'jard')

    expect(buscador).toHaveFocus()
    expect(buscador).toHaveValue('jard')
    expect(dialogo.getByRole('radio', { name: /Jardín Ñandú/ })).toBeInTheDocument()
    expect(dialogo.queryByRole('radio', { name: /Escuela Normal/ })).not.toBeInTheDocument()
  })

  it('al vincular llama a la RPC con el grupo y el establecimiento, cierra el diálogo y anuncia el resultado', async () => {
    renderPagina()
    const dialogo = within(await abrirVincular())
    await userEvent.click(await dialogo.findByRole('radio', { name: /Jardín Ñandú/ }))
    await userEvent.click(dialogo.getByRole('button', { name: 'Vincular' }))

    await waitFor(() => expect(vincularInstitucion).toHaveBeenCalledWith(2, 'Escuela 123', 41))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByRole('status')).toHaveTextContent(/vincul/i)
    await waitFor(() => expect(obtenerSinVincular).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(titulo()).toHaveFocus())
  })

  it('con la RPC en curso el botón se deshabilita (evita el doble clic)', async () => {
    vi.mocked(vincularInstitucion).mockReturnValue(new Promise(() => {}))
    renderPagina()
    const dialogo = within(await abrirVincular())
    await userEvent.click(await dialogo.findByRole('radio', { name: /Escuela Normal/ }))
    await userEvent.click(dialogo.getByRole('button', { name: 'Vincular' }))
    await waitFor(() => expect(dialogo.getByRole('button', { name: /Vincular|Vinculando/ })).toBeDisabled())
    expect(vincularInstitucion).toHaveBeenCalledTimes(1)
  })

  it('si la RPC devuelve 0 avisa "Ya estaba vinculado" y refresca la lista', async () => {
    vi.mocked(vincularInstitucion).mockResolvedValue(0)
    renderPagina()
    const dialogo = within(await abrirVincular())
    await userEvent.click(await dialogo.findByRole('radio', { name: /Escuela Normal/ }))
    await userEvent.click(dialogo.getByRole('button', { name: 'Vincular' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Ya estaba vinculado'))
    await waitFor(() => expect(obtenerSinVincular).toHaveBeenCalledTimes(2))
  })

  it('con DA005 muestra un mensaje claro en el diálogo, lo deja abierto y vuelve a pedir los establecimientos', async () => {
    vi.mocked(vincularInstitucion).mockRejectedValue({ code: 'DA005', message: 'no vinculable' })
    renderPagina()
    const dialogo = within(await abrirVincular())
    await userEvent.click(await dialogo.findByRole('radio', { name: /Escuela Normal/ }))
    await userEvent.click(dialogo.getByRole('button', { name: 'Vincular' }))

    expect(await dialogo.findByRole('alert')).toHaveTextContent(/ya no está disponible/i)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await waitFor(() => expect(obtenerEstablecimientos).toHaveBeenCalledTimes(2))
  })

  it('si falla la carga de los establecimientos muestra un alert con "Reintentar" en el diálogo', async () => {
    vi.mocked(obtenerEstablecimientos).mockRejectedValueOnce(new Error('sin red'))
    renderPagina()
    const dialogo = within(await abrirVincular())
    expect(await dialogo.findByRole('alert')).toBeInTheDocument()
    expect(dialogo.queryByRole('radio')).not.toBeInTheDocument()
    await userEvent.click(dialogo.getByRole('button', { name: 'Reintentar' }))
    expect(await dialogo.findByRole('radio', { name: /Escuela Normal/ })).toBeInTheDocument()
  })

  it('la elección que la búsqueda oculta no se puede vincular', async () => {
    renderPagina()
    const dialogo = within(await abrirVincular())
    await userEvent.click(await dialogo.findByRole('radio', { name: /Escuela Normal/ }))
    expect(dialogo.getByRole('button', { name: 'Vincular' })).toBeEnabled()

    await userEvent.type(dialogo.getByRole('textbox', { name: 'Buscar establecimiento' }), 'jard')

    expect(dialogo.queryByRole('radio', { name: /Escuela Normal/ })).not.toBeInTheDocument()
    expect(dialogo.getByRole('button', { name: 'Vincular' })).toBeDisabled()
  })

  it('mientras guarda no se puede cerrar: "Cancelar" deshabilitado y Escape sin efecto', async () => {
    vi.mocked(vincularInstitucion).mockReturnValue(new Promise(() => {}))
    renderPagina()
    const dialogo = within(await abrirVincular())
    await userEvent.click(await dialogo.findByRole('radio', { name: /Escuela Normal/ }))
    await userEvent.click(dialogo.getByRole('button', { name: 'Vincular' }))
    await waitFor(() => expect(dialogo.getByRole('button', { name: 'Cancelar' })).toBeDisabled())

    await userEvent.keyboard('{Escape}')

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('"Cancelar" cierra el diálogo sin vincular', async () => {
    renderPagina()
    const dialogo = within(await abrirVincular())
    await dialogo.findByRole('radio', { name: /Escuela Normal/ })
    await userEvent.click(dialogo.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(vincularInstitucion).not.toHaveBeenCalled()
  })
})

describe('SinVincularPage: crear establecimiento (criterio 3)', () => {
  it('abre el formulario con el nombre del grupo, CUE opcional y la localidad fija', async () => {
    renderPagina()
    const dialogo = within(await abrirCrear())
    expect(dialogo.getByRole('textbox', { name: 'Nombre del establecimiento' })).toHaveValue('Escuela 123')
    expect(dialogo.getByRole('textbox', { name: 'CUE (opcional)' })).toHaveValue('')
    expect(dialogo.getByText('Posadas')).toBeInTheDocument()
    expect(dialogo.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('al guardar crea con el nombre editado y vincula con el nombre ORIGINAL del grupo y el id creado', async () => {
    renderPagina()
    const dialogo = within(await abrirCrear())
    const nombre = dialogo.getByRole('textbox', { name: 'Nombre del establecimiento' })
    await userEvent.clear(nombre)
    await userEvent.type(nombre, 'Escuela N.º 123')
    await userEvent.type(dialogo.getByRole('textbox', { name: 'CUE (opcional)' }), '5400123')
    await userEvent.click(dialogo.getByRole('button', { name: 'Crear y vincular' }))

    await waitFor(() =>
      expect(crearEstablecimiento).toHaveBeenCalledWith({ nombre: 'Escuela N.º 123', cue: '5400123', localidad_id: 2 }),
    )
    await waitFor(() => expect(vincularInstitucion).toHaveBeenCalledWith(2, 'Escuela 123', 50))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByRole('status')).toHaveTextContent(/vincul/i)
    await waitFor(() => expect(titulo()).toHaveFocus())
  })

  it('mientras guarda no se puede cerrar: "Cancelar" deshabilitado y Escape sin efecto', async () => {
    vi.mocked(crearEstablecimiento).mockReturnValue(new Promise(() => {}))
    renderPagina()
    const dialogo = within(await abrirCrear())
    await userEvent.click(dialogo.getByRole('button', { name: 'Crear y vincular' }))
    await waitFor(() => expect(dialogo.getByRole('button', { name: 'Cancelar' })).toBeDisabled())

    await userEvent.keyboard('{Escape}')

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('un CUE vacío se envía como null', async () => {
    renderPagina()
    const dialogo = within(await abrirCrear())
    await userEvent.click(dialogo.getByRole('button', { name: 'Crear y vincular' }))
    await waitFor(() =>
      expect(crearEstablecimiento).toHaveBeenCalledWith({ nombre: 'Escuela 123', cue: null, localidad_id: 2 }),
    )
  })

  it('valida con el esquema: un CUE con letras no llama a la base', async () => {
    renderPagina()
    const dialogo = within(await abrirCrear())
    await userEvent.type(dialogo.getByRole('textbox', { name: 'CUE (opcional)' }), '54A')
    await userEvent.click(dialogo.getByRole('button', { name: 'Crear y vincular' }))
    expect(await dialogo.findByText('El CUE solo puede tener dígitos')).toBeInTheDocument()
    expect(crearEstablecimiento).not.toHaveBeenCalled()
  })

  it('con un nombre duplicado muestra el error de siempre y guía a "Vincular" o a reactivar', async () => {
    vi.mocked(crearEstablecimiento).mockRejectedValue({
      code: '23505',
      message: 'duplicate key value violates unique constraint "establecimiento_localidad_nombre_uniq"',
    })
    renderPagina()
    const dialogo = within(await abrirCrear())
    await userEvent.click(dialogo.getByRole('button', { name: 'Crear y vincular' }))

    const alerta = await dialogo.findByRole('alert')
    expect(alerta).toHaveTextContent(/Ya existe un establecimiento con ese nombre/)
    expect(alerta).toHaveTextContent(/Vincular/)
    expect(alerta).toHaveTextContent(/reactivar/i)
    expect(vincularInstitucion).not.toHaveBeenCalled()
  })

  it('si crea pero falla la vinculación, "Reintentar" solo vincula con el id ya creado', async () => {
    vi.mocked(vincularInstitucion).mockRejectedValueOnce(new Error('sin red')).mockResolvedValueOnce(2)
    renderPagina()
    const dialogo = within(await abrirCrear())
    await userEvent.click(dialogo.getByRole('button', { name: 'Crear y vincular' }))

    expect(await dialogo.findByRole('alert')).toBeInTheDocument()
    expect(crearEstablecimiento).toHaveBeenCalledTimes(1)

    await userEvent.click(dialogo.getByRole('button', { name: 'Reintentar' }))

    await waitFor(() => expect(vincularInstitucion).toHaveBeenCalledTimes(2))
    expect(vincularInstitucion).toHaveBeenLastCalledWith(2, 'Escuela 123', 50)
    expect(crearEstablecimiento).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByRole('status')).toHaveTextContent(/vincul/i)
  })
})

describe('SinVincularPage: resultado anunciado', () => {
  it('el role="status" existe antes de vincular y es el mismo nodo después', async () => {
    renderPagina()
    await fila(/Escuela 123/)
    const antes = screen.getByRole('status')
    expect(antes).toHaveTextContent('')

    const dialogo = within(await abrirVincular())
    await userEvent.click(await dialogo.findByRole('radio', { name: /Escuela Normal/ }))
    await userEvent.click(dialogo.getByRole('button', { name: 'Vincular' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/vincul/i))
    expect(screen.getByRole('status')).toBe(antes)
  })
})

describe('SinVincularPage: otros', () => {
  it('no escribe nada en el padrón por su cuenta', async () => {
    renderPagina()
    await fila(/Escuela 123/)
    expect(actualizarEstablecimiento).not.toHaveBeenCalled()
    expect(crearEstablecimiento).not.toHaveBeenCalled()
    expect(vincularInstitucion).not.toHaveBeenCalled()
  })
})
