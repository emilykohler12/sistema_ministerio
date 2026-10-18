import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation, useNavigationType } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { obtenerHistorial, obtenerUsuariosHistorial } from '@/features/historial/consultas'
import type { Operacion } from '@/features/historial/types'
import { renderConProviders } from '@/test/utils'
import { HistorialPage } from './HistorialPage'

/*
 * Contrato de HistorialPage (spec criterios 1-5, crítica 10). Mockea solo consultas (hooks, filtros, diff y entidades reales).
 * Estructura que el test asume (todo por rol/nombre accesible):
 *  - h1 "Historial".
 *  - Filtros: <input type="date"> con label "Desde" y "Hasta"; <select> con label "Usuario" (opciones "Todos" = '', "Sistema" = 'sistema'
 *    y un email por usuario con value = uuid) y label "Entidad" (opción "Todas" = '' y una por ENTIDADES_FILTRABLES con value = valor).
 *    Cambiar un filtro actualiza la URL (?desde&hasta&usuario&entidad), quita ?pagina y colapsa la fila expandida.
 *  - Lista: <table> de nombre "Operaciones"; la primera fila es el encabezado. Columnas: fecha y hora (Argentina), usuario
 *    (email, "Sistema" o uuid corto = los primeros 8 caracteres si el email no está o falló la consulta de usuarios),
 *    acción (Alta / Modificación / Baja), entidad y descripción.
 *  - Cada fila con cambios tiene un botón con aria-expanded; al expandir aparece una <table> de nombre "Cambios del registro"
 *    con columnas Campo / Antes / Después. Una modificación sin cambios dice "Sin cambios en los campos del registro" y no tiene botón.
 *  - El total se muestra como "<n> operaciones". <Paginacion> (nav "Paginación") con "Siguiente"/"Anterior".
 *  - Filtros inválidos: role="alert" junto a los campos, sin "Reintentar", sin skeletons y sin llamar a obtenerHistorial.
 *  - Carga: skeletons role="status" nombre "Cargando". Error de la lista: ErrorFallback (role="alert") con "Reintentar".
 *  - Vacío (incluida la página fuera de rango, que la consulta devuelve como { filas: [], total: null }): EmptyState con título
 *    "Sin operaciones" y un botón "Limpiar filtros" que borra todo de la URL.
 *  - Datos en actualización (isPlaceholderData): el contenedor de la tabla lleva aria-busy="true" y la paginación está deshabilitada.
 */
vi.mock('@/features/historial/consultas', () => ({
  obtenerHistorial: vi.fn(),
  obtenerUsuariosHistorial: vi.fn(),
}))

const U1 = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b'
const U2 = '7a1b2c3d-0000-4000-8000-000000000001'

function Ubicacion() {
  const { search } = useLocation()
  return <output data-testid="ubicacion">{search}</output>
}

function TipoNavegacion() {
  return <output data-testid="navegacion">{useNavigationType()}</output>
}

const modificacion: Operacion = {
  id: 3,
  usuario_id: U1,
  operacion: 'UPDATE',
  tabla: 'taller',
  registro_id: '7',
  datos_anteriores: { id: 7, nombre: 'Robótica', estado: 'BORRADOR', updated_at: '2026-10-01T00:00:00Z' },
  datos_nuevos: { id: 7, nombre: 'Robótica 2', estado: 'BORRADOR', updated_at: '2026-10-02T00:00:00Z' },
  fecha_hora: '2026-10-16T01:30:00Z',
}
const alta: Operacion = {
  id: 2,
  usuario_id: null,
  operacion: 'INSERT',
  tabla: 'categoria',
  registro_id: '4',
  datos_anteriores: null,
  datos_nuevos: { id: 4, nombre: 'Matemática' },
  fecha_hora: '2026-10-15T12:00:00Z',
}
const sinCambios: Operacion = {
  id: 1,
  usuario_id: U2,
  operacion: 'UPDATE',
  tabla: 'normativa',
  registro_id: '9',
  datos_anteriores: { id: 9, titulo: 'Resolución 10', updated_at: '2026-10-01T00:00:00Z' },
  datos_nuevos: { id: 9, titulo: 'Resolución 10', updated_at: '2026-10-02T00:00:00Z' },
  fecha_hora: '2026-10-14T12:00:00Z',
}
const baja: Operacion = {
  id: 0,
  usuario_id: U1,
  operacion: 'DELETE',
  tabla: 'recurso',
  registro_id: '3',
  datos_anteriores: { id: 3, nombre: 'Guía.pdf' },
  datos_nuevos: null,
  fecha_hora: '2026-10-13T12:00:00Z',
}

