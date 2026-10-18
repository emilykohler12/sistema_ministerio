import { screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation, useNavigationType } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { obtenerMetricas } from '@/features/dashboard/consultas'
import type { Metricas } from '@/features/dashboard/types'
import { renderConProviders } from '@/test/utils'
import { DashboardPage } from './DashboardPage'

/*
 * Contrato de DashboardPage (spec criterios 1-8; crítica 11). Mockea solo consultas (hook y calculos reales).
 * Estructura que el test asume (todo por rol/nombre accesible):
 *  - h1 "Dashboard".
 *  - Selector de período: ToggleGroup con botones "Últimos 30 días", "Año en curso" y "Rango" (aria-pressed).
 *    "Rango" muestra dos <input type="date"> con label "Desde" y "Hasta". Cambiar de opción actualiza `?periodo=`
 *    (y `desde`/`hasta` en rango).
 *  - Período inválido (desde > hasta, fuera de tope): un elemento role="alert" con el mensaje junto a los campos,
 *    sin botón "Reintentar", sin skeletons (role="status" name "Cargando") y sin llamar a obtenerMetricas.
 *  - Carga: skeletons con role="status" y nombre "Cargando". Error de la query: ErrorFallback (role="alert") con "Reintentar".
 *  - KPIs dentro de un region "Resumen": "Descargas", "Establecimientos alcanzados", "Talleres publicados", "Normativas"
 *    (cantidad = normativas.length). Aviso "N institución(es) sin vincular" solo si sin_vincular > 0, como enlace a
 *    /admin/establecimientos/sin-vincular (instituciones sin vincular, issue #19, criterio 8).
 *  - Secciones (role="region" con estos nombres): "Descargas en el tiempo", "Ranking de talleres", "Descargas por nivel",
 *    "Descargas por cargo", "Descargas por localidad", "Normativas". Cada una con una <table>; la primera fila es el encabezado.
 *  - Ver todos: botón "Ver todos" (ranking) y "Ver todas" (localidades) que despliega el resto.
 *  - Sin descargas (resumen.descargas = 0): EmptyState con título "Sin descargas en el período" en serie, ranking, nivel y cargo.
 *  - Porcentajes con coma y un decimal: "33,3 %". Cobertura sin padrón: "—".
 *  - Estado del taller no publicado: Badge con ETIQUETA_ESTADO ("Borrador", "Inactivo").
 * El "hoy" de la página es 2026-10-16 (se falsea solo Date).
 */
vi.mock('@/features/dashboard/consultas', () => ({ obtenerMetricas: vi.fn() }))

function Ubicacion() {
  const { search } = useLocation()
  const tipoNavegacion = useNavigationType()
  return (
    <>
      <output data-testid="ubicacion">{search}</output>
      <output data-testid="tipo-navegacion">{tipoNavegacion}</output>
    </>
  )
}

function base(p: Partial<Metricas> = {}): Metricas {
  return {
    resumen: { descargas: 12, establecimientos_alcanzados: 4, talleres_publicados: 7, sin_vincular: 0 },
    serie: [
      { inicio: '2026-10-14', descargas: 3 },
      { inicio: '2026-10-15', descargas: 0 },
      { inicio: '2026-10-16', descargas: 9 },
    ],
    talleres: [{ taller_id: 1, titulo: 'Taller uno', estado: 'PUBLICADO', descargas: 12 }],
    niveles: [
      { nivel_id: 1, nombre: 'Inicial', descargas: 6 },
      { nivel_id: 2, nombre: 'Primario', descargas: 3 },
      { nivel_id: 3, nombre: 'Secundario', descargas: 3 },
      { nivel_id: 4, nombre: 'Terciario', descargas: 0 },
      { nivel_id: 5, nombre: 'Formación profesional', descargas: 0 },
    ],
    cargos: [
      { cargo: 'Docente', descargas: 9 },
      { cargo: 'Director/a', descargas: 3 },
    ],
    localidades: [{ localidad_id: 1, nombre: 'Posadas', descargas: 12, alcanzados: 4, padron: 8 }],
    normativas: [
      { id: 1, titulo: 'Resolución 10', numero: '10', anio: 2024, descargas: 5 },
      { id: 2, titulo: 'Disposición 3', numero: '3', anio: 2023, descargas: 9 },
      { id: 3, titulo: 'Circular 7', numero: '7', anio: 2025, descargas: 0 },
    ],
    ...p,
  }
}

