import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { obtenerEtiquetas } from '@/features/etiquetas/consultas'
import {
  borrarArchivo,
  guardarNormativa,
  obtenerNormativas,
  subirArchivo,
} from '@/features/normativas/consultas'
import type { Normativa } from '@/features/normativas/types'
import { renderConProviders } from '@/test/utils'
import { NormativaFormPage } from './NormativaFormPage'

/*
 * Criterios 1, 2, 3 y 9 en la pantalla. Se mockean solo los módulos `consultas` (normativas y etiquetas; contrato: ver
 * secuencias.test.ts y useEtiquetas.test.ts); hooks, secuencias, archivos, errores y zod son los reales.
 * No se monta AuthProvider: la pantalla ya no usa useAuth (se fue el campo "responsable").
 * Ruta: /admin/normativas/nueva (alta) y /admin/normativas/nueva?editar=<id> (edición, id numérico). Al guardar vuelve a /admin/normativas.
 * Textos y roles asumidos:
 *  - heading "Nueva Normativa" / "Editar normativa"; campos con label "Título", "Descripción", "Número" y "Año";
 *    etiquetas con el TagInput (placeholder "Escribí una palabra clave y presioná Enter", Enter agrega);
 *    el archivo es un input[type=file] (FileDropzone); botones "Guardar" (alta y edición, nunca "Publicar") y "Cancelar".
 *  - validación con zod: título 1-200, número 1-50, año entero 1900-2100 (input de texto, se convierte a número), PDF requerido
 *    en el alta y opcional en la edición, validado con validarPdf (extensión y 20 MiB). Los errores salen con role="alert" y el
 *    campo inválido con aria-invalid="true"; nada se sube ni se guarda mientras haya errores.
 *  - descripción: no obligatoria.
 *  - edición: precarga los campos desde la base; muestra el archivo actual como enlace (role link, nombre /archivo actual/i) a
 *    normativa.url; un id inválido (no numérico) o inexistente en ?editar= muestra "no encontrada" en lugar del formulario.
 *  - error al guardar: 23505 -> alert con el mensaje de número+año duplicado; otro -> alert genérico. Sigue en el formulario.
 *  - NO hay campo "responsable" / "encargado".
 */
vi.mock('@/features/normativas/consultas', () => ({
  subirArchivo: vi.fn(),
  borrarArchivo: vi.fn(),
  guardarNormativa: vi.fn(),
  eliminarFilaNormativa: vi.fn(),
  obtenerNormativas: vi.fn(),
  contarDescargaNormativa: vi.fn(),
}))
vi.mock('@/features/etiquetas/consultas', () => ({ obtenerEtiquetas: vi.fn() }))

const REGEX_RUTA = /^[0-9a-f-]{36}\.pdf$/
const RUTA_VIEJA = '11111111-1111-1111-1111-111111111111.pdf'
const PLACEHOLDER_ETIQUETAS = 'Escribí una palabra clave y presioná Enter'

const existente: Normativa = {
  id: 5,
  titulo: 'Régimen académico',
  descripcion: 'Texto ordenado',
  numero: '1234/24',
  anio: 2024,
  ruta_archivo: RUTA_VIEJA,
  descargas: 12,
  created_at: '2026-10-10T00:00:00Z',
  updated_at: '2026-10-10T00:00:00Z',
  etiqueta: [{ id: 1, nombre: 'evaluación' }],
  url: `https://ejemplo.test/normativas/${RUTA_VIEJA}`,
}

function renderPagina(ruta: string) {
  return renderConProviders(
    <Routes>
      <Route path="/admin/normativas/nueva" element={<NormativaFormPage />} />
      <Route path="/admin/normativas" element={<p>Lista de normativas</p>} />
    </Routes>,
    { ruta },
  )
}

const usuario = () => userEvent.setup({ applyAccept: false })
const inputArchivo = (c: HTMLElement) => c.querySelector('input[type="file"]') as HTMLInputElement
const titulo = () => screen.getByLabelText('Título')
const numero = () => screen.getByLabelText('Número')
const anio = () => screen.getByLabelText('Año')
const guardar = () => screen.getByRole('button', { name: 'Guardar' })

