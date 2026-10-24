import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Dialog } from './Dialog'

describe('Dialog', () => {
  it('es un dialog modal con su título y su descripción', () => {
    render(
      <Dialog open onClose={() => {}} title="Agregar recurso" description="Elegí un archivo">
        <p>Contenido</p>
      </Dialog>,
    )
    const dialogo = screen.getByRole('dialog', { name: 'Agregar recurso' })
    expect(dialogo).toHaveAttribute('aria-modal', 'true')
    expect(dialogo).toHaveAccessibleDescription('Elegí un archivo')
  })

  it('con role="alertdialog" se expone como alertdialog', () => {
    render(
      <Dialog open onClose={() => {}} title="Aviso" role="alertdialog">
        <p>Contenido</p>
      </Dialog>,
    )
    expect(screen.getByRole('alertdialog', { name: 'Aviso' })).toBeInTheDocument()
  })

  it('cada diálogo apilado se nombra con su propio título y su propia descripción', () => {
    render(
      <>
        <Dialog open onClose={() => {}} title="Abajo" description="Descripción de abajo">
          <p>A</p>
        </Dialog>
        <Dialog open onClose={() => {}} title="Arriba" description="Descripción de arriba" role="alertdialog">
          <p>B</p>
        </Dialog>
      </>,
    )
    const abajo = screen.getByRole('dialog', { name: 'Abajo' })
    const arriba = screen.getByRole('alertdialog', { name: 'Arriba' })
    expect(abajo).toHaveAccessibleDescription('Descripción de abajo')
    expect(arriba).toHaveAccessibleDescription('Descripción de arriba')
  })
})