async function renderPagina(datos: Metricas = base(), ruta = '/admin') {
  vi.mocked(obtenerMetricas).mockResolvedValue(datos)
  renderConProviders(
    <>
      <DashboardPage />
      <Ubicacion />
    </>,
    { ruta },
  )
  await screen.findByRole('region', { name: 'Resumen' })
}

const region = (nombre: string) => screen.getByRole('region', { name: nombre })
const filas = (nombre: string) => within(region(nombre)).getAllByRole('row').slice(1)
const kpi = (label: string) => within(region('Resumen')).getByText(label).parentElement as HTMLElement

function talleresConDescargas(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    taller_id: i + 1,
    titulo: `Taller ${String(i + 1).padStart(2, '0')}`,
    estado: 'PUBLICADO' as const,
    descargas: 100 - i,
  }))
}

function localidades(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    localidad_id: i + 1,
    nombre: `Localidad ${String(i + 1).padStart(2, '0')}`,
    descargas: 100 - i,
    alcanzados: 1,
    padron: 4,
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-16T15:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('DashboardPage: encabezado y período', () => {
  it('muestra el título "Dashboard"', async () => {
    await renderPagina()
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  })

  it('por defecto consulta los últimos 30 días y los marca como activos', async () => {
    await renderPagina()
    expect(obtenerMetricas).toHaveBeenCalledWith({ desde: '2026-09-17', hasta: '2026-10-16', porMes: false })
    expect(screen.getByRole('button', { name: 'Últimos 30 días' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Año en curso' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('al elegir "Año en curso" cambia la URL y consulta del 1 de enero a hoy', async () => {
    await renderPagina()
    await userEvent.click(screen.getByRole('button', { name: 'Año en curso' }))
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('periodo=anio')
    await waitFor(() =>
      expect(obtenerMetricas).toHaveBeenLastCalledWith({ desde: '2026-01-01', hasta: '2026-10-16', porMes: true }),
    )
  })

  it('"Rango" muestra los campos Desde y Hasta y pone periodo=rango en la URL', async () => {
    await renderPagina()
    expect(screen.queryByLabelText('Desde')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Rango' }))
    expect(screen.getByLabelText('Desde')).toHaveAttribute('type', 'date')
    expect(screen.getByLabelText('Hasta')).toHaveAttribute('type', 'date')
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('periodo=rango')
  })

  it('un rango válido escrito en los campos queda en la URL y se consulta', async () => {
    await renderPagina()
    await userEvent.click(screen.getByRole('button', { name: 'Rango' }))
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-03-10' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-03-12' } })
    await waitFor(() =>
      expect(obtenerMetricas).toHaveBeenLastCalledWith({ desde: '2026-03-10', hasta: '2026-03-12', porMes: false }),
    )
    const url = screen.getByTestId('ubicacion').textContent ?? ''
    expect(url).toContain('desde=2026-03-10')
    expect(url).toContain('hasta=2026-03-12')
  })

  it('al cargar con un rango en la URL lo respeta y los campos traen sus valores', async () => {
    await renderPagina(base(), '/admin?periodo=rango&desde=2026-03-10&hasta=2026-03-12')
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-03-10')
    expect(screen.getByLabelText('Hasta')).toHaveValue('2026-03-12')
    expect(screen.getByRole('button', { name: 'Rango' })).toHaveAttribute('aria-pressed', 'true')
    expect(obtenerMetricas).toHaveBeenCalledWith({ desde: '2026-03-10', hasta: '2026-03-12', porMes: false })
  })

  it('un periodo inválido en la URL usa los 30 días', async () => {
    await renderPagina(base(), '/admin?periodo=semana')
    expect(obtenerMetricas).toHaveBeenCalledWith({ desde: '2026-09-17', hasta: '2026-10-16', porMes: false })
    expect(screen.getByRole('button', { name: 'Últimos 30 días' })).toHaveAttribute('aria-pressed', 'true')
  })

  it.each([
    ['desde posterior a hasta', '/admin?periodo=rango&desde=2026-03-12&hasta=2026-03-10'],
    ['desde anterior a 2020-01-01', '/admin?periodo=rango&desde=2019-12-31&hasta=2026-03-10'],
    ['hasta posterior a hoy', '/admin?periodo=rango&desde=2026-03-10&hasta=2026-10-17'],
  ])('rango inválido (%s): muestra el error, no consulta y no hay skeletons ni datos', async (_n, ruta) => {
    vi.mocked(obtenerMetricas).mockResolvedValue(base())
    renderConProviders(<DashboardPage />, { ruta })
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Cargando' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Resumen' })).not.toBeInTheDocument()
    expect(obtenerMetricas).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Desde')).toBeInTheDocument()
  })

  it('al corregir un rango inválido el error desaparece y se consulta', async () => {
    vi.mocked(obtenerMetricas).mockResolvedValue(base())
    renderConProviders(<DashboardPage />, { ruta: '/admin?periodo=rango&desde=2026-03-12&hasta=2026-03-10' })
    await screen.findByRole('alert')
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-03-14' } })
    await screen.findByRole('region', { name: 'Resumen' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(obtenerMetricas).toHaveBeenCalledWith({ desde: '2026-03-12', hasta: '2026-03-14', porMes: false })
  })

  it('al pasar a un rango inválido desde datos ya cargados se oculta todo y no se consulta de nuevo', async () => {
    await renderPagina()
    const llamadas = vi.mocked(obtenerMetricas).mock.calls.length
    await userEvent.click(screen.getByRole('button', { name: 'Rango' }))
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-03-12' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-03-10' } })
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Resumen' })).not.toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Cargando' })).not.toBeInTheDocument()
    expect(vi.mocked(obtenerMetricas).mock.calls.length).toBe(llamadas)
  })

  it('al cambiar de período válido conserva los datos anteriores hasta que llegan los nuevos', async () => {
    await renderPagina()
    let resolver: (m: Metricas) => void = () => {}
    vi.mocked(obtenerMetricas).mockReturnValue(new Promise<Metricas>((r) => (resolver = r)))
    await userEvent.click(screen.getByRole('button', { name: 'Año en curso' }))
    expect(kpi('Descargas')).toHaveTextContent('12')
    expect(screen.queryByRole('status', { name: 'Cargando' })).not.toBeInTheDocument()
    // Los datos viejos se ven como "actualizando": no se leen como si fueran del período nuevo.
    const contenedor = () => kpi('Descargas').closest('[aria-busy]')
    await waitFor(() => expect(contenedor()).toHaveAttribute('aria-busy', 'true'))
    expect(contenedor()).toHaveClass('opacity-60')
    resolver(base({ resumen: { ...base().resumen, descargas: 77 } }))
    await waitFor(() => expect(kpi('Descargas')).toHaveTextContent('77'))
    expect(contenedor()).toHaveAttribute('aria-busy', 'false')
    expect(contenedor()).not.toHaveClass('opacity-60')
  })

  it('con los datos al día el contenedor no está marcado como ocupado', async () => {
    await renderPagina()
    expect(kpi('Descargas').closest('[aria-busy]')).toHaveAttribute('aria-busy', 'false')
  })

  it('escribir las fechas de un rango reemplaza la entrada del historial y elegir un preajuste agrega una', async () => {
    await renderPagina()
    await userEvent.click(screen.getByRole('button', { name: 'Rango' }))
    expect(screen.getByTestId('tipo-navegacion')).toHaveTextContent('PUSH')
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-03-10' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-03-12' } })
    await waitFor(() => expect(screen.getByTestId('tipo-navegacion')).toHaveTextContent('REPLACE'))
  })
})

