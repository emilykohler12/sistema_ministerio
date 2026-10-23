import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AvisoInactividad } from './AvisoInactividad'

function avanzar(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

function montar() {
  const onSeguir = vi.fn()
  render(<AvisoInactividad venceEn={Date.now() + 120_000} onSeguir={onSeguir} />)
  return { onSeguir }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('AvisoInactividad', () => {
  it('es un alertdialog con título, explicación y el botón "Seguir conectado"', () => {
    montar()
    const dialogo = screen.getByRole('alertdialog', { name: 'Tu sesión está por cerrarse' })
    expect(dialogo).toHaveAttribute('aria-modal', 'true')
    expect(dialogo).toHaveAccessibleDescription(/inactividad/i)
    expect(screen.getByRole('button', { name: 'Seguir conectado' })).toBeInTheDocument()
  })

  it('pone el foco en "Seguir conectado"', () => {
    montar()
    expect(screen.getByRole('button', { name: 'Seguir conectado' })).toHaveFocus()
  })

  it('"Seguir conectado" llama a onSeguir', () => {
    const { onSeguir } = montar()
    fireEvent.click(screen.getByRole('button', { name: 'Seguir conectado' }))
    expect(onSeguir).toHaveBeenCalledTimes(1)
  })

  it('Escape también mantiene la sesión', () => {
    const { onSeguir } = montar()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onSeguir).toHaveBeenCalledTimes(1)
  })

  it('la cuenta regresiva visible baja cada segundo', () => {
    montar()
    const reloj = screen.getByRole('timer')
    expect(reloj).toHaveTextContent('2:00')
    avanzar(1000)
    expect(reloj).toHaveTextContent('1:59')
    avanzar(59_000)
    expect(reloj).toHaveTextContent('1:00')
  })

  it('el reloj no es una región en vivo: no habla cada segundo', () => {
    montar()
    const reloj = screen.getByRole('timer')
    expect(reloj.closest('[aria-live="polite"], [aria-live="assertive"], [role="status"], [role="alert"]')).toBeNull()
  })

  it('el anuncio para el lector de pantalla solo cambia en hitos', () => {
    montar()
    const estado = screen.getByRole('status')
    expect(estado).toHaveTextContent('Quedan 2 minutos para que se cierre tu sesión.')
    avanzar(30_000)
    expect(estado).toHaveTextContent('Quedan 2 minutos para que se cierre tu sesión.')
    avanzar(30_000)
    expect(estado).toHaveTextContent('Queda 1 minuto para que se cierre tu sesión.')
    avanzar(30_000)
    expect(estado).toHaveTextContent('Quedan 30 segundos para que se cierre tu sesión.')
    avanzar(20_000)
    expect(estado).toHaveTextContent('Quedan 10 segundos para que se cierre tu sesión.')
  })

  it('al desmontar limpia el temporizador', () => {
    const antes = vi.getTimerCount()
    const { unmount } = render(<AvisoInactividad venceEn={Date.now() + 120_000} onSeguir={() => {}} />)
    expect(vi.getTimerCount()).toBeGreaterThan(antes)
    unmount()
    avanzar(0)
    expect(vi.getTimerCount()).toBe(antes)
  })
})
