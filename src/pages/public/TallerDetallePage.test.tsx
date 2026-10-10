import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { obtenerTalleres } from '@/features/talleres/consultas'
import { ETIQUETA_TIPO_RECURSO, type Recurso } from '@/features/recursos/types'
import type { Taller } from '@/features/talleres/types'
import { renderConProviders } from '@/test/utils'
import { TallerDetallePage } from './TallerDetallePage'

vi.mock('@/features/talleres/consultas', () => ({
  obtenerCategorias: vi.fn(),
  crearCategoria: vi.fn(),
  actualizarCategoria: vi.fn(),
  obtenerTalleres: vi.fn(),
  guardarTaller: vi.fn(),
  cambiarEstadoTaller: vi.fn(),
}))

function taller(id: number, nombre: string, p: Partial<Taller> = {}): Taller {
  return {
    id,
    categoria_id: 7,
    nombre,
    descripcion: '',
    estado: 'PUBLICADO',
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-10T00:00:00Z',
    categoria: { nivel_id: 3 },
    destinatario: [],
    etiqueta: [],
    recurso: [],
    ...p,
  }
}

function recurso(id: number, orden: number, p: Partial<Recurso> = {}): Recurso {
  return {
    id,
    taller_id: 7,
    nombre: `Recurso ${id}`,
    tipo: 'PDF',
    ruta_archivo: `7/${id}.pdf`,
    url: null,
    tamanio_bytes: 1572864,
    orden,
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-10T00:00:00Z',
    ...p,
  }
}

const enlace = (id: number, orden: number, nombre: string, url: string) =>
  recurso(id, orden, { nombre, tipo: 'ENLACE', ruta_archivo: null, tamanio_bytes: null, url })

