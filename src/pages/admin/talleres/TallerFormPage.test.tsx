import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useParams } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { guardarTaller, obtenerCategorias, obtenerTalleres } from '@/features/talleres/consultas'
import type { Categoria, Taller } from '@/features/talleres/types'
import { renderConProviders } from '@/test/utils'
import { TallerFormPage } from './TallerFormPage'

/*
 * Contrato de consultas: ver useTalleres.test.ts. Se mockea solo `consultas`; `errores.ts` es el real.
 * Textos asumidos: heading "Nuevo Taller" / "Editar taller"; etiquetas "Nombre", "Descripción" y "Estado"
 * (select con valores BORRADOR / PUBLICADO / INACTIVO); destinatarios como botones (aria-pressed) con el
 * nombre de cada destinatario; etiquetas con el TagInput (Enter agrega); botones "Crear taller" (alta) y
 * "Guardar cambios" (edición). Los errores salen en elementos con role="alert". Al guardar se vuelve a
 * /admin/talleres/:nivelId/:categoriaId.
 */
vi.mock('@/features/talleres/consultas', () => ({
  obtenerCategorias: vi.fn(),
  crearCategoria: vi.fn(),
  actualizarCategoria: vi.fn(),
  obtenerTalleres: vi.fn(),
  guardarTaller: vi.fn(),
  cambiarEstadoTaller: vi.fn(),
}))

const DA002 = 'La categoría está dada de baja: reactivala primero'
const PLACEHOLDER_ETIQUETAS = 'Ej: lectura, evaluación'

const ciencia: Categoria = {
  id: 7,
  nivel_id: 3,
  nombre: 'Ciencia',
  descripcion: '',
  activo: true,
  created_at: '2026-10-10T00:00:00Z',
  updated_at: '2026-10-10T00:00:00Z',
}

const existente: Taller = {
  id: 5,
  categoria_id: 7,
  nombre: 'Huerta escolar',
  descripcion: 'Cultivo en el patio',
  estado: 'PUBLICADO',
  created_at: '2026-10-10T00:00:00Z',
  updated_at: '2026-10-10T00:00:00Z',
  categoria: { nivel_id: 3 },
  destinatario: [{ id: 4, nombre: 'Docentes' }],
  etiqueta: [{ id: 1, nombre: 'ambiente' }],
  recurso: [],
}

function PantallaRecursos() {
  const { nivelId, categoriaId, tallerId } = useParams()
  return <p>{`Recursos del taller ${tallerId} (nivel ${nivelId}, categoría ${categoriaId})`}</p>
}

function renderPagina(ruta: string) {
  return renderConProviders(
    <Routes>
      <Route path="/admin/talleres/:nivelId/:categoriaId/:tallerId/recursos" element={<PantallaRecursos />} />
      <Route path="/admin/talleres/:nivelId/:categoriaId/nuevo" element={<TallerFormPage />} />
      <Route path="/admin/talleres/:nivelId/:categoriaId/:tallerId/editar" element={<TallerFormPage />} />
      <Route path="/admin/talleres/:nivelId/:categoriaId" element={<p>Lista de talleres</p>} />
    </Routes>,
    { ruta },
  )
}

const nombre = () => screen.getByLabelText('Nombre')
const descripcion = () => screen.getByLabelText('Descripción')
const destinatario = (n: string) => screen.getByRole('button', { name: n })

async function completarMinimo() {
  await userEvent.type(nombre(), 'Cuidados en redes')
  await userEvent.type(descripcion(), 'Convivencia digital')
  await userEvent.click(destinatario('Directivos'))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(obtenerCategorias).mockResolvedValue([ciencia])
  vi.mocked(obtenerTalleres).mockResolvedValue([existente])
})