const pagina1 = { filas: [modificacion, alta, sinCambios, baja], total: 4 }
const usuarios = [
  { id: U1, email: 'admin@dam.local' },
  // U2 no figura: su fila muestra el uuid corto.
]

async function renderPagina(ruta = '/admin/historial', datos = pagina1) {
  vi.mocked(obtenerHistorial).mockResolvedValue(datos)
  vi.mocked(obtenerUsuariosHistorial).mockResolvedValue(usuarios)
  renderConProviders(
    <>
      <HistorialPage />
      <Ubicacion />
    </>,
    { ruta },
  )
  // Con datos vacíos no hay tabla (lo afirma el test del vacío): se espera el estado vacío.
  if (datos.filas.length === 0) await screen.findByText(/sin operaciones/i)
  else await screen.findByRole('table', { name: 'Operaciones' })
}

const filas = () =>
  within(screen.getByRole('table', { name: 'Operaciones' }))
    .getAllByRole('row')
    .slice(1)
const ultimaConsulta = () => vi.mocked(obtenerHistorial).mock.lastCall?.[0]

beforeEach(() => {
  vi.resetAllMocks()
})

describe('HistorialPage: lista', () => {
  it('muestra el título y una fila por operación en el orden recibido', async () => {
    await renderPagina()
    expect(screen.getByRole('heading', { level: 1, name: 'Historial' })).toBeInTheDocument()
    expect(filas()).toHaveLength(4)
    expect(filas()[0]).toHaveTextContent('Robótica 2')
    expect(filas()[1]).toHaveTextContent('Matemática')
  })

  it('consulta por defecto sin filtros y en la página 1', async () => {
    await renderPagina()
    expect(obtenerHistorial).toHaveBeenCalledWith({ desde: null, hasta: null, usuario: null, entidad: null, pagina: 1 })
  })

  it('la fecha y hora se muestran en hora de Argentina', async () => {
    await renderPagina()
    expect(filas()[0]).toHaveTextContent(/15\/10\/(20)?26/)
    expect(filas()[0]).toHaveTextContent('22:30')
  })

  it('el usuario es el email; "Sistema" si es NULL; el uuid corto si no está en la lista', async () => {
    await renderPagina()
    expect(filas()[0]).toHaveTextContent('admin@dam.local')
    expect(within(filas()[1]).getByText('Sistema')).toBeInTheDocument()
    expect(filas()[2]).toHaveTextContent(U2.slice(0, 8))
    expect(filas()[2]).not.toHaveTextContent(U2)
  })

  it('la acción es Alta, Modificación o Baja', async () => {
    await renderPagina()
    expect(within(filas()[0]).getByText('Modificación')).toBeInTheDocument()
    expect(within(filas()[1]).getByText('Alta')).toBeInTheDocument()
    expect(within(filas()[3]).getByText('Baja')).toBeInTheDocument()
  })

  it('la entidad y la descripción salen del registro (en la baja, de datos_anteriores)', async () => {
    await renderPagina()
    expect(filas()[0]).toHaveTextContent('Taller')
    expect(filas()[1]).toHaveTextContent('Categoría')
    expect(filas()[2]).toHaveTextContent('Resolución 10')
    expect(filas()[3]).toHaveTextContent('Recurso')
    expect(filas()[3]).toHaveTextContent('Guía.pdf')
  })

  it('muestra el total de operaciones', async () => {
    await renderPagina('/admin/historial', { filas: [modificacion], total: 120 })
    expect(screen.getByText(/120 operaciones/)).toBeInTheDocument()
    expect(screen.getByText('Página 1 de 3')).toBeInTheDocument()
  })
})