const conRecursos = taller(7, 'Taller completo', {
  recurso: [
    recurso(1, 1, { nombre: 'Guía de huerta' }),
    recurso(2, 2, { nombre: 'Presentación', tipo: 'PPTX', ruta_archivo: '7/2.pptx', tamanio_bytes: 2097152 }),
    enlace(3, 3, 'Video de la clase', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s'),
    enlace(4, 4, 'Sitio del programa', 'https://example.com/programa'),
  ],
})

const datos = [
  taller(1, 'Cuidados en redes', {
    descripcion: 'Convivencia digital en la escuela',
    destinatario: [{ id: 1, nombre: 'Directivos' }],
    etiqueta: [{ id: 1, nombre: 'Ciberseguridad' }],
  }),
  taller(2, 'Borrador secreto', { estado: 'BORRADOR' }),
  taller(3, 'Taller dado de baja', { estado: 'INACTIVO' }),
  taller(4, 'Similar publicado'),
  taller(5, 'Similar en borrador', { estado: 'BORRADOR' }),
  taller(6, 'De otra categoría', { categoria_id: 8 }),
  conRecursos,
]

function renderPagina(id: string) {
  return renderConProviders(
    <Routes>
      <Route path="/talleres/:id" element={<TallerDetallePage />} />
    </Routes>,
    { ruta: `/talleres/${id}` },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(obtenerTalleres).mockResolvedValue(datos)
})

describe('TallerDetallePage', () => {
  it('un taller publicado muestra nombre, nivel, descripción, destinatarios y etiquetas', async () => {
    renderPagina('1')
    expect(await screen.findByRole('heading', { name: 'Cuidados en redes' })).toBeInTheDocument()
    expect(screen.getByText('Convivencia digital en la escuela')).toBeInTheDocument()
    expect(screen.getByText(/secundario/i)).toBeInTheDocument()
    expect(screen.getByText('Directivos')).toBeInTheDocument()
    expect(screen.getByText('Ciberseguridad')).toBeInTheDocument()
  })

  it('no ofrece descarga ni vista previa (la descarga llega con el corte descargas)', async () => {
    renderPagina('1')
    await screen.findByRole('heading', { name: 'Cuidados en redes' })
    expect(screen.queryByRole('button', { name: /descargar/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/vista previa/i)).not.toBeInTheDocument()
  })

  it('un taller sin recursos no muestra la sección "Recursos"', async () => {
    renderPagina('1')
    await screen.findByRole('heading', { name: 'Cuidados en redes' })
    expect(screen.queryByRole('heading', { name: /recursos/i })).not.toBeInTheDocument()
  })

  it('un borrador muestra "no encontrado", no sus datos', async () => {
    renderPagina('2')
    expect(await screen.findByText(/no encontrad/i)).toBeInTheDocument()
    expect(screen.queryByText('Borrador secreto')).not.toBeInTheDocument()
  })

  it('un taller inactivo muestra "no encontrado"', async () => {
    renderPagina('3')
    expect(await screen.findByText(/no encontrad/i)).toBeInTheDocument()
    expect(screen.queryByText('Taller dado de baja')).not.toBeInTheDocument()
  })

  it('un id inexistente muestra "no encontrado"', async () => {
    renderPagina('999')
    expect(await screen.findByText(/no encontrad/i)).toBeInTheDocument()
  })

  it('un id inválido muestra "no encontrado"', async () => {
    renderPagina('abc')
    expect(await screen.findByText(/no encontrad/i)).toBeInTheDocument()
  })

  it('si la carga falla muestra un alert con "Reintentar", no "no encontrado"; reintentar lo recupera', async () => {
    vi.mocked(obtenerTalleres).mockRejectedValueOnce(new Error('sin red'))
    renderPagina('1')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText(/no encontrad/i)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('heading', { name: 'Cuidados en redes' })).toBeInTheDocument()
  })

  it('los similares son los publicados de la misma categoría, sin el propio taller ni borradores', async () => {
    renderPagina('1')
    await screen.findByRole('heading', { name: 'Cuidados en redes' })
    expect(await screen.findByText('Similar publicado')).toBeInTheDocument()
    expect(screen.queryByText('Similar en borrador')).not.toBeInTheDocument()
    expect(screen.queryByText('De otra categoría')).not.toBeInTheDocument()
    expect(screen.getAllByText('Cuidados en redes')).toHaveLength(1) // solo el heading
  })
})

/*
 * Criterio 9: sección "Recursos" (heading) dentro del detalle. Cada recurso es un <li> con su nombre.
 * Los archivos muestran la etiqueta del tipo (ETIQUETA_TIPO_RECURSO) y el tamaño (formatearTamanio);
 * hay un texto con "total" y la suma de los tamaños. Un enlace de YouTube va en un <iframe> con título hacia
 * https://www.youtube-nocookie.com/embed/<id>; otro enlace es un <a> externo. Sin botón ni enlace "Descargar".
 */
describe('TallerDetallePage: recursos', () => {
  const item = (nombre: string) => {
    const li = screen.getByText(nombre).closest('li')
    if (!li) throw new Error(`No hay <li> para ${nombre}`)
    return within(li)
  }

  it('muestra la sección "Recursos" con los archivos: nombre, tipo legible y tamaño', async () => {
    renderPagina('7')
    expect(await screen.findByRole('heading', { name: /recursos/i })).toBeInTheDocument()

    expect(item('Guía de huerta').getByText(ETIQUETA_TIPO_RECURSO.PDF)).toBeInTheDocument()
    expect(item('Guía de huerta').getByText('1,5 MB')).toBeInTheDocument()
    expect(item('Presentación').getByText(ETIQUETA_TIPO_RECURSO.PPTX)).toBeInTheDocument()
    expect(item('Presentación').getByText('2 MB')).toBeInTheDocument()
  })

  it('muestra el tamaño total de los archivos (los enlaces no suman)', async () => {
    renderPagina('7')
    await screen.findByRole('heading', { name: /recursos/i })
    expect(screen.getByText(/total/i)).toHaveTextContent('3,5 MB')
  })

  it('integra un enlace de YouTube con youtube-nocookie.com/embed/<id>', async () => {
    const { container } = renderPagina('7')
    await screen.findByRole('heading', { name: /recursos/i })

    const iframes = container.querySelectorAll('iframe')
    expect(iframes).toHaveLength(1)
    expect(iframes[0]).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(iframes[0].getAttribute('title')).toBeTruthy()
    expect(screen.getByText('Video de la clase')).toBeInTheDocument()
  })

  it('muestra otro enlace como enlace externo con target="_blank" y rel="noopener noreferrer"', async () => {
    renderPagina('7')
    const enlaceExterno = await screen.findByRole('link', { name: /Sitio del programa/ })
    expect(enlaceExterno).toHaveAttribute('href', 'https://example.com/programa')
    expect(enlaceExterno).toHaveAttribute('target', '_blank')
    expect(enlaceExterno).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('no ofrece descarga: ni botón ni enlace "Descargar"', async () => {
    renderPagina('7')
    await screen.findByRole('heading', { name: /recursos/i })
    expect(screen.queryByRole('button', { name: /descargar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /descargar/i })).not.toBeInTheDocument()
  })

  it('un taller solo con enlaces muestra la sección, sin tamaño total', async () => {
    vi.mocked(obtenerTalleres).mockResolvedValue([
      taller(8, 'Solo enlaces', { recurso: [enlace(9, 1, 'Sitio', 'https://example.com')] }),
    ])
    renderPagina('8')
    expect(await screen.findByRole('heading', { name: /recursos/i })).toBeInTheDocument()
    expect(screen.queryByText(/total/i)).not.toBeInTheDocument()
  })
})
