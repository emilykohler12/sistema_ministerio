import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'
import { Label } from './Label'
import { InputPassword } from './InputPassword'

/*
 * Contrato: InputPassword acepta las props de un <input> (excepto type), reenvia el ref al input y agrega un boton
 * type="button" con aria-label 'Mostrar contraseña' / 'Ocultar contraseña' que alterna type password <-> text.
 * `error` marca aria-invalid como Input.
 */
describe('InputPassword', () => {
  it('empieza oculto, con el boton "Mostrar contraseña"', () => {
    render(<InputPassword id="p" aria-label="Clave" />)
    expect(screen.getByLabelText('Clave')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Mostrar contraseña' })).toBeInTheDocument()
  })

  it('al pulsar el boton muestra el texto y cambia el nombre a "Ocultar contraseña"', async () => {
    const user = userEvent.setup()
    render(<InputPassword id="p" aria-label="Clave" />)
    await user.click(screen.getByRole('button', { name: 'Mostrar contraseña' }))
    expect(screen.getByLabelText('Clave')).toHaveAttribute('type', 'text')
    await user.click(screen.getByRole('button', { name: 'Ocultar contraseña' }))
    expect(screen.getByLabelText('Clave')).toHaveAttribute('type', 'password')
  })

  it('el boton es type=button para no enviar el formulario', () => {
    render(<InputPassword id="p" aria-label="Clave" />)
    expect(screen.getByRole('button', { name: 'Mostrar contraseña' })).toHaveAttribute('type', 'button')
  })

  it('pasa las props del input y se asocia a un Label por id', () => {
    render(
      <>
        <Label htmlFor="p">Contraseña nueva</Label>
        <InputPassword
          id="p"
          placeholder="Escribila"
          autoComplete="new-password"
          aria-describedby="p-error"
          error
        />
      </>,
    )
    const input = screen.getByLabelText('Contraseña nueva')
    expect(input).toHaveAttribute('placeholder', 'Escribila')
    expect(input).toHaveAttribute('autocomplete', 'new-password')
    expect(input).toHaveAttribute('aria-describedby', 'p-error')
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('reenvia el ref al input', () => {
    const ref = createRef<HTMLInputElement>()
    render(<InputPassword ref={ref} aria-label="Clave" />)
    expect(ref.current).toBe(screen.getByLabelText('Clave'))
  })
})
