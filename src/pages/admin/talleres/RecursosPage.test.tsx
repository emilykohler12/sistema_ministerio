import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  actualizarRecurso,
  borrarArchivo,
  eliminarFilaRecurso,
  insertarRecurso,
  ordenarRecursos,
  subirArchivo,
  urlFirmada,
} from '@/features/recursos/consultas'
import { formatearTamanio } from '@/features/recursos/archivos'
import { ETIQUETA_TIPO_RECURSO, type Recurso } from '@/features/recursos/types'
import { obtenerCategorias, obtenerTalleres } from '@/features/talleres/consultas'
import type { Categoria, Taller } from '@/features/talleres/types'
import { renderConProviders } from '@/test/utils'
import { RecursosPage } from './RecursosPage'

/*
 * Pantalla nueva: src/pages/admin/talleres/RecursosPage.tsx, export `RecursosPage`.
 * Ruta: /admin/talleres/:nivelId/:categoriaId/:tallerId/recursos. Se mockean solo los módulos `consultas`
 * (recursos y talleres); hooks, secuencias, archivos y errores son los reales. Contrato de consultas: ver
 * secuencias.test.ts y useRecursos.test.ts. Los recursos salen de `taller.recurso` (ya ordenados por orden, id).
 *
 * Textos y roles asumidos:
 *  - heading con "Recursos" (y el nombre del taller visible); sin recursos: texto "Todavía no hay recursos".
 *  - cada recurso es un <li> o <tr> que contiene su nombre, la etiqueta del tipo (ETIQUETA_TIPO_RECURSO),
 *    el tamaño (formatearTamanio, solo archivos) y botones "Subir", "Bajar", "Ver" (solo archivos), "Editar",
 *    "Reemplazar" (solo archivos) y "Eliminar". El primero tiene "Subir" deshabilitado y el último "Bajar".
 *  - el alta de archivos es un FileDropzone con `multiple` (input[type=file][multiple]).
 *  - "Reemplazar" deja disponible un input[type=file] sin `multiple`, dentro de la fila o de un role="dialog".
 *  - "Agregar enlace" abre un diálogo con los campos "Nombre" y "URL" y el botón "Agregar".
 *  - "Editar" abre un diálogo con "Nombre" (y "URL" en enlaces) y el botón "Guardar".
 *  - "Eliminar" abre un diálogo de confirmación cuyo botón de confirmar se llama "Eliminar".
 *  - los errores salen en elementos con role="alert". "Ver" llama a urlFirmada(ruta) y abre la URL con window.open.
 */
vi.mock('@/features/recursos/consultas', () => ({
  subirArchivo: vi.fn(),
  borrarArchivo: vi.fn(),
  insertarRecurso: vi.fn(),
  actualizarRecurso: vi.fn(),
  eliminarFilaRecurso: vi.fn(),
  ordenarRecursos: vi.fn(),
  urlFirmada: vi.fn(),
}))
vi.mock('@/features/talleres/consultas', () => ({
  obtenerCategorias: vi.fn(),
  crearCategoria: vi.fn(),
  actualizarCategoria: vi.fn(),
  obtenerTalleres: vi.fn(),
  guardarTaller: vi.fn(),
  cambiarEstadoTaller: vi.fn(),
}))

const ciencia: Categoria = {
  id: 7,
  nivel_id: 3,
  nombre: 'Ciencia',
  descripcion: '',
  activo: true,
  created_at: '2026-10-10T00:00:00Z',
  updated_at: '2026-10-10T00:00:00Z',
}

function recurso(id: number, orden: number, p: Partial<Recurso> = {}): Recurso {
  return {
    id,
    taller_id: 5,
    nombre: `Recurso ${id}`,
    tipo: 'PDF',
    ruta_archivo: `5/viejo-${id}.pdf`,
    url: null,
    tamanio_bytes: 1572864,
    orden,
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-10T00:00:00Z',
    ...p,
  }
}

const guia = recurso(1, 1, { nombre: 'Guía de huerta' })
const video = recurso(2, 2, {
  nombre: 'Video de la clase',
  tipo: 'ENLACE',
  ruta_archivo: null,
  tamanio_bytes: null,
  url: 'https://youtu.be/dQw4w9WgXcQ',
})
const planilla = recurso(3, 3, { nombre: 'Planilla', tipo: 'DOCX', ruta_archivo: '5/viejo-3.docx', tamanio_bytes: 2048 })

function taller(p: Partial<Taller> = {}): Taller {
  return {
    id: 5,
    categoria_id: 7,
    nombre: 'Huerta escolar',
    descripcion: 'Cultivo',
    estado: 'PUBLICADO',
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-10T00:00:00Z',
    categoria: { nivel_id: 3 },
    destinatario: [],
    etiqueta: [],
    recurso: [guia, video, planilla],
    ...p,
  }
}

const RUTA = '/admin/talleres/3/7/5/recursos'
const usuario = () => userEvent.setup({ applyAccept: false })

function renderPagina(ruta = RUTA) {
  return renderConProviders(
    <Routes>
      <Route path="/admin/talleres/:nivelId/:categoriaId/:tallerId/recursos" element={<RecursosPage />} />
    </Routes>,
    { ruta },
  )
}

const fila = (nombre: string) => {
  const contenedor = screen.getByText(nombre).closest('li, tr')
  if (!contenedor) throw new Error(`No hay fila para ${nombre}`)
  return within(contenedor as HTMLElement)
}
const boton = (f: ReturnType<typeof fila>, nombre: string) => f.getByRole('button', { name: new RegExp(`^${nombre}`) })

function archivo(nombre: string, type = '', size?: number) {
  const f = new File(['contenido'], nombre, { type })
  if (size !== undefined) Object.defineProperty(f, 'size', { value: size })
  return f
}

function inputDeAlta(container: HTMLElement) {
  return container.querySelector('input[type="file"][multiple]') as HTMLInputElement
}

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.resetAllMocks()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.mocked(obtenerCategorias).mockResolvedValue([ciencia])
  vi.mocked(obtenerTalleres).mockResolvedValue([taller()])
  vi.mocked(subirArchivo).mockResolvedValue(undefined)
  vi.mocked(borrarArchivo).mockResolvedValue(undefined)
  // La baja devuelve la ruta que la fila tenía en la base (null si es un enlace).
  vi.mocked(eliminarFilaRecurso).mockImplementation(
    async (id) => [guia, video, planilla].find((r) => r.id === id)?.ruta_archivo ?? null,
  )
  vi.mocked(ordenarRecursos).mockResolvedValue(undefined)
  vi.mocked(insertarRecurso).mockImplementation(async (n) => recurso(50, n.orden, n as Partial<Recurso>))
  vi.mocked(actualizarRecurso).mockImplementation(async (id, c) => recurso(id, 1, c as Partial<Recurso>))
})

afterEach(() => {
  warn.mockRestore()
})

