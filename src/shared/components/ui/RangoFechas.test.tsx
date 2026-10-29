import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RangoFechas } from './RangoFechas'

/*
 * Contrato: <RangoFechas desde hasta error idError onCambio />
 *  - Dos <input type="date"> con label "Desde" y "Hasta" (fragmento: el contenedor lo pone quien lo usa).
 *  - `desde` / `hasta` son strings ('' = vacío). Escribir actualiza un borrador local y llama a
 *    onCambio(desde, hasta) 300 ms después de la última edición, una sola vez.
 *  - Si las props cambian desde afuera, los campos las siguen.
 *  - `error` (string | null): con mensaje marca los campos inválidos y los asocia con aria-describedby a `idError`.
 *    El mensaje lo muestra el padre con FieldError.
 */
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function renderizar(props: { desde?: string; hasta?: string; error?: string | null } = {}) {
  const onCambio = vi.fn()
  const ui = (p: typeof props) => (
    <RangoFechas
      desde={p.desde ?? '2026-03-01'}
      hasta={p.hasta ?? '2026-03-10'}
      error={p.error ?? null}
      idError="error-rango"
      onCambio={onCambio}
    />
  )
  const r = render(ui(props))
  return { onCambio, rerender: (p: typeof props) => r.rerender(ui(p)) }
}

const desde = () => screen.getByLabelText('Desde') as HTMLInputElement
const hasta = () => screen.getByLabelText('Hasta') as HTMLInputElement
const avanzar = (ms: number) => act(() => vi.advanceTimersByTime(ms))

describe('RangoFechas', () => {
  it('muestra los dos campos de fecha con los valores recibidos', () => {
    renderizar()
    expect(desde()).toHaveAttribute('type', 'date')
    expect(hasta()).toHaveAttribute('type', 'date')
    expect(desde().value).toBe('2026-03-01')
    expect(hasta().value).toBe('2026-03-10')
  })

  it('con valores vacíos los campos quedan vacíos', () => {
    renderizar({ desde: '', hasta: '' })
    expect(desde().value).toBe('')
    expect(hasta().value).toBe('')
  })

  it('no llama a onCambio al montar', () => {
    const { onCambio } = renderizar()
    avanzar(1000)
    expect(onCambio).not.toHaveBeenCalled()
  })

  it('espera 300 ms antes de avisar el cambio', () => {
    const { onCambio } = renderizar()
    fireEvent.change(desde(), { target: { value: '2026-03-02' } })
    avanzar(299)
    expect(onCambio).not.toHaveBeenCalled()
    avanzar(1)
    expect(onCambio).toHaveBeenCalledTimes(1)
    expect(onCambio).toHaveBeenCalledWith('2026-03-02', '2026-03-10')
  })

  it('varias ediciones seguidas generan una sola llamada con el último valor', () => {
    const { onCambio } = renderizar()
    fireEvent.change(desde(), { target: { value: '0002-03-01' } })
    avanzar(100)
    fireEvent.change(desde(), { target: { value: '0020-03-01' } })
    avanzar(100)
    fireEvent.change(desde(), { target: { value: '2026-02-01' } })
    avanzar(1000)
    expect(onCambio).toHaveBeenCalledTimes(1)
    expect(onCambio).toHaveBeenCalledWith('2026-02-01', '2026-03-10')
  })

  it('editar el campo "Hasta" avisa con ambos valores', () => {
    const { onCambio } = renderizar()
    fireEvent.change(hasta(), { target: { value: '2026-03-20' } })
    avanzar(300)
    expect(onCambio).toHaveBeenCalledWith('2026-03-01', '2026-03-20')
  })

  it('vaciar un campo avisa con cadena vacía', () => {
    const { onCambio } = renderizar()
    fireEvent.change(desde(), { target: { value: '' } })
    avanzar(300)
    expect(onCambio).toHaveBeenCalledWith('', '2026-03-10')
  })

  it('volver al valor original antes de la espera no avisa nada', () => {
    const { onCambio } = renderizar()
    fireEvent.change(desde(), { target: { value: '2026-03-02' } })
    avanzar(100)
    fireEvent.change(desde(), { target: { value: '2026-03-01' } })
    avanzar(1000)
    expect(onCambio).not.toHaveBeenCalled()
  })

  it('si las props cambian desde afuera, los campos las siguen y no se avisa', () => {
    const { onCambio, rerender } = renderizar()
    fireEvent.change(desde(), { target: { value: '2026-03-02' } })
    rerender({ desde: '2026-05-01', hasta: '2026-05-31' })
    expect(desde().value).toBe('2026-05-01')
    expect(hasta().value).toBe('2026-05-31')
    avanzar(1000)
    expect(onCambio).not.toHaveBeenCalled()
  })

  it('una nueva función onCambio no reinicia la espera', () => {
    const primera = vi.fn()
    const segunda = vi.fn()
    const { rerender } = render(
      <RangoFechas desde="2026-03-01" hasta="2026-03-10" error={null} idError="e" onCambio={primera} />,
    )
    fireEvent.change(desde(), { target: { value: '2026-03-02' } })
    avanzar(200)
    rerender(<RangoFechas desde="2026-03-01" hasta="2026-03-10" error={null} idError="e" onCambio={segunda} />)
    avanzar(100)
    expect(primera).not.toHaveBeenCalled()
    expect(segunda).toHaveBeenCalledWith('2026-03-02', '2026-03-10')
  })

  it('sin error los campos no están marcados ni apuntan a un mensaje', () => {
    renderizar({ error: null })
    for (const campo of [desde(), hasta()]) {
      expect(campo).not.toHaveAttribute('aria-invalid')
      expect(campo).not.toHaveAttribute('aria-describedby')
    }
  })

  it('con error los dos campos quedan inválidos y asociados al mensaje por idError', () => {
    renderizar({ error: 'Ingresá una fecha válida.' })
    for (const campo of [desde(), hasta()]) {
      expect(campo).toHaveAttribute('aria-invalid', 'true')
      expect(campo).toHaveAttribute('aria-describedby', 'error-rango')
    }
  })
})