describe('TallerFormPage: rutas y carga', () => {
  it('con la categoría de la URL muestra el formulario', async () => {
    renderPagina('/admin/talleres/3/7/nuevo')
    expect(await screen.findByRole('heading', { name: 'Nuevo Taller' })).toBeInTheDocument()
  })

  it('con un :categoriaId inválido muestra "no encontrado"', () => {
    renderPagina('/admin/talleres/3/abc/nuevo')
    expect(screen.getByText(/no encontrad/i)).toBeInTheDocument()
  })

  it('con una categoría de otro nivel muestra "no encontrado", no el formulario', async () => {
    renderPagina('/admin/talleres/1/7/nuevo')
    expect(await screen.findByText(/no encontrad/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Nuevo Taller' })).not.toBeInTheDocument()
  })

  it('si la carga de la categoría falla muestra un alert con "Reintentar"', async () => {
    vi.mocked(obtenerCategorias).mockRejectedValueOnce(new Error('sin red'))
    renderPagina('/admin/talleres/3/7/nuevo')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Nuevo Taller' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('heading', { name: 'Nuevo Taller' })).toBeInTheDocument()
  })

  it('ya no hay campos de fecha, responsable ni archivos', async () => {
    renderPagina('/admin/talleres/3/7/nuevo')
    await screen.findByRole('heading', { name: 'Nuevo Taller' })
    expect(screen.queryByLabelText(/fecha/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/responsable|encargado/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/arrastr|archivo/i)).not.toBeInTheDocument()
  })

  it('el estado es un select con Borrador por defecto', async () => {
    renderPagina('/admin/talleres/3/7/nuevo')
    await screen.findByRole('heading', { name: 'Nuevo Taller' })
    const estado = screen.getByLabelText('Estado')
    expect(estado).toHaveValue('BORRADOR')
    expect(Array.from(estado.querySelectorAll('option')).map((o) => o.value)).toEqual([
      'BORRADOR',
      'PUBLICADO',
      'INACTIVO',
    ])
  })

  it('ofrece los 5 destinatarios', async () => {
    renderPagina('/admin/talleres/3/7/nuevo')
    await screen.findByRole('heading', { name: 'Nuevo Taller' })
    for (const n of ['Directivos', 'Familias', 'Estudiantes', 'Docentes', 'Comunidad educativa']) {
      expect(destinatario(n)).toBeInTheDocument()
    }
  })
})

describe('TallerFormPage: alta', () => {
  it('llama a guardarTaller con los args de la RPC (sin p_id), el nombre recortado, y navega a los recursos del taller creado', async () => {
    vi.mocked(guardarTaller).mockResolvedValue(9)
    renderPagina('/admin/talleres/3/7/nuevo')
    await screen.findByRole('heading', { name: 'Nuevo Taller' })

    await userEvent.type(nombre(), '  Cuidados en redes  ')
    await userEvent.type(descripcion(), 'Convivencia digital')
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'PUBLICADO')
    await userEvent.click(destinatario('Directivos'))
    await userEvent.click(destinatario('Docentes'))
    await userEvent.type(screen.getByPlaceholderText(PLACEHOLDER_ETIQUETAS), 'redes{Enter}')
    await userEvent.click(screen.getByRole('button', { name: 'Crear taller' }))

    await waitFor(() => expect(guardarTaller).toHaveBeenCalledTimes(1))
    const datos = vi.mocked(guardarTaller).mock.calls[0][0]
    expect(datos).toEqual({
      p_categoria_id: 7,
      p_nombre: 'Cuidados en redes',
      p_descripcion: 'Convivencia digital',
      p_estado: 'PUBLICADO',
      p_destinatarios: [1, 4],
      p_etiquetas: ['redes'],
    })
    expect(datos).not.toHaveProperty('p_id')
    // El id que devuelve guardarTaller (9) es el del taller cuya pantalla de recursos se abre (criterio 10).
    expect(await screen.findByText('Recursos del taller 9 (nivel 3, categoría 7)')).toBeInTheDocument()
    expect(screen.queryByText('Lista de talleres')).not.toBeInTheDocument()
  })

  it('por defecto guarda como BORRADOR y sin etiquetas', async () => {
    vi.mocked(guardarTaller).mockResolvedValue(9)
    renderPagina('/admin/talleres/3/7/nuevo')
    await screen.findByRole('heading', { name: 'Nuevo Taller' })
    await completarMinimo()
    await userEvent.click(screen.getByRole('button', { name: 'Crear taller' }))

    await waitFor(() => expect(guardarTaller).toHaveBeenCalledTimes(1))
    expect(vi.mocked(guardarTaller).mock.calls[0][0]).toMatchObject({ p_estado: 'BORRADOR', p_etiquetas: [] })
  })

  it('sin nombre muestra un error de validación y no guarda', async () => {
    renderPagina('/admin/talleres/3/7/nuevo')
    await screen.findByRole('heading', { name: 'Nuevo Taller' })
    await userEvent.type(descripcion(), 'Algo')
    await userEvent.click(destinatario('Directivos'))
    await userEvent.click(screen.getByRole('button', { name: 'Crear taller' }))

    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0)
    expect(guardarTaller).not.toHaveBeenCalled()
  })

  it('con el nombre en blanco (solo espacios) no guarda', async () => {
    renderPagina('/admin/talleres/3/7/nuevo')
    await screen.findByRole('heading', { name: 'Nuevo Taller' })
    await userEvent.type(nombre(), '   ')
    await userEvent.type(descripcion(), 'Algo')
    await userEvent.click(destinatario('Directivos'))
    await userEvent.click(screen.getByRole('button', { name: 'Crear taller' }))

    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0)
    expect(guardarTaller).not.toHaveBeenCalled()
  })

  it('con un nombre de más de 200 caracteres no guarda', async () => {
    renderPagina('/admin/talleres/3/7/nuevo')
    await screen.findByRole('heading', { name: 'Nuevo Taller' })
    await userEvent.click(nombre())
    await userEvent.paste('a'.repeat(201))
    await userEvent.type(descripcion(), 'Algo')
    await userEvent.click(destinatario('Directivos'))
    await userEvent.click(screen.getByRole('button', { name: 'Crear taller' }))

    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0)
    expect(guardarTaller).not.toHaveBeenCalled()
  })

  it('sin descripción no guarda', async () => {
    renderPagina('/admin/talleres/3/7/nuevo')
    await screen.findByRole('heading', { name: 'Nuevo Taller' })
    await userEvent.type(nombre(), 'Algo')
    await userEvent.click(destinatario('Directivos'))
    await userEvent.click(screen.getByRole('button', { name: 'Crear taller' }))

    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0)
    expect(guardarTaller).not.toHaveBeenCalled()
  })

  it('sin ningún destinatario muestra "Elegí al menos un destinatario" y no guarda', async () => {
    renderPagina('/admin/talleres/3/7/nuevo')
    await screen.findByRole('heading', { name: 'Nuevo Taller' })
    await userEvent.type(nombre(), 'Algo')
    await userEvent.type(descripcion(), 'Algo')
    await userEvent.click(screen.getByRole('button', { name: 'Crear taller' }))

    expect(await screen.findByText('Elegí al menos un destinatario')).toBeInTheDocument()
    expect(guardarTaller).not.toHaveBeenCalled()
  })
})