describe('HistorialPage: detalle', () => {
  it('una modificación se expande a campo / antes / después solo con lo que cambió, sin updated_at', async () => {
    await renderPagina()
    const boton = within(filas()[0]).getByRole('button', { expanded: false })
    await userEvent.click(boton)
    expect(boton).toHaveAttribute('aria-expanded', 'true')
    const detalle = screen.getByRole('table', { name: 'Cambios del registro' })
    const celdas = within(detalle).getAllByRole('row').slice(1)
    expect(celdas).toHaveLength(1)
    expect(celdas[0]).toHaveTextContent('nombre')
    expect(celdas[0]).toHaveTextContent('Robótica')
    expect(celdas[0]).toHaveTextContent('Robótica 2')
    expect(detalle).not.toHaveTextContent('updated_at')
  })

  it('el botón tiene un nombre fijo con la descripción del registro; el estado lo da solo aria-expanded', async () => {
    await renderPagina()
    const boton = within(filas()[0]).getByRole('button', { name: 'Cambios de Robótica 2' })
    expect(boton).toHaveAttribute('aria-expanded', 'false')
    const otro = within(filas()[1]).getByRole('button', { name: 'Cambios de Matemática' })
    await userEvent.click(boton)
    expect(otro).toBeInTheDocument()
    expect(within(filas()[0]).getByRole('button', { name: 'Cambios de Robótica 2' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('un segundo clic colapsa el detalle', async () => {
    await renderPagina()
    const boton = within(filas()[0]).getByRole('button', { expanded: false })
    await userEvent.click(boton)
    await userEvent.click(boton)
    expect(boton).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('table', { name: 'Cambios del registro' })).not.toBeInTheDocument()
  })

  it('un alta muestra todos los campos', async () => {
    await renderPagina()
    await userEvent.click(within(filas()[1]).getByRole('button', { expanded: false }))
    const detalle = screen.getByRole('table', { name: 'Cambios del registro' })
    expect(within(detalle).getAllByRole('row').slice(1)).toHaveLength(2)
    expect(detalle).toHaveTextContent('id')
    expect(detalle).toHaveTextContent('Matemática')
  })

  it('una baja muestra todos los campos', async () => {
    await renderPagina()
    await userEvent.click(within(filas()[3]).getByRole('button', { expanded: false }))
    const detalle = screen.getByRole('table', { name: 'Cambios del registro' })
    expect(within(detalle).getAllByRole('row').slice(1)).toHaveLength(2)
    expect(detalle).toHaveTextContent('Guía.pdf')
  })

  it('una modificación que solo cambió updated_at dice "Sin cambios en los campos del registro" y no se expande', async () => {
    await renderPagina()
    const f = filas()[2]
    expect(within(f).getByText('Sin cambios en los campos del registro')).toBeInTheDocument()
    expect(within(f).queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('HistorialPage: filtros', () => {
  it('los filtros de la URL se aplican y se reflejan en los campos', async () => {
    await renderPagina(`/admin/historial?desde=2026-03-10&hasta=2026-03-12&usuario=${U1}&entidad=taller&pagina=2`, {
      filas: [modificacion],
      total: 120,
    })
    expect(ultimaConsulta()).toEqual({
      desde: '2026-03-10',
      hasta: '2026-03-12',
      usuario: U1,
      entidad: 'taller',
      pagina: 2,
    })
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-03-10')
    expect(screen.getByLabelText('Hasta')).toHaveValue('2026-03-12')
    expect(screen.getByLabelText('Entidad')).toHaveValue('taller')
    expect(screen.getByLabelText('Usuario')).toHaveValue(U1)
  })

  it('el selector de usuario ofrece Todos, Sistema y un email por usuario con operaciones', async () => {
    await renderPagina()
    const select = screen.getByLabelText('Usuario')
    expect(await within(select).findByRole('option', { name: 'admin@dam.local' })).toHaveValue(U1)
    expect(within(select).getByRole('option', { name: 'Todos' })).toHaveValue('')
    expect(within(select).getByRole('option', { name: 'Sistema' })).toHaveValue('sistema')
  })

  it('el selector de entidad no ofrece Nivel, Localidad ni Destinatario', async () => {
    await renderPagina()
    const select = screen.getByLabelText('Entidad')
    expect(within(select).getByRole('option', { name: 'Todas' })).toHaveValue('')
    expect(within(select).getByRole('option', { name: 'Taller' })).toHaveValue('taller')
    for (const n of ['Nivel', 'Localidad', 'Destinatario']) {
      expect(within(select).queryByRole('option', { name: n })).not.toBeInTheDocument()
    }
  })

  it('elegir una entidad actualiza la URL y vuelve a consultar', async () => {
    await renderPagina()
    await userEvent.selectOptions(screen.getByLabelText('Entidad'), 'taller')
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('entidad=taller')
    await waitFor(() => expect(ultimaConsulta()).toMatchObject({ entidad: 'taller', pagina: 1 }))
  })

  it('elegir "Sistema" filtra por usuario=sistema', async () => {
    await renderPagina()
    await userEvent.selectOptions(screen.getByLabelText('Usuario'), 'sistema')
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('usuario=sistema')
    await waitFor(() => expect(ultimaConsulta()).toMatchObject({ usuario: 'sistema' }))
  })

  it('un rango de fechas válido queda en la URL y se consulta', async () => {
    await renderPagina()
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-03-10' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-03-12' } })
    await waitFor(() => expect(ultimaConsulta()).toMatchObject({ desde: '2026-03-10', hasta: '2026-03-12' }))
    const url = screen.getByTestId('ubicacion').textContent ?? ''
    expect(url).toContain('desde=2026-03-10')
    expect(url).toContain('hasta=2026-03-12')
  })

  it('las fechas esperan a que termine de editar: una sola consulta con el rango y sin entrada nueva en el historial', async () => {
    vi.mocked(obtenerHistorial).mockResolvedValue(pagina1)
    vi.mocked(obtenerUsuariosHistorial).mockResolvedValue(usuarios)
    renderConProviders(
      <>
        <HistorialPage />
        <Ubicacion />
        <TipoNavegacion />
      </>,
      { ruta: '/admin/historial' },
    )
    await screen.findByRole('table', { name: 'Operaciones' })
    vi.mocked(obtenerHistorial).mockClear()

    // Fechas intermedias del año mientras se escribe.
    for (const v of ['0002-03-10', '0020-03-10', '0202-03-10', '2026-03-10']) {
      fireEvent.change(screen.getByLabelText('Desde'), { target: { value: v } })
    }
    expect(obtenerHistorial).not.toHaveBeenCalled()
    expect(screen.getByTestId('ubicacion').textContent).toBe('')

    await waitFor(() => expect(ultimaConsulta()).toMatchObject({ desde: '2026-03-10' }))
    expect(obtenerHistorial).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('desde=2026-03-10')
    expect(screen.getByTestId('navegacion')).toHaveTextContent('REPLACE')
  })

  it('vaciar una fecha la saca de los filtros', async () => {
    await renderPagina('/admin/historial?desde=2026-03-10&pagina=2', { filas: [modificacion], total: 120 })
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '' } })
    await waitFor(() =>
      expect(ultimaConsulta()).toEqual({ desde: null, hasta: null, usuario: null, entidad: null, pagina: 1 }),
    )
    expect(screen.getByTestId('ubicacion').textContent).toBe('')
  })

  it('cambiar un filtro vuelve a la página 1 y la saca de la URL', async () => {
    await renderPagina('/admin/historial?pagina=2', { filas: [modificacion], total: 120 })
    await userEvent.selectOptions(screen.getByLabelText('Entidad'), 'taller')
    await waitFor(() => expect(ultimaConsulta()).toMatchObject({ entidad: 'taller', pagina: 1 }))
    expect(screen.getByTestId('ubicacion').textContent).not.toContain('pagina')
  })

  it('cambiar un filtro colapsa la fila expandida', async () => {
    await renderPagina()
    await userEvent.click(within(filas()[0]).getByRole('button', { expanded: false }))
    expect(screen.getByRole('table', { name: 'Cambios del registro' })).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Entidad'), 'taller')
    await waitFor(() => expect(ultimaConsulta()).toMatchObject({ entidad: 'taller' }))
    await waitFor(() => expect(screen.queryByRole('table', { name: 'Cambios del registro' })).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { expanded: true })).not.toBeInTheDocument()
  })

  it.each([
    ['usuario que no es uuid ni sistema', '?usuario=x', { usuario: null }],
    ['entidad desconocida', '?entidad=inventada', { entidad: null }],
    ['página 0', '?pagina=0', { pagina: 1 }],
    ['página negativa', '?pagina=-3', { pagina: 1 }],
    ['página no numérica', '?pagina=abc', { pagina: 1 }],
  ])('un valor inválido en la URL (%s) se descarta y no deja la pantalla trabada', async (_n, q, esperado) => {
    await renderPagina(`/admin/historial${q}`)
    expect(ultimaConsulta()).toMatchObject(esperado)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(filas()).toHaveLength(4)
  })
})

describe('HistorialPage: paginación', () => {
  const muchas = { filas: [modificacion], total: 120 }

  it('"Siguiente" cambia a la página 2 en la URL y consulta con ese número', async () => {
    await renderPagina('/admin/historial', muchas)
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('pagina=2')
    await waitFor(() => expect(ultimaConsulta()).toMatchObject({ pagina: 2 }))
  })

  it('cambiar de página colapsa la fila expandida', async () => {
    await renderPagina('/admin/historial', muchas)
    await userEvent.click(within(filas()[0]).getByRole('button', { expanded: false }))
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(ultimaConsulta()).toMatchObject({ pagina: 2 }))
    await waitFor(() => expect(screen.queryByRole('button', { expanded: true })).not.toBeInTheDocument())
  })

  it('mientras llegan los datos de la página nueva, conserva los anteriores como ocupados y NO deshabilita la paginación (el foco no se pierde)', async () => {
    await renderPagina('/admin/historial', muchas)
    vi.mocked(obtenerHistorial).mockReturnValue(new Promise(() => {}))
    const siguiente = screen.getByRole('button', { name: 'Siguiente' })
    siguiente.focus()
    await userEvent.click(siguiente)
    expect(filas()).toHaveLength(1)
    expect(screen.queryByRole('status', { name: 'Cargando' })).not.toBeInTheDocument()
    const contenedor = () => screen.getByRole('table', { name: 'Operaciones' }).closest('[aria-busy]')
    await waitFor(() => expect(contenedor()).toHaveAttribute('aria-busy', 'true'))
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeEnabled()
    expect(siguiente).toHaveFocus()
  })

  it('al llegar la página nueva el foco pasa al total de operaciones', async () => {
    await renderPagina('/admin/historial', muchas)
    let resolver: (v: typeof muchas) => void = () => {}
    vi.mocked(obtenerHistorial).mockReturnValue(new Promise((r) => (resolver = r)))
    const siguiente = screen.getByRole('button', { name: 'Siguiente' })
    siguiente.focus()
    await userEvent.click(siguiente)
    expect(screen.getByText(/120 operaciones/)).not.toHaveFocus()
    resolver({ filas: [alta], total: 120 })
    await waitFor(() => expect(screen.getByText(/120 operaciones/)).toHaveFocus())
  })

  it('cambiar un filtro no le roba el foco al campo', async () => {
    await renderPagina('/admin/historial', muchas)
    const entidad = screen.getByLabelText('Entidad')
    entidad.focus()
    await userEvent.selectOptions(entidad, 'taller')
    await waitFor(() => expect(ultimaConsulta()).toMatchObject({ entidad: 'taller' }))
    expect(entidad).toHaveFocus()
  })

  it('con los datos al día el contenedor no está ocupado', async () => {
    await renderPagina('/admin/historial', muchas)
    expect(screen.getByRole('table', { name: 'Operaciones' }).closest('[aria-busy]')).toHaveAttribute(
      'aria-busy',
      'false',
    )
  })
})

describe('HistorialPage: filtros inválidos (criterio 4)', () => {
  it.each([
    ['desde posterior a hasta', '?desde=2026-03-12&hasta=2026-03-10'],
    ['fecha mal formada', '?desde=hola'],
    ['fecha irreal', '?hasta=2026-02-30'],
  ])('%s: muestra el error junto a los campos, no consulta y no hay skeletons ni tabla', async (_n, q) => {
    vi.mocked(obtenerHistorial).mockResolvedValue(pagina1)
    vi.mocked(obtenerUsuariosHistorial).mockResolvedValue(usuarios)
    renderConProviders(<HistorialPage />, { ruta: `/admin/historial${q}` })
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Cargando' })).not.toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Operaciones' })).not.toBeInTheDocument()
    expect(obtenerHistorial).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Desde')).toBeInTheDocument()
  })

  it('al corregir el rango el error desaparece y se consulta', async () => {
    vi.mocked(obtenerHistorial).mockResolvedValue(pagina1)
    vi.mocked(obtenerUsuariosHistorial).mockResolvedValue(usuarios)
    renderConProviders(<HistorialPage />, { ruta: '/admin/historial?desde=2026-03-12&hasta=2026-03-10' })
    await screen.findByRole('alert')
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-03-14' } })
    await screen.findByRole('table', { name: 'Operaciones' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(ultimaConsulta()).toMatchObject({ desde: '2026-03-12', hasta: '2026-03-14' })
  })
})