describe('DashboardPage: estados', () => {
  it('mientras carga muestra skeletons y ningún dato', async () => {
    vi.mocked(obtenerMetricas).mockReturnValue(new Promise(() => {}))
    renderConProviders(<DashboardPage />)
    expect(await screen.findByRole('status', { name: 'Cargando' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Resumen' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('si la consulta falla muestra ErrorFallback y "Reintentar" vuelve a consultar', async () => {
    vi.mocked(obtenerMetricas).mockRejectedValueOnce(new Error('sin red'))
    renderConProviders(<DashboardPage />)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Resumen' })).not.toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Cargando' })).not.toBeInTheDocument()

    vi.mocked(obtenerMetricas).mockResolvedValue(base())
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('region', { name: 'Resumen' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(obtenerMetricas).toHaveBeenCalledTimes(2)
  })

  it('un error no se muestra como ceros ni como estado vacío', async () => {
    vi.mocked(obtenerMetricas).mockRejectedValue(new Error('sin red'))
    renderConProviders(<DashboardPage />)
    await screen.findByRole('alert')
    expect(screen.queryByText('Sin descargas en el período')).not.toBeInTheDocument()
  })

  it('sin descargas en el período: KPIs en 0 y estado vacío en las secciones de descargas', async () => {
    await renderPagina(
      base({
        resumen: { descargas: 0, establecimientos_alcanzados: 0, talleres_publicados: 7, sin_vincular: 0 },
        serie: [{ inicio: '2026-10-16', descargas: 0 }],
        talleres: [],
        niveles: base().niveles.map((n) => ({ ...n, descargas: 0 })),
        cargos: [],
      }),
    )
    expect(kpi('Descargas')).toHaveTextContent('0')
    expect(kpi('Establecimientos alcanzados')).toHaveTextContent('0')
    expect(kpi('Talleres publicados')).toHaveTextContent('7')
    for (const nombre of [
      'Descargas en el tiempo',
      'Ranking de talleres',
      'Descargas por nivel',
      'Descargas por cargo',
    ]) {
      expect(within(region(nombre)).getByText('Sin descargas en el período')).toBeInTheDocument()
    }
  })
})

describe('DashboardPage: resumen', () => {
  it('muestra los cuatro KPIs; Normativas es la cantidad de la lista y no la suma de descargas', async () => {
    await renderPagina()
    expect(kpi('Descargas')).toHaveTextContent('12')
    expect(kpi('Establecimientos alcanzados')).toHaveTextContent('4')
    expect(kpi('Talleres publicados')).toHaveTextContent('7')
    expect(kpi('Normativas')).toHaveTextContent('3')
  })

  it('no muestra el aviso de sin vincular cuando es 0', async () => {
    await renderPagina()
    expect(screen.queryByText(/sin vincular/i)).not.toBeInTheDocument()
  })

  it('con una institución sin vincular muestra el aviso en singular como enlace a la pantalla de vinculación', async () => {
    await renderPagina(base({ resumen: { ...base().resumen, sin_vincular: 1 } }))
    const aviso = screen.getByRole('link', { name: /1 institución sin vincular/i })
    expect(aviso).toHaveAttribute('href', '/admin/establecimientos/sin-vincular')
  })

  it('el aviso en plural también es un enlace a la pantalla de vinculación', async () => {
    await renderPagina(base({ resumen: { ...base().resumen, sin_vincular: 3 } }))
    expect(screen.getByRole('link', { name: /3 instituciones sin vincular/i })).toHaveAttribute(
      'href',
      '/admin/establecimientos/sin-vincular',
    )
  })

  it('con varias muestra el aviso en plural', async () => {
    await renderPagina(base({ resumen: { ...base().resumen, sin_vincular: 3 } }))
    expect(screen.getByText(/3 instituciones sin vincular/i)).toBeInTheDocument()
  })

  it('el aviso de sin vincular no cambia con el período (no depende de él) y no se oculta con 0 descargas', async () => {
    await renderPagina(
      base({
        resumen: { descargas: 0, establecimientos_alcanzados: 0, talleres_publicados: 7, sin_vincular: 2 },
        serie: [],
        talleres: [],
        cargos: [],
      }),
    )
    expect(screen.getByText(/2 instituciones sin vincular/i)).toBeInTheDocument()
  })
})

describe('DashboardPage: descargas en el tiempo', () => {
  it('es una tabla accesible con una fila por punto, incluidos los días en 0', async () => {
    await renderPagina()
    expect(within(region('Descargas en el tiempo')).getByRole('table')).toBeInTheDocument()
    const f = filas('Descargas en el tiempo')
    expect(f).toHaveLength(3)
    const ultimaCelda = (fila: HTMLElement) => within(fila).getAllByRole('cell').at(-1)
    expect(ultimaCelda(f[0])).toHaveTextContent('3')
    expect(ultimaCelda(f[1])).toHaveTextContent('0')
    expect(ultimaCelda(f[2])).toHaveTextContent('9')
  })

  it('la tabla tiene encabezados de columna', async () => {
    await renderPagina()
    expect(within(region('Descargas en el tiempo')).getAllByRole('columnheader').length).toBeGreaterThanOrEqual(2)
  })
})

describe('DashboardPage: ranking de talleres', () => {
  it('ordena por descargas desc y luego id, aunque lleguen desordenados', async () => {
    await renderPagina(
      base({
        talleres: [
          { taller_id: 9, titulo: 'Nueve', estado: 'PUBLICADO', descargas: 2 },
          { taller_id: 3, titulo: 'Tres', estado: 'PUBLICADO', descargas: 5 },
          { taller_id: 1, titulo: 'Uno', estado: 'PUBLICADO', descargas: 2 },
        ],
      }),
    )
    const titulos = filas('Ranking de talleres').map((f) => within(f).getAllByRole('cell')[0].textContent)
    expect(titulos).toEqual(['Tres', 'Uno', 'Nueve'])
  })

  it('muestra 10 y "Ver todos" despliega el resto', async () => {
    await renderPagina(base({ talleres: talleresConDescargas(13) }))
    expect(filas('Ranking de talleres')).toHaveLength(10)
    expect(screen.queryByText('Taller 11')).not.toBeInTheDocument()
    await userEvent.click(within(region('Ranking de talleres')).getByRole('button', { name: 'Ver todos' }))
    expect(filas('Ranking de talleres')).toHaveLength(13)
    expect(screen.getByText('Taller 13')).toBeInTheDocument()
  })

  it('con 10 talleres o menos no ofrece "Ver todos"', async () => {
    await renderPagina(base({ talleres: talleresConDescargas(10) }))
    expect(filas('Ranking de talleres')).toHaveLength(10)
    expect(screen.queryByRole('button', { name: 'Ver todos' })).not.toBeInTheDocument()
  })

  it('un taller no publicado lleva un badge con su estado y uno publicado no', async () => {
    await renderPagina(
      base({
        talleres: [
          { taller_id: 1, titulo: 'Publicado', estado: 'PUBLICADO', descargas: 9 },
          { taller_id: 2, titulo: 'Archivado', estado: 'INACTIVO', descargas: 5 },
          { taller_id: 3, titulo: 'En edición', estado: 'BORRADOR', descargas: 2 },
        ],
      }),
    )
    const [pub, ina, bor] = filas('Ranking de talleres')
    expect(within(pub).queryByText(/borrador|inactivo|publicado/i, { selector: 'span' })).not.toBeInTheDocument()
    expect(within(ina).getByText('Inactivo')).toBeInTheDocument()
    expect(within(bor).getByText('Borrador')).toBeInTheDocument()
  })
})

describe('DashboardPage: por nivel y por cargo', () => {
  it('nivel muestra los cinco, también los que están en 0, con cantidad y porcentaje', async () => {
    await renderPagina()
    const f = filas('Descargas por nivel')
    expect(f).toHaveLength(5)
    expect(f[0]).toHaveTextContent('Inicial')
    expect(f[0]).toHaveTextContent('6')
    expect(f[0]).toHaveTextContent(/50\s*%/)
    expect(f[1]).toHaveTextContent(/25\s*%/)
    expect(f[3]).toHaveTextContent('Terciario')
    expect(f[3]).toHaveTextContent(/0\s*%/)
    expect(f[4]).toHaveTextContent('Formación profesional')
  })

  it('cargo muestra solo los cargos con descargas con su porcentaje sobre el total del período', async () => {
    await renderPagina()
    const f = filas('Descargas por cargo')
    expect(f).toHaveLength(2)
    expect(f[0]).toHaveTextContent('Docente')
    expect(f[0]).toHaveTextContent(/75\s*%/)
    expect(f[1]).toHaveTextContent('Director/a')
    expect(f[1]).toHaveTextContent(/25\s*%/)
  })

  it('los porcentajes se calculan en el cliente con un decimal y coma (tres cargos iguales dan 33,3 %)', async () => {
    await renderPagina(
      base({
        cargos: [
          { cargo: 'Docente', descargas: 1 },
          { cargo: 'Director/a', descargas: 1 },
          { cargo: 'Otro', descargas: 1 },
        ],
      }),
    )
    for (const f of filas('Descargas por cargo')) expect(f).toHaveTextContent(/33,3\s*%/)
  })

  it('la sección usa "cargo" y no "rol"', async () => {
    await renderPagina()
    expect(screen.queryByText(/rol/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/escuelas/i)).not.toBeInTheDocument()
  })
})

describe('DashboardPage: por localidad', () => {
  it('muestra descargas, alcanzados, padrón y cobertura calculada en el cliente', async () => {
    await renderPagina(
      base({ localidades: [{ localidad_id: 1, nombre: 'Posadas', descargas: 12, alcanzados: 2, padron: 8 }] }),
    )
    const [f] = filas('Descargas por localidad')
    const celdas = within(f).getAllByRole('cell').map((c) => c.textContent ?? '')
    expect(celdas[0]).toBe('Posadas')
    expect(celdas).toEqual(expect.arrayContaining(['12', '2', '8']))
    expect(f).toHaveTextContent(/25\s*%/)
  })

  it('con padrón 0 la cobertura es "—"', async () => {
    await renderPagina(
      base({ localidades: [{ localidad_id: 2, nombre: 'Oberá', descargas: 0, alcanzados: 0, padron: 0 }] }),
    )
    expect(within(filas('Descargas por localidad')[0]).getByText('—')).toBeInTheDocument()
  })

  it('ordena por descargas desc y luego nombre', async () => {
    await renderPagina(
      base({
        localidades: [
          { localidad_id: 3, nombre: 'Zárate', descargas: 1, alcanzados: 0, padron: 1 },
          { localidad_id: 2, nombre: 'Posadas', descargas: 5, alcanzados: 0, padron: 1 },
          { localidad_id: 1, nombre: 'Apóstoles', descargas: 1, alcanzados: 0, padron: 1 },
        ],
      }),
    )
    const nombres = filas('Descargas por localidad').map((f) => within(f).getAllByRole('cell')[0].textContent)
    expect(nombres).toEqual(['Posadas', 'Apóstoles', 'Zárate'])
  })

  it('muestra 10 y "Ver todas" despliega las 79', async () => {
    await renderPagina(base({ localidades: localidades(79) }))
    expect(filas('Descargas por localidad')).toHaveLength(10)
    await userEvent.click(within(region('Descargas por localidad')).getByRole('button', { name: 'Ver todas' }))
    expect(filas('Descargas por localidad')).toHaveLength(79)
  })

  it('explica que la cobertura cuenta establecimientos activos del padrón', async () => {
    await renderPagina()
    expect(within(region('Descargas por localidad')).getByText(/activos/i)).toBeInTheDocument()
  })
})

describe('DashboardPage: normativas', () => {
  it('aclara que es un total histórico y lista cada normativa con su contador', async () => {
    await renderPagina()
    expect(within(region('Normativas')).getByText(/Total histórico/i)).toBeInTheDocument()
    const f = filas('Normativas')
    expect(f).toHaveLength(3)
    expect(f[0]).toHaveTextContent('Disposición 3')
    expect(f[0]).toHaveTextContent('9')
    expect(f[1]).toHaveTextContent('Resolución 10')
    expect(f[2]).toHaveTextContent('Circular 7')
  })

  it('muestra número y año de cada normativa', async () => {
    await renderPagina()
    expect(filas('Normativas')[1]).toHaveTextContent(/10.*2024|2024.*10/)
  })

  it('sin normativas el KPI es 0 y la sección no muestra filas', async () => {
    await renderPagina(base({ normativas: [] }))
    expect(kpi('Normativas')).toHaveTextContent('0')
    expect(within(region('Normativas')).queryAllByRole('row').slice(1)).toHaveLength(0)
  })
})