describe('RecursosPage: carga y lista', () => {
  it('muestra el taller y la lista de sus recursos con nombre, tipo y tamaño', async () => {
    renderPagina()
    expect(await screen.findByRole('heading', { name: /recursos/i })).toBeInTheDocument()
    expect(screen.getAllByText('Huerta escolar').length).toBeGreaterThan(0)

    expect(fila('Guía de huerta').getByText(ETIQUETA_TIPO_RECURSO.PDF)).toBeInTheDocument()
    expect(fila('Guía de huerta').getByText('1,5 MB')).toBeInTheDocument()
    expect(fila('Planilla').getByText(ETIQUETA_TIPO_RECURSO.DOCX)).toBeInTheDocument()
    expect(fila('Planilla').getByText('2 KB')).toBeInTheDocument()
    expect(fila('Video de la clase').getByText(ETIQUETA_TIPO_RECURSO.ENLACE)).toBeInTheDocument()
  })

  it('lista los recursos en el orden recibido', async () => {
    renderPagina()
    await screen.findByText('Guía de huerta')
    const nombres = screen.getAllByText(/^(Guía de huerta|Video de la clase|Planilla)$/).map((n) => n.textContent)
    expect(nombres).toEqual(['Guía de huerta', 'Video de la clase', 'Planilla'])
  })

  it('un taller sin recursos muestra el estado vacío y sigue ofreciendo cargar', async () => {
    vi.mocked(obtenerTalleres).mockResolvedValue([taller({ recurso: [] })])
    const { container } = renderPagina()
    expect(await screen.findByText(/todavía no hay recursos/i)).toBeInTheDocument()
    expect(inputDeAlta(container)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agregar enlace' })).toBeInTheDocument()
  })

  it('los archivos ofrecen Ver y Reemplazar; los enlaces no', async () => {
    renderPagina()
    await screen.findByText('Guía de huerta')
    expect(boton(fila('Guía de huerta'), 'Ver')).toBeInTheDocument()
    expect(boton(fila('Guía de huerta'), 'Reemplazar')).toBeInTheDocument()
    expect(fila('Video de la clase').queryByRole('button', { name: /^Reemplazar/ })).not.toBeInTheDocument()
    expect(fila('Video de la clase').queryByRole('button', { name: /^Ver/ })).not.toBeInTheDocument()
    expect(boton(fila('Video de la clase'), 'Editar')).toBeInTheDocument()
    expect(boton(fila('Video de la clase'), 'Eliminar')).toBeInTheDocument()
  })
})

describe('RecursosPage: no encontrado y errores de carga', () => {
  it('con un :tallerId inválido muestra "no encontrado"', async () => {
    renderPagina('/admin/talleres/3/7/abc/recursos')
    expect(await screen.findByText(/no encontrad/i)).toBeInTheDocument()
  })

  it('con un taller inexistente muestra "no encontrado"', async () => {
    renderPagina('/admin/talleres/3/7/999/recursos')
    expect(await screen.findByText(/no encontrad/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /recursos/i })).not.toBeInTheDocument()
  })

  it('con un taller de otra categoría muestra "no encontrado"', async () => {
    vi.mocked(obtenerTalleres).mockResolvedValue([taller({ categoria_id: 8 })])
    renderPagina()
    expect(await screen.findByText(/no encontrad/i)).toBeInTheDocument()
  })

  it('con una categoría de otro nivel o inexistente muestra "no encontrado"', async () => {
    renderPagina('/admin/talleres/1/7/5/recursos')
    expect(await screen.findByText(/no encontrad/i)).toBeInTheDocument()
  })

  it('si la carga falla muestra un alert con "Reintentar"; reintentar lo recupera', async () => {
    vi.mocked(obtenerTalleres).mockRejectedValueOnce(new Error('sin red'))
    renderPagina()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText(/no encontrad/i)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Guía de huerta')).toBeInTheDocument()
  })
})

describe('RecursosPage: alta de archivos (criterio 1)', () => {
  it('sube el archivo con el MIME canónico, inserta el recurso al final y refresca la lista', async () => {
    const nuevo = recurso(60, 4, { nombre: 'Planilla nueva', tipo: 'DOCX', ruta_archivo: '5/x.docx', tamanio_bytes: 9 })
    vi.mocked(obtenerTalleres)
      .mockResolvedValueOnce([taller()])
      .mockResolvedValue([taller({ recurso: [guia, video, planilla, nuevo] })])
    const { container } = renderPagina()
    await screen.findByText('Guía de huerta')

    const file = archivo('Planilla nueva.docx', '')
    await usuario().upload(inputDeAlta(container), file)

    await waitFor(() => expect(insertarRecurso).toHaveBeenCalledTimes(1))
    const [ruta, subido, mime] = vi.mocked(subirArchivo).mock.calls[0]
    expect(ruta).toMatch(/^5\/[0-9a-f-]{36}\.docx$/)
    expect(subido).toBe(file)
    expect(mime).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(vi.mocked(insertarRecurso).mock.calls[0][0]).toEqual({
      taller_id: 5,
      nombre: 'Planilla nueva',
      tipo: 'DOCX',
      ruta_archivo: ruta,
      tamanio_bytes: file.size,
      orden: 4,
    })
    expect(await screen.findByText('Planilla nueva')).toBeInTheDocument()
  })

  it('un lote de varios archivos se sube de a uno, con órdenes consecutivos', async () => {
    const { container } = renderPagina()
    await screen.findByText('Guía de huerta')

    await usuario().upload(inputDeAlta(container), [archivo('uno.pdf', 'application/pdf'), archivo('dos.pptx')])

    await waitFor(() => expect(insertarRecurso).toHaveBeenCalledTimes(2))
    expect(vi.mocked(insertarRecurso).mock.calls.map((c) => [c[0].nombre, c[0].orden])).toEqual([
      ['uno', 4],
      ['dos', 5],
    ])
  })

  it('mientras sube muestra el estado "subiendo" del archivo', async () => {
    let terminar: () => void = () => {}
    vi.mocked(subirArchivo).mockImplementation(() => new Promise<void>((resolver) => (terminar = resolver)))
    const { container } = renderPagina()
    await screen.findByText('Guía de huerta')

    await usuario().upload(inputDeAlta(container), archivo('uno.pdf', 'application/pdf'))

    expect(await screen.findByRole('progressbar', { name: 'uno.pdf' })).toBeInTheDocument()
    terminar()
    await waitFor(() => expect(insertarRecurso).toHaveBeenCalled())
  })

  it('rechaza un formato no admitido con el motivo, sin llamar a subir', async () => {
    const { container } = renderPagina()
    await screen.findByText('Guía de huerta')

    await usuario().upload(inputDeAlta(container), archivo('instalador.exe', 'application/x-msdownload'))

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(/formato/i)
    expect(alerta).toHaveTextContent('instalador.exe')
    expect(subirArchivo).not.toHaveBeenCalled()
    expect(insertarRecurso).not.toHaveBeenCalled()
  })

  it('rechaza un archivo de más de 50 MiB con el motivo de tamaño, sin llamar a subir', async () => {
    const { container } = renderPagina()
    await screen.findByText('Guía de huerta')

    await usuario().upload(inputDeAlta(container), archivo('clase.mp4', 'video/mp4', 52428801))

    expect(await screen.findByRole('alert')).toHaveTextContent(/tamaño/i)
    expect(subirArchivo).not.toHaveBeenCalled()
  })

  it('en un lote, los archivos válidos se suben aunque otro se rechace', async () => {
    const { container } = renderPagina()
    await screen.findByText('Guía de huerta')

    await usuario().upload(inputDeAlta(container), [archivo('malo.exe'), archivo('bueno.pdf', 'application/pdf')])

    await waitFor(() => expect(insertarRecurso).toHaveBeenCalledTimes(1))
    expect(vi.mocked(insertarRecurso).mock.calls[0][0].nombre).toBe('bueno')
    expect(subirArchivo).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toHaveTextContent('malo.exe')
  })

  it('si el bucket rechaza con 413, muestra el mismo motivo de tamaño', async () => {
    vi.mocked(subirArchivo).mockRejectedValue({ status: 413, statusCode: '413', message: 'too big' })
    const { container } = renderPagina()
    await screen.findByText('Guía de huerta')

    await usuario().upload(inputDeAlta(container), archivo('uno.pdf', 'application/pdf'))

    expect(await screen.findByRole('alert')).toHaveTextContent(/tamaño/i)
    expect(insertarRecurso).not.toHaveBeenCalled()
  })

  it('si el bucket rechaza con 415, muestra el motivo de formato', async () => {
    vi.mocked(subirArchivo).mockRejectedValue({ status: 415, statusCode: '415', message: 'mime' })
    const { container } = renderPagina()
    await screen.findByText('Guía de huerta')

    await usuario().upload(inputDeAlta(container), archivo('uno.pdf', 'application/pdf'))

    expect(await screen.findByRole('alert')).toHaveTextContent(/formato/i)
  })
})

