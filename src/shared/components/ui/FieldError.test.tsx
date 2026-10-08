import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FieldError } from './FieldError'

describe('FieldError', () => {
  it('no renderiza nada si no hay mensaje', () => {
    const { container } = render(<FieldError id="email-error" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('muestra el mensaje como alerta con el id indicado', () => {
    render(<FieldError id="email-error" message="Ingresá un email válido" />)
    const alerta = screen.getByRole('alert')
    expect(alerta).toHaveTextContent('Ingresá un email válido')
    expect(alerta).toHaveAttribute('id', 'email-error')
  })
})
