import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFocusTrap } from './useFocusTrap'

/*
 * Contrato de useFocusTrap(ref, active, onClose) (spec instituciones-sin-vincular, crítica punto 1):
 *  - Al activarse enfoca el primer elemento enfocable del contenedor.
 *  - `onClose` se guarda en un ref: una función nueva en cada render NO reinicia el efecto, así que el foco no se mueve
 *    (antes, cada render devolvía el foco al disparador y volvía a enfocar la "X", rompiendo la escritura en un buscador).
 *  - Escape llama al ÚLTIMO `onClose` recibido.
 */
let contenedor: HTMLDivElement
let primero: HTMLButtonElement
let buscador: HTMLInputElement

beforeEach(() => {
  contenedor = document.createElement('div')
  primero = document.createElement('button')
  buscador = document.createElement('input')
  contenedor.append(primero, buscador)
  document.body.append(contenedor)
})

afterEach(() => {
  contenedor.remove()
})

describe('useFocusTrap', () => {
  it('al activarse enfoca el primer elemento enfocable', () => {
    renderHook(() => useFocusTrap({ current: contenedor }, true, () => {}))
    expect(primero).toHaveFocus()
  })

  it('un re-render con un onClose nuevo no mueve el foco', () => {
    const ref = { current: contenedor }
    const { rerender } = renderHook(({ onClose }) => useFocusTrap(ref, true, onClose), {
      initialProps: { onClose: () => {} },
    })
    buscador.focus()
    expect(buscador).toHaveFocus()

    rerender({ onClose: () => {} })
    rerender({ onClose: () => {} })

    expect(buscador).toHaveFocus()
  })

  it('Escape llama al último onClose, no al primero', () => {
    const ref = { current: contenedor }
    const viejo = vi.fn()
    const nuevo = vi.fn()
    const { rerender } = renderHook(({ onClose }) => useFocusTrap(ref, true, onClose), {
      initialProps: { onClose: viejo },
    })
    rerender({ onClose: nuevo })

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(nuevo).toHaveBeenCalledTimes(1)
    expect(viejo).not.toHaveBeenCalled()
  })

  it('al desactivarse devuelve el foco al elemento que lo tenía antes', () => {
    const disparador = document.createElement('button')
    document.body.append(disparador)
    disparador.focus()
    const ref = { current: contenedor }
    const { rerender } = renderHook(({ active }) => useFocusTrap(ref, active, () => {}), {
      initialProps: { active: true },
    })
    expect(primero).toHaveFocus()

    rerender({ active: false })

    expect(disparador).toHaveFocus()
    disparador.remove()
  })
})