describe('RecursosPage: alta de enlaces (criterio 2)', () => {
  async function abrirDialogoEnlace() {
    await screen.findByText('Guía de huerta')
    await userEvent.click(screen.getByRole('button', { name: 'Agregar enlace' }))
    return within(await screen.findByRole('dialog'))
  }

  it('crea un enlace https con nombre recortado, tipo ENLACE y orden al final', async () => {
    renderPagina()
    const dialogo = await abrirDialogoEnlace()

    await userEvent.type(dialogo.getByLabelText('Nombre'), '  Sitio del programa  ')
    await userEvent.type(dialogo.getByLabelText('URL'), 'https://example.com/programa')
    await userEvent.click(dialogo.getByRole('button', { name: 'Agregar' }))

    await waitFor(() => expect(insertarRecurso).toHaveBeenCalledTimes(1))
    expect(vi.mocked(insertarRecurso).mock.calls[0][0]).toEqual({
      taller_id: 5,
      nombre: 'Sitio del programa',
      tipo: 'ENLACE',
      url: 'https://example.com/programa',
      orden: 4,
    })
    expect(subirArchivo).not.toHaveBeenCalled()
  })

  it('rechaza una URL que no es https:// y no guarda', async () => {
    renderPagina()
    const dialogo = await abrirDialogoEnlace()

    await userEvent.type(dialogo.getByLabelText('Nombre'), 'Sitio')
    await userEvent.type(dialogo.getByLabelText('URL'), 'http://example.com')
    await userEvent.click(dialogo.getByRole('button', { name: 'Agregar' }))

    expect((await dialogo.findAllByRole('alert')).length).toBeGreaterThan(0)
    expect(insertarRecurso).not.toHaveBeenCalled()
  })

  it('rechaza un nombre en blanco y no guarda', async () => {
    renderPagina()
    const dialogo = await abrirDialogoEnlace()

    await userEvent.type(dialogo.getByLabelText('Nombre'), '   ')
    await userEvent.type(dialogo.getByLabelText('URL'), 'https://example.com')
    await userEvent.click(dialogo.getByRole('button', { name: 'Agregar' }))

    expect((await dialogo.findAllByRole('alert')).length).toBeGreaterThan(0)
    expect(insertarRecurso).not.toHaveBeenCalled()
  })

  it('rechaza un nombre de más de 200 caracteres', async () => {
    renderPagina()
    const dialogo = await abrirDialogoEnlace()

    await userEvent.click(dialogo.getByLabelText('Nombre'))
    await userEvent.paste('a'.repeat(201))
    await userEvent.type(dialogo.getByLabelText('URL'), 'https://example.com')
    await userEvent.click(dialogo.getByRole('button', { name: 'Agregar' }))

    expect((await dialogo.findAllByRole('alert')).length).toBeGreaterThan(0)
    expect(insertarRecurso).not.toHaveBeenCalled()
  })

  it('rechaza una URL de más de 500 caracteres', async () => {
    renderPagina()
    const dialogo = await abrirDialogoEnlace()

    await userEvent.type(dialogo.getByLabelText('Nombre'), 'Sitio')
    await userEvent.click(dialogo.getByLabelText('URL'))
    await userEvent.paste(`https://example.com/${'a'.repeat(500)}`)
    await userEvent.click(dialogo.getByRole('button', { name: 'Agregar' }))

    expect((await dialogo.findAllByRole('alert')).length).toBeGreaterThan(0)
    expect(insertarRecurso).not.toHaveBeenCalled()
  })
})

