import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { onlineManager } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { contarDescargaNormativa, obtenerNormativas } from '@/features/normativas/consultas'
import type { Normativa } from '@/features/normativas/types'
import { renderConProviders } from '@/test/utils'
import { NormativasPublicPage } from './NormativasPublicPage'

/*
 * Criterios 5 y 6. Se mockea solo `normativas/consultas` (contrato: ver secuencias.test.ts y useNormativas.test.ts);
 * hooks, filtrar y la página son los reales. Textos y roles asumidos:
 *  - un solo campo de texto (role textbox) para buscar; filtra al escribir, sin tildes ni mayúsculas.
 *  - cada normativa es un <li> con su título, número, año y etiquetas.
 *  - "Descargar" es un enlace (role link, nombre que contiene "Descargar") con href = normativa.url, target="_blank" y rel con "noopener".
 *    Su onClick llama a contarDescargaNormativa(id) una sola vez por normativa en la visita (sessionStorage); no impide abrir el PDF.
 *  - sin resultados: texto "No encontramos normativas".
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
    ruta_archivo: `00000000-0000-0000-0000-00000000000${id}.pdf`,
    descargas: 0,
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-10T00:00:00Z',
    etiqueta: [],
    url: `https://ejemplo.test/normativas/${id}.pdf`,
    ...p,
  }
}

const evaluacion = normativa(1, {
  titulo: 'Régimen de evaluación',
  numero: 'Res. 1234/24',
  anio: 2022,
  etiqueta: [{ id: 1, nombre: 'Primaria' }],
})
const asistencia = normativa(2, { titulo: 'Asistencia', descripcion: 'Justificación de inasistencias', anio: 2024 })
const convivencia = normativa(3, { titulo: 'Convivencia', anio: 2024 })

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  vi.mocked(obtenerNormativas).mockResolvedValue([evaluacion, asistencia, convivencia])
  vi.mocked(contarDescargaNormativa).mockResolvedValue(undefined)
})

afterEach(() => {
  sessionStorage.clear()
  onlineManager.setOnline(true)
})

const enlaces = () => screen.getAllByRole('link', { name: /Descargar/ })

describe('NormativasPublicPage: lista y búsqueda (criterio 5)', () => {
  it('lista las normativas del backend, la de año más reciente primero (año desc, id desc)', async () => {
    renderConProviders(<NormativasPublicPage />)
    const items = await screen.findAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Convivencia')
    expect(items[1]).toHaveTextContent('Asistencia')
    expect(items[2]).toHaveTextContent('Régimen de evaluación')
    expect(items[2]).toHaveTextContent('Res. 1234/24')
    expect(items[2]).toHaveTextContent('Primaria')
  })

  it('filtra por título sin distinguir mayúsculas ni tildes', async () => {
    renderConProviders(<NormativasPublicPage />)
    await screen.findAllByRole('listitem')
    await userEvent.type(screen.getByRole('textbox'), 'REGIMEN')
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
    expect(screen.getByText(/Régimen de evaluación/)).toBeInTheDocument()
  })

  it('filtra por número, por descripción y por etiqueta', async () => {
    renderConProviders(<NormativasPublicPage />)
    await screen.findAllByRole('listitem')
    const buscador = screen.getByRole('textbox')

    await userEvent.type(buscador, '1234/24')
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
    expect(screen.getByText(/Régimen de evaluación/)).toBeInTheDocument()

    await userEvent.clear(buscador)
    await userEvent.type(buscador, 'inasistencias')
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
    expect(screen.getByText(/Asistencia/)).toBeInTheDocument()

    await userEvent.clear(buscador)
    await userEvent.type(buscador, 'primaria')
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
    expect(screen.getByText(/Régimen de evaluación/)).toBeInTheDocument()
  })

  it('si nada coincide muestra que no encontró normativas', async () => {
    renderConProviders(<NormativasPublicPage />)
    await screen.findAllByRole('listitem')
    await userEvent.type(screen.getByRole('textbox'), 'astronomía')
    expect(await screen.findByText('No encontramos normativas')).toBeInTheDocument()
  })
})

describe('NormativasPublicPage: carga', () => {
  it('sin red la primera carga queda pausada y la pantalla muestra el esqueleto, no una sección vacía', async () => {
    onlineManager.setOnline(false)
    const { container } = renderConProviders(<NormativasPublicPage />)
    await waitFor(() => expect(container.querySelector('.animate-pulse')).not.toBeNull())
    expect(screen.queryByText('No encontramos normativas')).not.toBeInTheDocument()
    expect(obtenerNormativas).not.toHaveBeenCalled()
  })
})

describe('NormativasPublicPage: descarga (criterio 6)', () => {
  it('"Descargar" es un enlace al PDF público que abre en otra pestaña', async () => {
    renderConProviders(<NormativasPublicPage />)
    await screen.findAllByRole('listitem')
    const [primero] = enlaces()
    expect(primero).toHaveAttribute('href', 'https://ejemplo.test/normativas/3.pdf')
    expect(primero).toHaveAttribute('target', '_blank')
    expect(primero.getAttribute('rel')).toMatch(/noopener/)
  })

  it('cada fila apunta a la url de su propia normativa', async () => {
    renderConProviders(<NormativasPublicPage />)
    await screen.findAllByRole('listitem')
    expect(enlaces().map((a) => a.getAttribute('href'))).toEqual([
      'https://ejemplo.test/normativas/3.pdf',
      'https://ejemplo.test/normativas/2.pdf',
      'https://ejemplo.test/normativas/1.pdf',
    ])
  })

  it('al pulsarlo cuenta la descarga de esa normativa, una sola vez por normativa en la visita', async () => {
    renderConProviders(<NormativasPublicPage />)
    await screen.findAllByRole('listitem')
    const [convivenciaEnlace, asistenciaEnlace] = enlaces()

    await userEvent.click(convivenciaEnlace)
    await userEvent.click(convivenciaEnlace)
    expect(contarDescargaNormativa).toHaveBeenCalledTimes(1)
    expect(contarDescargaNormativa).toHaveBeenCalledWith(3)

    await userEvent.click(asistenciaEnlace)
    expect(contarDescargaNormativa).toHaveBeenCalledTimes(2)
    expect(contarDescargaNormativa).toHaveBeenLastCalledWith(2)
  })

  it('el botón del medio (auxclick) también cuenta, y los otros botones auxiliares no', async () => {
    renderConProviders(<NormativasPublicPage />)
    await screen.findAllByRole('listitem')
    const [enlace] = enlaces()

    fireEvent(enlace, new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 2 }))
    expect(contarDescargaNormativa).not.toHaveBeenCalled()

    fireEvent(enlace, new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }))
    fireEvent(enlace, new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }))
    expect(contarDescargaNormativa).toHaveBeenCalledTimes(1)
    expect(contarDescargaNormativa).toHaveBeenCalledWith(3)
  })

  it('no cancela la apertura del enlace (no hace preventDefault)', async () => {
    renderConProviders(<NormativasPublicPage />)
    await screen.findAllByRole('listitem')
    const [enlace] = enlaces()
    const evento = new MouseEvent('click', { bubbles: true, cancelable: true })
    enlace.dispatchEvent(evento)
    expect(evento.defaultPrevented).toBe(false)
  })

  it('si el contador falla el enlace sigue ahí y no aparece ningún error', async () => {
    vi.mocked(contarDescargaNormativa).mockRejectedValue(new Error('sin red'))
    renderConProviders(<NormativasPublicPage />)
    await screen.findAllByRole('listitem')
    await userEvent.click(enlaces()[0])
    expect(contarDescargaNormativa).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(enlaces()).toHaveLength(3)
  })
})
