import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Paginacion } from './Paginacion'

/*
 * Contrato: <Paginacion pagina totalPaginas onCambiar deshabilitado? />
 *  - <nav> con nombre "Paginación"; botones "Anterior" y "Siguiente"; texto "Página X de Y".
 *  - "Anterior" deshabilitado en la primera página; "Siguiente" en la última.
 *  - onCambiar(pagina) con la página destino. `deshabilitado` apaga los dos botones (datos en actualización).
 */
function renderizar(p: { pagina: number; totalPaginas: number; deshabilitado?: boolean }) {
  const onCambiar = vi.fn()
  render(<Paginacion {...p} onCambiar={onCambiar} />)
  return onCambiar
}

describe('Paginacion', () => {
  it('es una navegación con nombre y muestra "Página X de Y"', () => {
    renderizar({ pagina: 2, totalPaginas: 5 })
    expect(screen.getByRole('navigation', { name: 'Paginación' })).toBeInTheDocument()
    expect(screen.getByText('Página 2 de 5')).toBeInTheDocument()
  })

  it('en el medio habilita los dos botones', () => {
    renderizar({ pagina: 2, totalPaginas: 5 })
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled()
  })

  it('en la primera página "Anterior" está deshabilitado', () => {
    renderizar({ pagina: 1, totalPaginas: 5 })
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled()
  })

  it('en la última página "Siguiente" está deshabilitado', () => {
    renderizar({ pagina: 5, totalPaginas: 5 })
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeEnabled()
  })

  it('"Siguiente" llama a onCambiar con la página siguiente', async () => {
    const onCambiar = renderizar({ pagina: 2, totalPaginas: 5 })
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(onCambiar).toHaveBeenCalledWith(3)
  })

  it('"Anterior" llama a onCambiar con la página anterior', async () => {
    const onCambiar = renderizar({ pagina: 2, totalPaginas: 5 })
    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }))
    expect(onCambiar).toHaveBeenCalledWith(1)
  })

  it('un botón deshabilitado no llama a onCambiar', async () => {
    const onCambiar = renderizar({ pagina: 1, totalPaginas: 5 })
    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }))
    expect(onCambiar).not.toHaveBeenCalled()
  })

  it('con deshabilitado apaga los dos botones', () => {
    renderizar({ pagina: 2, totalPaginas: 5, deshabilitado: true })
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
  })

  it('con una sola página los dos botones están deshabilitados', () => {
    renderizar({ pagina: 1, totalPaginas: 1 })
    expect(screen.getByText('Página 1 de 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
  })
})
