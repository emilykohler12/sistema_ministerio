import { screen, waitFor, within } from '@testing-library/react'
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
  vi.mocked(eliminarFilaRecurso).mockResolvedValue(undefined)
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

    expect(await screen.findByText(/subiendo/i)).toBeInTheDocument()
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
    expect(actualizarRecurso).toHaveBeenCalledWith(1, {
      ruta_archivo: rutaNueva,
      tipo: 'DOCX',
      tamanio_bytes: file.size,
    })
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
    vi.mocked(eliminarFilaRecurso).mockImplementation(async () => void orden.push('fila'))
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
    await screen.findByText(/subiendo/i)

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
    await screen.findByText(/subiendo/i)
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