function pdf(nombre = 'resolucion.pdf', tamanio?: number, tipo = 'application/pdf') {
  const file = new File(['%PDF'], nombre, { type: tipo })
  if (tamanio !== undefined) Object.defineProperty(file, 'size', { value: tamanio })
  return file
}

async function completarMinimo(container: HTMLElement, file: File | null = pdf()) {
  await userEvent.type(titulo(), 'Régimen académico')
  await userEvent.type(numero(), '1234/24')
  await userEvent.type(anio(), '2024')
  if (file) await usuario().upload(inputArchivo(container), file)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(obtenerNormativas).mockResolvedValue([existente])
  vi.mocked(obtenerEtiquetas).mockResolvedValue([
    { id: 1, nombre: 'evaluación' },
    { id: 2, nombre: 'ciberseguridad' },
  ])
  vi.mocked(subirArchivo).mockResolvedValue(undefined)
  vi.mocked(borrarArchivo).mockResolvedValue(undefined)
  vi.mocked(guardarNormativa).mockResolvedValue({ id: 30, ruta_anterior: null })
})

describe('NormativaFormPage: alta (criterio 1)', () => {
  it('muestra el formulario con el botón "Guardar" y sin campo de responsable', async () => {
    renderPagina('/admin/normativas/nueva')
    expect(await screen.findByRole('heading', { name: 'Nueva Normativa' })).toBeInTheDocument()
    expect(guardar()).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Publicar' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/responsable|encargado/i)).not.toBeInTheDocument()
  })

  it('sube el PDF y guarda título, número, año (como número), descripción y etiquetas; luego vuelve a la lista', async () => {
    const { container } = renderPagina('/admin/normativas/nueva')
    await screen.findByRole('heading', { name: 'Nueva Normativa' })
    const file = pdf()
    await completarMinimo(container, file)
    await userEvent.type(screen.getByLabelText('Descripción'), 'Texto ordenado')
    await userEvent.type(screen.getByPlaceholderText(PLACEHOLDER_ETIQUETAS), 'evaluación{Enter}primaria{Enter}')
    await userEvent.click(guardar())

    await waitFor(() => expect(guardarNormativa).toHaveBeenCalledTimes(1))
    expect(subirArchivo).toHaveBeenCalledTimes(1)
    expect(vi.mocked(subirArchivo).mock.calls[0][1]).toBe(file)
    const args = vi.mocked(guardarNormativa).mock.calls[0][0]
    expect(args).toMatchObject({
      p_titulo: 'Régimen académico',
      p_descripcion: 'Texto ordenado',
      p_numero: '1234/24',
      p_anio: 2024,
      p_etiquetas: ['evaluación', 'primaria'],
    })
    expect(args.p_ruta_archivo).toMatch(REGEX_RUTA)
    expect(args.p_ruta_archivo).toBe(vi.mocked(subirArchivo).mock.calls[0][0])
    expect(args.p_id).toBeUndefined()
    expect(await screen.findByText('Lista de normativas')).toBeInTheDocument()
  })

  it('sugiere etiquetas de la tabla etiqueta, compartidas con los talleres (criterio 9)', async () => {
    renderPagina('/admin/normativas/nueva')
    await screen.findByRole('heading', { name: 'Nueva Normativa' })
    await waitFor(() => expect(obtenerEtiquetas).toHaveBeenCalled())
    await userEvent.type(screen.getByPlaceholderText(PLACEHOLDER_ETIQUETAS), 'cib')
    expect(await screen.findByRole('button', { name: 'ciberseguridad' })).toBeInTheDocument()
  })

  it('si el número y año ya existen (23505) muestra el mensaje, compensa el archivo subido y sigue en el formulario', async () => {
    vi.mocked(guardarNormativa).mockRejectedValue({ code: '23505', message: 'duplicate key' })
    const { container } = renderPagina('/admin/normativas/nueva')
    await screen.findByRole('heading', { name: 'Nueva Normativa' })
    await completarMinimo(container)
    await userEvent.click(guardar())

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(/número/i)
    expect(alerta).toHaveTextContent(/año/i)
    await waitFor(() => expect(borrarArchivo).toHaveBeenCalledTimes(1))
    expect(vi.mocked(borrarArchivo).mock.calls[0][0]).toBe(vi.mocked(subirArchivo).mock.calls[0][0])
    expect(screen.queryByText('Lista de normativas')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Nueva Normativa' })).toBeInTheDocument()
  })

  it('ante otro error de guardado muestra un mensaje genérico', async () => {
    vi.mocked(guardarNormativa).mockRejectedValue({ code: '42501', message: 'rls' })
    const { container } = renderPagina('/admin/normativas/nueva')
    await screen.findByRole('heading', { name: 'Nueva Normativa' })
    await completarMinimo(container)
    await userEvent.click(guardar())

    const alerta = await screen.findByRole('alert')
    expect(alerta).not.toHaveTextContent(/número y año/i)
    expect(screen.queryByText('Lista de normativas')).not.toBeInTheDocument()
  })
})

describe('NormativaFormPage: validación (criterio 2)', () => {
  it('sin título muestra un error en el campo y no sube ni guarda', async () => {
    const { container } = renderPagina('/admin/normativas/nueva')
    await screen.findByRole('heading', { name: 'Nueva Normativa' })
    await userEvent.type(numero(), '1234/24')
    await userEvent.type(anio(), '2024')
    await usuario().upload(inputArchivo(container), pdf())
    await userEvent.click(guardar())

    await waitFor(() => expect(titulo()).toHaveAttribute('aria-invalid', 'true'))
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0)
    expect(subirArchivo).not.toHaveBeenCalled()
    expect(guardarNormativa).not.toHaveBeenCalled()
  })

  it('el título admite hasta 200 caracteres: 201 se rechaza', async () => {
    const { container } = renderPagina('/admin/normativas/nueva')
    await screen.findByRole('heading', { name: 'Nueva Normativa' })
    await completarMinimo(container)
    fireEvent.change(titulo(), { target: { value: 'a'.repeat(201) } })
    await userEvent.click(guardar())

    await waitFor(() => expect(titulo()).toHaveAttribute('aria-invalid', 'true'))
    expect(guardarNormativa).not.toHaveBeenCalled()
  })

  it('el título de exactamente 200 caracteres se acepta', async () => {
    const { container } = renderPagina('/admin/normativas/nueva')
    await screen.findByRole('heading', { name: 'Nueva Normativa' })
    await completarMinimo(container)
    fireEvent.change(titulo(), { target: { value: 'a'.repeat(200) } })
    await userEvent.click(guardar())

    await waitFor(() => expect(guardarNormativa).toHaveBeenCalledTimes(1))
    expect(vi.mocked(guardarNormativa).mock.calls[0][0].p_titulo).toBe('a'.repeat(200))
  })

  it('el número es obligatorio y admite hasta 50 caracteres: 51 se rechaza', async () => {
    const { container } = renderPagina('/admin/normativas/nueva')
    await screen.findByRole('heading', { name: 'Nueva Normativa' })
    await completarMinimo(container)
    fireEvent.change(numero(), { target: { value: '' } })
    await userEvent.click(guardar())
    await waitFor(() => expect(numero()).toHaveAttribute('aria-invalid', 'true'))

    fireEvent.change(numero(), { target: { value: '9'.repeat(51) } })
    await userEvent.click(guardar())
    await waitFor(() => expect(numero()).toHaveAttribute('aria-invalid', 'true'))
    expect(guardarNormativa).not.toHaveBeenCalled()
  })

  it('el número de exactamente 50 caracteres se acepta', async () => {
    const { container } = renderPagina('/admin/normativas/nueva')
    await screen.findByRole('heading', { name: 'Nueva Normativa' })
    await completarMinimo(container)
    fireEvent.change(numero(), { target: { value: '9'.repeat(50) } })
    await userEvent.click(guardar())
    await waitFor(() => expect(guardarNormativa).toHaveBeenCalledTimes(1))
  })

  it.each(['1899', '2101', 'abcd', '20.5', ''])('el año "%s" se rechaza', async (valor) => {
    const { container } = renderPagina('/admin/normativas/nueva')
    await screen.findByRole('heading', { name: 'Nueva Normativa' })
    await completarMinimo(container)
    fireEvent.change(anio(), { target: { value: valor } })
    await userEvent.click(guardar())

    await waitFor(() => expect(anio()).toHaveAttribute('aria-invalid', 'true'))
    expect(guardarNormativa).not.toHaveBeenCalled()
  })

  it.each(['1900', '2100'])('el año límite %s se acepta', async (valor) => {
    const { container } = renderPagina('/admin/normativas/nueva')
    await screen.findByRole('heading', { name: 'Nueva Normativa' })
    await completarMinimo(container)
    fireEvent.change(anio(), { target: { value: valor } })
    await userEvent.click(guardar())

    await waitFor(() => expect(guardarNormativa).toHaveBeenCalledTimes(1))
    expect(vi.mocked(guardarNormativa).mock.calls[0][0].p_anio).toBe(Number(valor))
  })

  it('en el alta el PDF es obligatorio: sin archivo no se guarda y se avisa', async () => {
    const { container } = renderPagina('/admin/normativas/nueva')
    await screen.findByRole('heading', { name: 'Nueva Normativa' })
    await completarMinimo(container, null)
    await userEvent.click(guardar())

    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0)
    expect(subirArchivo).not.toHaveBeenCalled()
    expect(guardarNormativa).not.toHaveBeenCalled()
  })

  it('un archivo que no es PDF se rechaza con el motivo y no se sube', async () => {
    const { container } = renderPagina('/admin/normativas/nueva')
    await screen.findByRole('heading', { name: 'Nueva Normativa' })
    await completarMinimo(container, pdf('instalador.exe', 100, 'application/x-msdownload'))
    await userEvent.click(guardar())

    expect(await screen.findByRole('alert')).toHaveTextContent(/PDF/)
    expect(subirArchivo).not.toHaveBeenCalled()
    expect(guardarNormativa).not.toHaveBeenCalled()
  })

  it('un PDF de más de 20 MiB se rechaza con el motivo y no se sube', async () => {
    const { container } = renderPagina('/admin/normativas/nueva')
    await screen.findByRole('heading', { name: 'Nueva Normativa' })
    await completarMinimo(container, pdf('grande.pdf', 20_971_521))
    await userEvent.click(guardar())

    expect(await screen.findByRole('alert')).toHaveTextContent(/20 MB/)
    expect(subirArchivo).not.toHaveBeenCalled()
    expect(guardarNormativa).not.toHaveBeenCalled()
  })

  it('si el bucket rechaza igual el archivo (415), muestra el mismo motivo de formato', async () => {
    vi.mocked(subirArchivo).mockRejectedValue({ status: 400, statusCode: '415', code: 'InvalidMimeType' })
    const { container } = renderPagina('/admin/normativas/nueva')
    await screen.findByRole('heading', { name: 'Nueva Normativa' })
    await completarMinimo(container)
    await userEvent.click(guardar())

    expect(await screen.findByRole('alert')).toHaveTextContent(/PDF/)
    expect(guardarNormativa).not.toHaveBeenCalled()
  })
})