describe('TallerFormPage: errores al guardar', () => {
  it('con DA002 muestra "La categoría está dada de baja: reactivala primero" y no navega', async () => {
    vi.mocked(guardarTaller).mockRejectedValue({ code: 'DA002', message: 'categoria inactiva' })
    renderPagina('/admin/talleres/3/7/nuevo')
    await screen.findByRole('heading', { name: 'Nuevo Taller' })
    await completarMinimo()
    await userEvent.click(screen.getByRole('button', { name: 'Crear taller' }))

    expect(await screen.findByText(DA002)).toBeInTheDocument()
    expect(screen.queryByText('Lista de talleres')).not.toBeInTheDocument()
  })

  it('ante cualquier otro error muestra un alert genérico, no el de DA002, y no navega', async () => {
    vi.mocked(guardarTaller).mockRejectedValue(new Error('sin red'))
    renderPagina('/admin/talleres/3/7/nuevo')
    await screen.findByRole('heading', { name: 'Nuevo Taller' })
    await completarMinimo()
    await userEvent.click(screen.getByRole('button', { name: 'Crear taller' }))

    const alerta = await screen.findByRole('alert')
    expect(alerta).not.toHaveTextContent('dada de baja')
    expect(screen.queryByText('Lista de talleres')).not.toBeInTheDocument()
  })
})

describe('TallerFormPage: edición', () => {
  it('precarga nombre, descripción, estado, destinatarios y etiquetas del taller', async () => {
    renderPagina('/admin/talleres/3/7/5/editar')
    await waitFor(() => expect(nombre()).toHaveValue('Huerta escolar'))
    expect(descripcion()).toHaveValue('Cultivo en el patio')
    expect(screen.getByLabelText('Estado')).toHaveValue('PUBLICADO')
    expect(destinatario('Docentes')).toHaveAttribute('aria-pressed', 'true')
    expect(destinatario('Directivos')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Quitar ambiente' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Editar taller' })).toBeInTheDocument()
  })

  it('guarda con p_id del taller y los datos modificados, y vuelve a la lista', async () => {
    vi.mocked(guardarTaller).mockResolvedValue(5)
    renderPagina('/admin/talleres/3/7/5/editar')
    await waitFor(() => expect(nombre()).toHaveValue('Huerta escolar'))

    await userEvent.clear(nombre())
    await userEvent.type(nombre(), 'Huerta urbana')
    await userEvent.click(destinatario('Familias'))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(guardarTaller).toHaveBeenCalledTimes(1))
    expect(vi.mocked(guardarTaller).mock.calls[0][0]).toEqual({
      p_id: 5,
      p_categoria_id: 7,
      p_nombre: 'Huerta urbana',
      p_descripcion: 'Cultivo en el patio',
      p_estado: 'PUBLICADO',
      p_destinatarios: [2, 4],
      p_etiquetas: ['ambiente'],
    })
    expect(await screen.findByText('Lista de talleres')).toBeInTheDocument()
  })

  it('con DA002 al editar muestra el mensaje de categoría dada de baja', async () => {
    vi.mocked(guardarTaller).mockRejectedValue({ code: 'DA002' })
    renderPagina('/admin/talleres/3/7/5/editar')
    await waitFor(() => expect(nombre()).toHaveValue('Huerta escolar'))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText(DA002)).toBeInTheDocument()
  })

  it('con un taller inexistente muestra "no encontrado" y no el formulario', async () => {
    renderPagina('/admin/talleres/3/7/999/editar')
    expect(await screen.findByText(/no encontrad/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
  })

  it('con un taller de otra categoría muestra "no encontrado" y no el formulario', async () => {
    vi.mocked(obtenerTalleres).mockResolvedValue([{ ...existente, categoria_id: 8 }])
    renderPagina('/admin/talleres/3/7/5/editar')
    expect(await screen.findByText(/no encontrad/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
  })

  it('con un :tallerId inválido muestra "no encontrado"', async () => {
    renderPagina('/admin/talleres/3/7/abc/editar')
    expect(await screen.findByText(/no encontrad/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
  })
})