describe('RecursosPage: edición (criterio 3)', () => {
  it('renombra un archivo: el diálogo precarga el nombre, no tiene URL y guarda solo { nombre }', async () => {
    renderPagina()
    await screen.findByText('Guía de huerta')
    await userEvent.click(boton(fila('Guía de huerta'), 'Editar'))

    const dialogo = within(await screen.findByRole('dialog'))
    expect(dialogo.getByLabelText('Nombre')).toHaveValue('Guía de huerta')
    expect(dialogo.queryByLabelText('URL')).not.toBeInTheDocument()

    await userEvent.clear(dialogo.getByLabelText('Nombre'))
    await userEvent.type(dialogo.getByLabelText('Nombre'), '  Guía nueva  ')
    await userEvent.click(dialogo.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(actualizarRecurso).toHaveBeenCalledTimes(1))
    expect(actualizarRecurso).toHaveBeenCalledWith(1, { nombre: 'Guía nueva' })
  })

  it('en un enlace permite cambiar la URL: guarda { nombre, url }', async () => {
    renderPagina()
    await screen.findByText('Video de la clase')
    await userEvent.click(boton(fila('Video de la clase'), 'Editar'))

    const dialogo = within(await screen.findByRole('dialog'))
    expect(dialogo.getByLabelText('URL')).toHaveValue('https://youtu.be/dQw4w9WgXcQ')
    await userEvent.clear(dialogo.getByLabelText('URL'))
    await userEvent.type(dialogo.getByLabelText('URL'), 'https://example.com/nuevo')
    await userEvent.click(dialogo.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(actualizarRecurso).toHaveBeenCalledTimes(1))
    expect(actualizarRecurso).toHaveBeenCalledWith(2, { nombre: 'Video de la clase', url: 'https://example.com/nuevo' })
  })

  it('un enlace no acepta una URL http://', async () => {
    renderPagina()
    await screen.findByText('Video de la clase')
    await userEvent.click(boton(fila('Video de la clase'), 'Editar'))

    const dialogo = within(await screen.findByRole('dialog'))
    await userEvent.clear(dialogo.getByLabelText('URL'))
    await userEvent.type(dialogo.getByLabelText('URL'), 'http://example.com')
    await userEvent.click(dialogo.getByRole('button', { name: 'Guardar' }))

    expect((await dialogo.findAllByRole('alert')).length).toBeGreaterThan(0)
    expect(actualizarRecurso).not.toHaveBeenCalled()
  })

  it('un nombre en blanco no se guarda', async () => {
    renderPagina()
    await screen.findByText('Guía de huerta')
    await userEvent.click(boton(fila('Guía de huerta'), 'Editar'))

    const dialogo = within(await screen.findByRole('dialog'))
    await userEvent.clear(dialogo.getByLabelText('Nombre'))
    await userEvent.click(dialogo.getByRole('button', { name: 'Guardar' }))

    expect((await dialogo.findAllByRole('alert')).length).toBeGreaterThan(0)
    expect(actualizarRecurso).not.toHaveBeenCalled()
  })
})

describe('RecursosPage: reemplazo (criterio 4)', () => {
  async function elegirReemplazo(nombreRecurso: string, file: File) {
    const f = fila(nombreRecurso)
    await userEvent.click(boton(f, 'Reemplazar'))
    const raiz = screen.queryByRole('dialog') ?? screen.getByText(nombreRecurso).closest('li, tr')!
    const input = (raiz as HTMLElement).querySelector('input[type="file"]') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input).not.toHaveAttribute('multiple')
    await usuario().upload(input, file)
  }

  it('sube el archivo nuevo, actualiza ruta, tipo y tamaño, y borra el anterior (en ese orden)', async () => {
    const orden: string[] = []
    vi.mocked(subirArchivo).mockImplementation(async () => void orden.push('subir'))
    vi.mocked(actualizarRecurso).mockImplementation(async (id, c) => {
      orden.push('actualizar')
      return recurso(id, 1, c as Partial<Recurso>)
    })
    vi.mocked(borrarArchivo).mockImplementation(async () => void orden.push('borrar'))
    renderPagina()
    await screen.findByText('Guía de huerta')

    const file = archivo('nueva.docx', '')
    await elegirReemplazo('Guía de huerta', file)

    await waitFor(() => expect(borrarArchivo).toHaveBeenCalledTimes(1))
    expect(orden).toEqual(['subir', 'actualizar', 'borrar'])
    const rutaNueva = vi.mocked(subirArchivo).mock.calls[0][0]
    expect(rutaNueva).toMatch(/^5\/[0-9a-f-]{36}\.docx$/)
    expect(actualizarRecurso).toHaveBeenCalledWith(
      1,
      { ruta_archivo: rutaNueva, tipo: 'DOCX', tamanio_bytes: file.size },
      '5/viejo-1.pdf',
    )
    expect(borrarArchivo).toHaveBeenCalledWith('5/viejo-1.pdf')
  })

  it('rechaza un formato no admitido sin subir nada', async () => {
    renderPagina()
    await screen.findByText('Guía de huerta')

    await elegirReemplazo('Guía de huerta', archivo('malo.exe'))

    expect(await screen.findByRole('alert')).toHaveTextContent(/formato/i)
    expect(subirArchivo).not.toHaveBeenCalled()
    expect(actualizarRecurso).not.toHaveBeenCalled()
  })

  it('rechaza un archivo de más de 50 MiB sin subir nada', async () => {
    renderPagina()
    await screen.findByText('Guía de huerta')

    await elegirReemplazo('Guía de huerta', archivo('grande.pdf', 'application/pdf', 52428801))

    expect(await screen.findByRole('alert')).toHaveTextContent(/tamaño/i)
    expect(subirArchivo).not.toHaveBeenCalled()
  })
})