describe('HistorialPage: estados (criterio 5)', () => {
  it('mientras carga muestra skeletons y ningún dato', async () => {
    vi.mocked(obtenerHistorial).mockReturnValue(new Promise(() => {}))
    vi.mocked(obtenerUsuariosHistorial).mockResolvedValue(usuarios)
    renderConProviders(<HistorialPage />, { ruta: '/admin/historial' })
    expect(await screen.findByRole('status', { name: 'Cargando' })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Operaciones' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('sin resultados muestra el estado vacío con "Limpiar filtros", que borra los filtros de la URL', async () => {
    await renderPagina('/admin/historial?entidad=taller&usuario=sistema', { filas: [], total: 0 })
    expect(screen.getByText(/sin operaciones/i)).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Operaciones' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(screen.getByTestId('ubicacion').textContent).toBe('')
    await waitFor(() =>
      expect(ultimaConsulta()).toEqual({ desde: null, hasta: null, usuario: null, entidad: null, pagina: 1 }),
    )
  })

  it('una página fuera de rango (la consulta devuelve vacío con total null) muestra el estado vacío, no un error', async () => {
    vi.mocked(obtenerHistorial).mockResolvedValue({ filas: [], total: null })
    vi.mocked(obtenerUsuariosHistorial).mockResolvedValue(usuarios)
    renderConProviders(
      <>
        <HistorialPage />
        <Ubicacion />
      </>,
      { ruta: '/admin/historial?pagina=9' },
    )
    expect(await screen.findByText(/sin operaciones/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(screen.getByTestId('ubicacion').textContent).toBe('')
  })

  it('una página fuera de rango explica que esa página no existe; sin página, que no hay operaciones', async () => {
    vi.mocked(obtenerHistorial).mockResolvedValue({ filas: [], total: null })
    vi.mocked(obtenerUsuariosHistorial).mockResolvedValue(usuarios)
    renderConProviders(<HistorialPage />, { ruta: '/admin/historial?pagina=9' })
    expect(await screen.findByText('Esa página no existe.')).toBeInTheDocument()
  })

  it('sin resultados en la primera página dice que no hay operaciones para los filtros', async () => {
    await renderPagina('/admin/historial?entidad=taller', { filas: [], total: 0 })
    expect(screen.getByText('No hay operaciones para los filtros elegidos.')).toBeInTheDocument()
  })

  it('si la consulta falla muestra un error con "Reintentar", que vuelve a consultar; no se confunde con el vacío', async () => {
    vi.mocked(obtenerHistorial).mockRejectedValueOnce(new Error('sin red'))
    vi.mocked(obtenerUsuariosHistorial).mockResolvedValue(usuarios)
    renderConProviders(<HistorialPage />, { ruta: '/admin/historial' })
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Operaciones' })).not.toBeInTheDocument()
    expect(screen.queryByText(/sin operaciones/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Cargando' })).not.toBeInTheDocument()

    vi.mocked(obtenerHistorial).mockResolvedValue(pagina1)
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('table', { name: 'Operaciones' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(obtenerHistorial).toHaveBeenCalledTimes(2)
  })

  it('si falla solo la consulta de usuarios, la lista se muestra con el uuid corto', async () => {
    vi.mocked(obtenerHistorial).mockResolvedValue(pagina1)
    vi.mocked(obtenerUsuariosHistorial).mockRejectedValue(new Error('sin red'))
    renderConProviders(<HistorialPage />, { ruta: '/admin/historial' })
    await screen.findByRole('table', { name: 'Operaciones' })
    expect(await screen.findByText(/no pudimos cargar los emails/i)).toBeInTheDocument()
    expect(filas()).toHaveLength(4)
    expect(filas()[0]).toHaveTextContent(U1.slice(0, 8))
    expect(filas()[0]).not.toHaveTextContent('admin@dam.local')
    expect(within(filas()[1]).getByText('Sistema')).toBeInTheDocument()
  })
})