describe('NormativaFormPage: accesibilidad del campo Archivo', () => {
  it('la etiqueta "Archivo" está asociada al input de archivo', async () => {
    const { container } = renderPagina('/admin/normativas/nueva')
    await screen.findByRole('heading', { name: 'Nueva Normativa' })
    expect(screen.getByLabelText('Archivo')).toBe(inputArchivo(container))
  })

  it('con un archivo inválido el input queda aria-invalid y apunta al error con aria-describedby', async () => {
    const { container } = renderPagina('/admin/normativas/nueva')
    await screen.findByRole('heading', { name: 'Nueva Normativa' })
    expect(inputArchivo(container)).not.toHaveAttribute('aria-invalid')
    await completarMinimo(container, pdf('instalador.exe', 100, 'application/x-msdownload'))
    await userEvent.click(guardar())

    const alerta = await screen.findByRole('alert')
    await waitFor(() => expect(inputArchivo(container)).toHaveAttribute('aria-invalid', 'true'))
    const describedby = inputArchivo(container).getAttribute('aria-describedby')
    expect(describedby).toBeTruthy()
    expect(alerta.id).toBe(describedby)
  })
})

describe('NormativaFormPage: edición (criterio 3)', () => {
  it('precarga los campos de la normativa, muestra el archivo actual y no pide elegir otro', async () => {
    renderPagina('/admin/normativas/nueva?editar=5')
    expect(await screen.findByRole('heading', { name: 'Editar normativa' })).toBeInTheDocument()
    await waitFor(() => expect(titulo()).toHaveValue('Régimen académico'))
    expect(numero()).toHaveValue('1234/24')
    expect(anio()).toHaveValue('2024')
    expect(screen.getByLabelText('Descripción')).toHaveValue('Texto ordenado')
    expect(screen.getByText('evaluación')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /archivo actual/i })).toHaveAttribute('href', existente.url)
  })

  it('sin elegir archivo no sube nada y manda p_ruta_archivo null con el id: la base conserva su archivo', async () => {
    renderPagina('/admin/normativas/nueva?editar=5')
    await waitFor(() => expect(titulo()).toHaveValue('Régimen académico'))
    fireEvent.change(titulo(), { target: { value: 'Régimen académico actualizado' } })
    await userEvent.click(guardar())

    await waitFor(() => expect(guardarNormativa).toHaveBeenCalledTimes(1))
    expect(subirArchivo).not.toHaveBeenCalled()
    expect(borrarArchivo).not.toHaveBeenCalled()
    expect(vi.mocked(guardarNormativa).mock.calls[0][0]).toMatchObject({
      p_id: 5,
      p_titulo: 'Régimen académico actualizado',
      p_numero: '1234/24',
      p_anio: 2024,
      p_etiquetas: ['evaluación'],
      p_ruta_archivo: null,
    })
    expect(await screen.findByText('Lista de normativas')).toBeInTheDocument()
  })

  it('eligiendo un archivo nuevo lo sube, actualiza la fila y borra la ruta anterior que devuelve la RPC', async () => {
    vi.mocked(guardarNormativa).mockResolvedValue({ id: 5, ruta_anterior: RUTA_VIEJA })
    const { container } = renderPagina('/admin/normativas/nueva?editar=5')
    await waitFor(() => expect(titulo()).toHaveValue('Régimen académico'))
    await usuario().upload(inputArchivo(container), pdf('nueva.pdf'))
    await userEvent.click(guardar())

    await waitFor(() => expect(borrarArchivo).toHaveBeenCalledTimes(1))
    const rutaNueva = vi.mocked(subirArchivo).mock.calls[0][0]
    expect(rutaNueva).toMatch(REGEX_RUTA)
    expect(vi.mocked(guardarNormativa).mock.calls[0][0]).toMatchObject({ p_id: 5, p_ruta_archivo: rutaNueva })
    expect(vi.mocked(borrarArchivo).mock.calls[0][0]).toBe(RUTA_VIEJA)
  })

  it('si falla la carga de la normativa muestra el error con "Reintentar" y no el formulario (no se guarda vacío sobre datos reales)', async () => {
    vi.mocked(obtenerNormativas).mockRejectedValue(new Error('sin red'))
    renderPagina('/admin/normativas/nueva?editar=5')
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()

    vi.mocked(obtenerNormativas).mockResolvedValue([existente])
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(titulo()).toHaveValue('Régimen académico'))
  })

  it('un id inválido en ?editar= muestra "no encontrada" y no el formulario', async () => {
    renderPagina('/admin/normativas/nueva?editar=abc')
    expect(await screen.findByText(/no encontrad/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument()
  })

  it('un id inexistente en ?editar= muestra "no encontrada"', async () => {
    renderPagina('/admin/normativas/nueva?editar=999')
    expect(await screen.findByText(/no encontrad/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument()
  })
})