describe('RecursosPage: eliminación (criterio 5)', () => {
  it('pide confirmación y recién al confirmar borra la fila y después el archivo', async () => {
    const orden: string[] = []
    vi.mocked(eliminarFilaRecurso).mockImplementation(async () => {
      orden.push('fila')
      return guia.ruta_archivo
    })
    vi.mocked(borrarArchivo).mockImplementation(async () => void orden.push('archivo'))
    renderPagina()
    await screen.findByText('Guía de huerta')

    await userEvent.click(boton(fila('Guía de huerta'), 'Eliminar'))
    const dialogo = within(await screen.findByRole('dialog'))
    expect(eliminarFilaRecurso).not.toHaveBeenCalled()
    expect(borrarArchivo).not.toHaveBeenCalled()

    await userEvent.click(dialogo.getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => expect(borrarArchivo).toHaveBeenCalledTimes(1))
    expect(eliminarFilaRecurso).toHaveBeenCalledWith(1)
    expect(borrarArchivo).toHaveBeenCalledWith('5/viejo-1.pdf')
    expect(orden).toEqual(['fila', 'archivo'])
  })

  it('cancelar no elimina nada', async () => {
    renderPagina()
    await screen.findByText('Guía de huerta')

    await userEvent.click(boton(fila('Guía de huerta'), 'Eliminar'))
    const dialogo = within(await screen.findByRole('dialog'))
    await userEvent.click(dialogo.getByRole('button', { name: 'Cancelar' }))

    expect(eliminarFilaRecurso).not.toHaveBeenCalled()
    expect(borrarArchivo).not.toHaveBeenCalled()
  })

  it('eliminar un enlace borra solo la fila, sin tocar Storage', async () => {
    renderPagina()
    await screen.findByText('Video de la clase')

    await userEvent.click(boton(fila('Video de la clase'), 'Eliminar'))
    const dialogo = within(await screen.findByRole('dialog'))
    await userEvent.click(dialogo.getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => expect(eliminarFilaRecurso).toHaveBeenCalledWith(2))
    expect(borrarArchivo).not.toHaveBeenCalled()
  })

  it('si falla el borrado del archivo, la operación se da por exitosa (sin alert) y queda un console.warn', async () => {
    vi.mocked(borrarArchivo).mockRejectedValue(new Error('no se pudo borrar'))
    renderPagina()
    await screen.findByText('Guía de huerta')

    await userEvent.click(boton(fila('Guía de huerta'), 'Eliminar'))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => expect(warn).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('si falla el borrado de la fila, muestra un alert y no toca el archivo', async () => {
    vi.mocked(eliminarFilaRecurso).mockRejectedValue({ code: '42501' })
    renderPagina()
    await screen.findByText('Guía de huerta')

    await userEvent.click(boton(fila('Guía de huerta'), 'Eliminar'))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Eliminar' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(borrarArchivo).not.toHaveBeenCalled()
  })
})

describe('RecursosPage: orden (criterio 6)', () => {
  it('el primero no puede subir y el último no puede bajar', async () => {
    renderPagina()
    await screen.findByText('Guía de huerta')
    expect(boton(fila('Guía de huerta'), 'Subir')).toBeDisabled()
    expect(boton(fila('Guía de huerta'), 'Bajar')).toBeEnabled()
    expect(boton(fila('Planilla'), 'Bajar')).toBeDisabled()
    expect(boton(fila('Planilla'), 'Subir')).toBeEnabled()
  })

  it('"Subir" llama a ordenarRecursos con la lista completa de ids en el nuevo orden', async () => {
    renderPagina()
    await screen.findByText('Planilla')

    await userEvent.click(boton(fila('Planilla'), 'Subir'))

    await waitFor(() => expect(ordenarRecursos).toHaveBeenCalledTimes(1))
    expect(ordenarRecursos).toHaveBeenCalledWith(5, [1, 3, 2])
  })

  it('"Bajar" llama a ordenarRecursos con la lista completa de ids en el nuevo orden', async () => {
    renderPagina()
    await screen.findByText('Guía de huerta')

    await userEvent.click(boton(fila('Guía de huerta'), 'Bajar'))

    await waitFor(() => expect(ordenarRecursos).toHaveBeenCalledTimes(1))
    expect(ordenarRecursos).toHaveBeenCalledWith(5, [2, 1, 3])
  })

  it('si ordenar falla muestra un alert', async () => {
    vi.mocked(ordenarRecursos).mockRejectedValue({ code: 'P0001' })
    renderPagina()
    await screen.findByText('Planilla')

    await userEvent.click(boton(fila('Planilla'), 'Subir'))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})

describe('RecursosPage: Ver (criterio 8)', () => {
  it('"Ver" pide la URL firmada de la ruta del archivo y la abre en otra pestaña', async () => {
    vi.mocked(urlFirmada).mockResolvedValue('https://storage.example/firmada?token=abc')
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null)
    renderPagina()
    await screen.findByText('Guía de huerta')

    await userEvent.click(boton(fila('Guía de huerta'), 'Ver'))

    await waitFor(() => expect(abrir).toHaveBeenCalled())
    expect(urlFirmada).toHaveBeenCalledWith('5/viejo-1.pdf')
    expect(abrir.mock.calls[0][0]).toBe('https://storage.example/firmada?token=abc')
    abrir.mockRestore()
  })

  it('si no se puede firmar la URL muestra un alert y no abre nada', async () => {
    vi.mocked(urlFirmada).mockRejectedValue(new Error('rls'))
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null)
    renderPagina()
    await screen.findByText('Guía de huerta')

    await userEvent.click(boton(fila('Guía de huerta'), 'Ver'))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(abrir).not.toHaveBeenCalled()
    abrir.mockRestore()
  })
})

describe('RecursosPage: durante un lote de subida (crítica fase B 2 y revisión 3 y 4)', () => {
  it('mientras sube, Subir/Bajar y "Agregar enlace" están deshabilitados', async () => {
    let terminar: () => void = () => {}
    vi.mocked(subirArchivo).mockImplementation(() => new Promise<void>((resolver) => (terminar = resolver)))
    const { container } = renderPagina()
    await screen.findByText('Guía de huerta')
    expect(screen.getByRole('button', { name: 'Agregar enlace' })).toBeEnabled()

    await usuario().upload(inputDeAlta(container), archivo('uno.pdf', 'application/pdf'))
    await screen.findByRole('progressbar', { name: 'uno.pdf' })

    expect(boton(fila('Video de la clase'), 'Subir')).toBeDisabled()
    expect(boton(fila('Video de la clase'), 'Bajar')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Agregar enlace' })).toBeDisabled()

    terminar()
    await waitFor(() => expect(insertarRecurso).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Agregar enlace' })).toBeEnabled())
  })

  it('los archivos soltados durante un lote no se descartan en silencio: avisa que hay que esperar', async () => {
    let terminar: () => void = () => {}
    vi.mocked(subirArchivo).mockImplementation(() => new Promise<void>((resolver) => (terminar = resolver)))
    const { container } = renderPagina()
    await screen.findByText('Guía de huerta')

    await usuario().upload(inputDeAlta(container), archivo('uno.pdf', 'application/pdf'))
    await screen.findByRole('progressbar', { name: 'uno.pdf' })
    await usuario().upload(inputDeAlta(container), archivo('dos.pdf', 'application/pdf'))

    expect(await screen.findByRole('alert')).toHaveTextContent(/esper/i)
    expect(subirArchivo).toHaveBeenCalledTimes(1)

    terminar()
    await waitFor(() => expect(insertarRecurso).toHaveBeenCalledTimes(1))
  })

  it('un lote nuevo limpia los errores del anterior', async () => {
    vi.mocked(subirArchivo).mockRejectedValueOnce({ status: 400, statusCode: '413', message: 'too big' })
    const { container } = renderPagina()
    await screen.findByText('Guía de huerta')

    await usuario().upload(inputDeAlta(container), archivo('uno.pdf', 'application/pdf'))
    expect(await screen.findByRole('alert')).toHaveTextContent('uno.pdf')

    await usuario().upload(inputDeAlta(container), archivo('malo.exe'))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('malo.exe'))
    expect(screen.getByRole('alert')).not.toHaveTextContent('uno.pdf')
  })
})

describe('RecursosPage: ramas de error de las mutaciones (revisión 2)', () => {
  it('si falla el alta del enlace, el diálogo queda abierto con el mensaje y no se cierra', async () => {
    vi.mocked(insertarRecurso).mockRejectedValue({ code: '23514' })
    renderPagina()
    await screen.findByText('Guía de huerta')
    await userEvent.click(screen.getByRole('button', { name: 'Agregar enlace' }))
    const dialogo = within(await screen.findByRole('dialog'))

    await userEvent.type(dialogo.getByLabelText('Nombre'), 'Sitio')
    await userEvent.type(dialogo.getByLabelText('URL'), 'https://example.com')
    await userEvent.click(dialogo.getByRole('button', { name: 'Agregar' }))

    expect(await dialogo.findByRole('alert')).toHaveTextContent(/no pudimos/i)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('si falla la edición, el diálogo queda abierto con el mensaje', async () => {
    vi.mocked(actualizarRecurso).mockRejectedValue({ code: '42501' })
    renderPagina()
    await screen.findByText('Guía de huerta')
    await userEvent.click(boton(fila('Guía de huerta'), 'Editar'))
    const dialogo = within(await screen.findByRole('dialog'))

    await userEvent.type(dialogo.getByLabelText('Nombre'), ' nueva')
    await userEvent.click(dialogo.getByRole('button', { name: 'Guardar' }))

    expect(await dialogo.findByRole('alert')).toHaveTextContent(/no pudimos/i)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('si el bucket rechaza el reemplazo con 413, muestra el motivo de tamaño y no toca la fila', async () => {
    vi.mocked(subirArchivo).mockRejectedValue({ status: 400, statusCode: '413', message: 'too big' })
    renderPagina()
    await screen.findByText('Guía de huerta')
    await userEvent.click(boton(fila('Guía de huerta'), 'Reemplazar'))
    const input = screen.getByText('Guía de huerta').closest('li')!.querySelector('input[type="file"]') as HTMLInputElement

    await usuario().upload(input, archivo('nueva.pdf', 'application/pdf'))

    expect(await screen.findByRole('alert')).toHaveTextContent(/tamaño/i)
    expect(actualizarRecurso).not.toHaveBeenCalled()
    expect(borrarArchivo).not.toHaveBeenCalled()
  })
})

/*
 * Subida reanudable (#29), criterios 1, 2, 3, 6, 7, 9 y 10 en la pantalla. Se sigue mockeando solo `consultas`:
 * subirArchivo(ruta, file, mime, { onProgress(porcentaje entero), onReintento(), signal }) recibe las opciones de la secuencia real.
 *  - Cada archivo en curso o en espera es un <li> con <ProgresoSubida>: <progress> con el nombre del archivo, texto con los MiB y
 *    "Cancelar"; "En espera", "Sin conexión, reintentando…" y "Finalizando…" (sin "Cancelar") según el estado.
 *  - Un único role="status" siempre montado anuncia solo hitos: "Subiendo <archivo>", "<archivo> subido", "<archivo> cancelado",
 *    "Sin conexión, reintentando…" y "No se pudo subir <archivo>" (sin el motivo: ese va solo en el Alerta).
 *  - Al terminar o cancelar una fila: el foco va al input de alta (el "botón" del dropzone) o al "Reemplazar" de la fila.
 *  - Con una subida en curso `beforeunload` se cancela (preventDefault); sin subida, no.
 *  - En reemplazo, la barra lleva el nombre del archivo nuevo y vive en la fila del recurso; cancelar no es un error (sin alert).
 */
type OpcionesSubida = { onProgress?: (p: number) => void; onReintento?: () => void; signal?: AbortSignal }
type Subida = { opciones: OpcionesSubida; resolver: () => void; rechazar: (e: unknown) => void }

const MIB = 1024 * 1024

describe('RecursosPage: barra de progreso y cancelación (#29)', () => {
  let subidas: Subida[]

  beforeEach(() => {
    subidas = []
    vi.mocked(subirArchivo).mockImplementation(
      (_ruta, _file, _mime, opciones) =>
        new Promise<void>((resolver, rechazar) => {
          opciones?.signal?.addEventListener('abort', () => rechazar(new DOMException('Subida cancelada', 'AbortError')))
          subidas.push({ opciones: opciones ?? {}, resolver, rechazar })
        }),
    )
  })

  const filaDeSubida = (nombre: string) => {
    const li = screen.getByRole('progressbar', { name: nombre }).closest('li')
    if (!li) throw new Error(`No hay fila de subida para ${nombre}`)
    return within(li)
  }
  const cancelar = (f: ReturnType<typeof within>) => f.getByRole('button', { name: /^Cancelar/ })

  async function subirLote(nombres: string[], tamanio?: number) {
    const r = renderPagina()
    await screen.findByText('Guía de huerta')
    await usuario().upload(
      inputDeAlta(r.container),
      nombres.map((n) => archivo(n, 'application/pdf', tamanio)),
    )
    await waitFor(() => expect(subidas).toHaveLength(1))
    return r
  }

  async function elegirReemplazo(nombreRecurso: string, file: File) {
    await userEvent.click(boton(fila(nombreRecurso), 'Reemplazar'))
    const input = screen.getByText(nombreRecurso).closest('li')!.querySelector('input[type="file"]') as HTMLInputElement
    await usuario().upload(input, file)
    await waitFor(() => expect(subidas).toHaveLength(1))
  }

  describe('barra (criterio 1)', () => {
    it('cada archivo en curso muestra un <progress> con su nombre y el valor entero que informa la subida', async () => {
      await subirLote(['uno.pdf'])

      expect(screen.getByRole('progressbar', { name: 'uno.pdf' })).toHaveAttribute('value', '0')
      act(() => subidas[0].opciones.onProgress?.(40))

      expect(screen.getByRole('progressbar', { name: 'uno.pdf' })).toHaveAttribute('value', '40')
      expect(screen.getByRole('progressbar', { name: 'uno.pdf' })).toHaveAttribute('max', '100')
    })

    it('el texto muestra los MiB subidos, el total y el porcentaje', async () => {
      await subirLote(['uno.pdf'], 40 * MIB)

      act(() => subidas[0].opciones.onProgress?.(25))

      expect(
        filaDeSubida('uno.pdf').getByText(`${formatearTamanio(10 * MIB)} de ${formatearTamanio(40 * MIB)} (25 %)`),
      ).toBeInTheDocument()
    })

    it('al llegar a 100 % dice "Finalizando…" y desaparece "Cancelar"; al completar se inserta el recurso', async () => {
      await subirLote(['uno.pdf'])

      act(() => subidas[0].opciones.onProgress?.(100))

      expect(filaDeSubida('uno.pdf').getByText('Finalizando…')).toBeInTheDocument()
      expect(filaDeSubida('uno.pdf').queryByRole('button', { name: /^Cancelar/ })).not.toBeInTheDocument()

      await act(async () => subidas[0].resolver())
      await waitFor(() => expect(insertarRecurso).toHaveBeenCalledTimes(1))
    })
  })

  describe('lote (criterio 2)', () => {
    it('los pendientes dicen "En espera" y tienen su propia barra; al llegar su turno ya no esperan', async () => {
      await subirLote(['uno.pdf', 'dos.pdf', 'tres.pdf'])

      expect(filaDeSubida('dos.pdf').getByText('En espera')).toBeInTheDocument()
      expect(filaDeSubida('tres.pdf').getByText('En espera')).toBeInTheDocument()
      expect(screen.getByRole('progressbar', { name: 'dos.pdf' })).toHaveAttribute('value', '0')
      expect(filaDeSubida('uno.pdf').queryByText('En espera')).not.toBeInTheDocument()
      expect(subirArchivo).toHaveBeenCalledTimes(1)

      await act(async () => subidas[0].resolver())
      await waitFor(() => expect(subidas).toHaveLength(2))

      expect(filaDeSubida('dos.pdf').queryByText('En espera')).not.toBeInTheDocument()
      expect(filaDeSubida('tres.pdf').getByText('En espera')).toBeInTheDocument()
      await act(async () => subidas[1].resolver())
      await waitFor(() => expect(subidas).toHaveLength(3))
      await act(async () => subidas[2].resolver())
    })
  })

  describe('reintento (criterio 3)', () => {
    it('mientras reintenta la fila dice "Sin conexión, reintentando…" y vuelve a subir con el próximo progreso', async () => {
      await subirLote(['uno.pdf'])
      act(() => subidas[0].opciones.onProgress?.(30))

      act(() => subidas[0].opciones.onReintento?.())
      expect(filaDeSubida('uno.pdf').getByText('Sin conexión, reintentando…')).toBeInTheDocument()

      act(() => subidas[0].opciones.onProgress?.(35))
      expect(filaDeSubida('uno.pdf').queryByText('Sin conexión, reintentando…')).not.toBeInTheDocument()
      expect(screen.getByRole('progressbar', { name: 'uno.pdf' })).toHaveAttribute('value', '35')
    })
  })

  describe('cancelar (criterio 6)', () => {
    it('cancelar el que sube aborta su subida, no inserta fila, no muestra error y el resto sigue', async () => {
      await subirLote(['uno.pdf', 'dos.pdf'])

      await userEvent.click(cancelar(filaDeSubida('uno.pdf')))

      expect(subidas[0].opciones.signal?.aborted).toBe(true)
      await waitFor(() => expect(subidas).toHaveLength(2))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(insertarRecurso).not.toHaveBeenCalled()

      await act(async () => subidas[1].resolver())
      await waitFor(() => expect(insertarRecurso).toHaveBeenCalledTimes(1))
      expect(vi.mocked(insertarRecurso).mock.calls[0][0].nombre).toBe('dos')
    })

    it('cancelar uno que espera no lo sube nunca y los demás siguen', async () => {
      await subirLote(['uno.pdf', 'dos.pdf', 'tres.pdf'])

      await userEvent.click(cancelar(filaDeSubida('dos.pdf')))
      await act(async () => subidas[0].resolver())
      await waitFor(() => expect(subidas).toHaveLength(2))
      await act(async () => subidas[1].resolver())

      await waitFor(() => expect(insertarRecurso).toHaveBeenCalledTimes(2))
      expect(vi.mocked(insertarRecurso).mock.calls.map((c) => c[0].nombre)).toEqual(['uno', 'tres'])
      expect(subirArchivo).toHaveBeenCalledTimes(2)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('errores (criterios 4 y 5)', () => {
    it('un error de la subida queda en un único Alerta con el motivo y no inserta fila', async () => {
      vi.mocked(subirArchivo).mockReset()
      vi.mocked(subirArchivo).mockRejectedValue({ statusCode: '413', message: 'too big' })
      const { container } = renderPagina()
      await screen.findByText('Guía de huerta')

      await usuario().upload(inputDeAlta(container), archivo('uno.pdf', 'application/pdf'))

      expect(await screen.findByRole('alert')).toHaveTextContent('uno.pdf')
      expect(screen.getAllByRole('alert')).toHaveLength(1)
      expect(screen.getAllByText(/tamaño/i)).toHaveLength(1)
      expect(insertarRecurso).not.toHaveBeenCalled()
    })

    it('tras el error ya no queda barra de esa fila', async () => {
      vi.mocked(subirArchivo).mockReset()
      vi.mocked(subirArchivo).mockRejectedValue({ statusCode: '503', message: 'unavailable' })
      const { container } = renderPagina()
      await screen.findByText('Guía de huerta')

      await usuario().upload(inputDeAlta(container), archivo('uno.pdf', 'application/pdf'))

      await screen.findByRole('alert')
      expect(screen.queryByRole('progressbar', { name: 'uno.pdf' })).not.toBeInTheDocument()
    })
  })

  describe('anuncios (criterio 10)', () => {
    it('hay un único role="status" siempre montado, vacío antes de subir', async () => {
      renderPagina()
      await screen.findByText('Guía de huerta')

      expect(screen.getAllByRole('status')).toHaveLength(1)
      expect(screen.getByRole('status')).toBeEmptyDOMElement()
    })

    it('anuncia el inicio, el fin y la cancelación de cada archivo, sin repetir los porcentajes', async () => {
      await subirLote(['uno.pdf', 'dos.pdf'])
      const estado = screen.getByRole('status')
      expect(estado).toHaveTextContent(/subiendo/i)
      expect(estado).toHaveTextContent('uno.pdf')

      act(() => subidas[0].opciones.onProgress?.(10))
      const textoInicial = estado.textContent
      act(() => subidas[0].opciones.onProgress?.(20))
      act(() => subidas[0].opciones.onProgress?.(30))
      expect(estado.textContent).toBe(textoInicial)
      expect(estado.textContent).not.toMatch(/%/)

      await act(async () => subidas[0].resolver())
      await waitFor(() => expect(estado).toHaveTextContent(/uno\.pdf.*subido|subido.*uno\.pdf/i))
      await waitFor(() => expect(subidas).toHaveLength(2))
      await waitFor(() => expect(estado).toHaveTextContent('dos.pdf'))

      await userEvent.click(cancelar(filaDeSubida('dos.pdf')))
      await waitFor(() => expect(estado).toHaveTextContent(/dos\.pdf.*cancelad|cancelad.*dos\.pdf/i))
      expect(screen.getAllByRole('status')).toHaveLength(1)
    })

    it('en un lote [A, B, C] donde se cancela C mientras espera, al terminar A anuncia «A subido» (no «C cancelado»)', async () => {
      await subirLote(['a.pdf', 'b.pdf', 'c.pdf'])
      const estado = screen.getByRole('status')

      await userEvent.click(cancelar(filaDeSubida('c.pdf')))
      await waitFor(() => expect(estado).toHaveTextContent('c.pdf cancelado'))

      await act(async () => subidas[0].resolver())
      await waitFor(() => expect(subidas).toHaveLength(2))

      await waitFor(() => expect(estado).toHaveTextContent('a.pdf subido'))
      expect(estado).toHaveTextContent('Subiendo b.pdf')
      expect(estado).not.toHaveTextContent('c.pdf cancelado')

      await act(async () => subidas[1].resolver())
    })

    it('un reemplazo terminado y después un lote: al terminar X anuncia «X subido» y no queda pegado el del reemplazo', async () => {
      const { container } = renderPagina()
      await screen.findByText('Guía de huerta')
      await elegirReemplazo('Guía de huerta', archivo('nueva.docx'))
      const estado = screen.getByRole('status')

      await act(async () => subidas[0].resolver())
      await waitFor(() => expect(estado).toHaveTextContent('nueva.docx subido'))
      await waitFor(() => expect(boton(fila('Guía de huerta'), 'Reemplazar')).toBeEnabled())

      await usuario().upload(inputDeAlta(container), archivo('x.pdf', 'application/pdf'))
      await waitFor(() => expect(subidas).toHaveLength(2))
      expect(estado).not.toHaveTextContent('nueva.docx subido')

      await act(async () => subidas[1].resolver())

      await waitFor(() => expect(estado).toHaveTextContent('x.pdf subido'))
      expect(estado).not.toHaveTextContent('nueva.docx subido')
    })

    it('anuncia "reintentando" y el error de un archivo, y el motivo va solo en el Alerta', async () => {
      await subirLote(['uno.pdf'])
      act(() => subidas[0].opciones.onReintento?.())
      expect(screen.getByRole('status')).toHaveTextContent(/reintentando/i)

      await act(async () => subidas[0].rechazar({ statusCode: '413', message: 'too big' }))

      const alerta = await screen.findByRole('alert')
      expect(alerta).toHaveTextContent(/tamaño/i)
      expect(screen.getAllByRole('alert')).toHaveLength(1)
      expect(screen.getByRole('status')).toHaveTextContent('uno.pdf')
      expect(screen.getByRole('status')).toHaveTextContent(/error|no se pudo/i)
      expect(screen.getByRole('status')).not.toHaveTextContent(/tamaño/i)
      expect(screen.getAllByText(/tamaño/i)).toHaveLength(1)
    })

    it('la lista de subidas ya no es una región aria-live', async () => {
      await subirLote(['uno.pdf'])

      expect(screen.getByRole('progressbar', { name: 'uno.pdf' }).closest('[aria-live]')).toBeNull()
    })
  })

  describe('foco (criterio 10)', () => {
    it('al terminar una fila del alta el foco va al input del dropzone', async () => {
      const { container } = await subirLote(['uno.pdf'])
      act(() => cancelar(filaDeSubida('uno.pdf')).focus())
      expect(cancelar(filaDeSubida('uno.pdf'))).toHaveFocus()

      await act(async () => subidas[0].resolver())

      await waitFor(() => expect(inputDeAlta(container)).toHaveFocus())
    })

    it('al cancelar una fila del alta el foco va al input del dropzone', async () => {
      const { container } = await subirLote(['uno.pdf'])

      await userEvent.click(cancelar(filaDeSubida('uno.pdf')))

      await waitFor(() => expect(inputDeAlta(container)).toHaveFocus())
    })

    it('al terminar un reemplazo el foco va al "Reemplazar" de esa fila', async () => {
      renderPagina()
      await screen.findByText('Guía de huerta')
      await elegirReemplazo('Guía de huerta', archivo('nueva.docx'))
      act(() => boton(fila('Guía de huerta'), 'Cancelar').focus())

      await act(async () => subidas[0].resolver())

      await waitFor(() => expect(boton(fila('Guía de huerta'), 'Reemplazar')).toHaveFocus())
    })

    it('al cancelar un reemplazo el foco va al "Reemplazar" de esa fila', async () => {
      renderPagina()
      await screen.findByText('Guía de huerta')
      await elegirReemplazo('Guía de huerta', archivo('nueva.docx'))

      await userEvent.click(boton(fila('Guía de huerta'), 'Cancelar'))

      await waitFor(() => expect(boton(fila('Guía de huerta'), 'Reemplazar')).toHaveFocus())
    })
  })

  describe('cerrar o recargar (criterio 9)', () => {
    const intentarCerrar = () => {
      const evento = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(evento)
      return evento.defaultPrevented
    }

    it('sin subida en curso no pide confirmación', async () => {
      renderPagina()
      await screen.findByText('Guía de huerta')

      expect(intentarCerrar()).toBe(false)
    })

    it('con una subida en curso pide confirmación; al terminar deja de pedirla', async () => {
      await subirLote(['uno.pdf'])

      expect(intentarCerrar()).toBe(true)

      await act(async () => subidas[0].resolver())
      await waitFor(() => expect(insertarRecurso).toHaveBeenCalled())
      await waitFor(() => expect(intentarCerrar()).toBe(false))
    })

    it('al cancelar la única subida deja de pedir confirmación', async () => {
      await subirLote(['uno.pdf'])

      await userEvent.click(cancelar(filaDeSubida('uno.pdf')))

      await waitFor(() => expect(intentarCerrar()).toBe(false))
    })

    it('al desmontar la página aborta la subida en curso y suelta beforeunload', async () => {
      const { unmount } = await subirLote(['uno.pdf'])

      unmount()

      expect(subidas[0].opciones.signal?.aborted).toBe(true)
      expect(intentarCerrar()).toBe(false)
    })
  })

  describe('reemplazo (criterio 7)', () => {
    it('muestra la misma barra, con el nombre del archivo nuevo, en la fila del recurso', async () => {
      renderPagina()
      await screen.findByText('Guía de huerta')

      await elegirReemplazo('Guía de huerta', archivo('nueva.docx'))
      act(() => subidas[0].opciones.onProgress?.(50))

      const barra = fila('Guía de huerta').getByRole('progressbar', { name: 'nueva.docx' })
      expect(barra).toHaveAttribute('value', '50')
      expect(boton(fila('Guía de huerta'), 'Cancelar')).toBeInTheDocument()
    })

    it('"Sin conexión, reintentando…" y "Finalizando…" también valen para el reemplazo', async () => {
      renderPagina()
      await screen.findByText('Guía de huerta')
      await elegirReemplazo('Guía de huerta', archivo('nueva.docx'))

      act(() => subidas[0].opciones.onReintento?.())
      expect(fila('Guía de huerta').getByText('Sin conexión, reintentando…')).toBeInTheDocument()

      act(() => subidas[0].opciones.onProgress?.(100))
      expect(fila('Guía de huerta').getByText('Finalizando…')).toBeInTheDocument()
      expect(fila('Guía de huerta').queryByRole('button', { name: /^Cancelar/ })).not.toBeInTheDocument()
    })

    it('cancelar deja la fila con su archivo anterior: no actualiza la fila, no borra nada y no muestra error', async () => {
      renderPagina()
      await screen.findByText('Guía de huerta')
      await elegirReemplazo('Guía de huerta', archivo('nueva.docx'))

      await userEvent.click(boton(fila('Guía de huerta'), 'Cancelar'))

      await waitFor(() => expect(subidas[0].opciones.signal?.aborted).toBe(true))
      await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument())
      expect(actualizarRecurso).not.toHaveBeenCalled()
      expect(borrarArchivo).not.toHaveBeenCalled()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(fila('Guía de huerta').getByText('1,5 MB')).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent(/cancelad/i)
    })

    it('al completarse sigue el orden sube, actualiza y borra el viejo', async () => {
      renderPagina()
      await screen.findByText('Guía de huerta')
      await elegirReemplazo('Guía de huerta', archivo('nueva.docx'))

      await act(async () => subidas[0].resolver())

      await waitFor(() => expect(borrarArchivo).toHaveBeenCalledWith('5/viejo-1.pdf'))
      expect(actualizarRecurso).toHaveBeenCalledTimes(1)
    })
  })
})
