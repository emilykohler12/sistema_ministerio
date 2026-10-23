import { fireEvent, renderHook } from '@testing-library/react'
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

  describe('con dos trampas activas (diálogos apilados)', () => {
    let otro: HTMLDivElement
    let otroPrimero: HTMLButtonElement
    let otroUltimo: HTMLButtonElement

    beforeEach(() => {
      otro = document.createElement('div')
      otroPrimero = document.createElement('button')
      otroUltimo = document.createElement('button')
      otro.append(otroPrimero, otroUltimo)
      document.body.append(otro)
    })

    afterEach(() => {
      otro.remove()
    })

    it('Escape solo lo atiende la de arriba (la última activada)', () => {
      const abajo = vi.fn()
      const arriba = vi.fn()
      renderHook(() => useFocusTrap({ current: contenedor }, true, abajo))
      renderHook(() => useFocusTrap({ current: otro }, true, arriba))

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(arriba).toHaveBeenCalledTimes(1)
      expect(abajo).not.toHaveBeenCalled()
    })

    it('al desmontar la de arriba, Escape vuelve a llegar a la de abajo', () => {
      const abajo = vi.fn()
      const arriba = vi.fn()
      renderHook(() => useFocusTrap({ current: contenedor }, true, abajo))
      const superior = renderHook(() => useFocusTrap({ current: otro }, true, arriba))

      superior.unmount()
      fireEvent.keyDown(document, { key: 'Escape' })

      expect(abajo).toHaveBeenCalledTimes(1)
      expect(arriba).not.toHaveBeenCalled()
    })

    it('una trampa del medio que se desactiva sale de la pila, sin llevarse a las demás ni quedarse', () => {
      const tercero = document.createElement('div')
      tercero.append(document.createElement('button'))
      document.body.append(tercero)
      const a = vi.fn()
      const b = vi.fn()
      const c = vi.fn()
      renderHook(() => useFocusTrap({ current: contenedor }, true, a))
      const medio = renderHook(({ active }) => useFocusTrap({ current: otro }, active, b), {
        initialProps: { active: true },
      })
      const arriba = renderHook(() => useFocusTrap({ current: tercero }, true, c))

      // Al sacar B, la de arriba sigue siendo C (un pop() sacaría a C y dejaría a B).
      medio.rerender({ active: false })
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(c).toHaveBeenCalledTimes(1)
      expect(b).not.toHaveBeenCalled()
      expect(a).not.toHaveBeenCalled()

      // Al sacar C, la de arriba es A (un token de B que nunca se quita taparía a A).
      arriba.unmount()
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(a).toHaveBeenCalledTimes(1)
      expect(b).not.toHaveBeenCalled()
      expect(c).toHaveBeenCalledTimes(1)
      tercero.remove()
    })

    it('si se cierra la de abajo, el foco no se escapa de la de arriba; al cerrar la de arriba vuelve al disparador original', () => {
      const disparador = document.createElement('button')
      document.body.append(disparador)
      disparador.focus()
      const inferior = renderHook(({ active }) => useFocusTrap({ current: contenedor }, active, () => {}), {
        initialProps: { active: true },
      })
      expect(primero).toHaveFocus()
      const superior = renderHook(() => useFocusTrap({ current: otro }, true, () => {}))
      expect(otroPrimero).toHaveFocus()

      inferior.rerender({ active: false })
      expect(otroPrimero).toHaveFocus()

      superior.unmount()
      expect(disparador).toHaveFocus()
      disparador.remove()
    })

    it('Tab en el último de la de arriba da la vuelta dentro de ella y la de abajo no interviene', () => {
      renderHook(() => useFocusTrap({ current: contenedor }, true, () => {}))
      renderHook(() => useFocusTrap({ current: otro }, true, () => {}))
      otroUltimo.focus()

      const evento = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
      document.dispatchEvent(evento)

      expect(evento.defaultPrevented).toBe(true)
      expect(otroPrimero).toHaveFocus()
    })

    it('Tab con foco en el último de la de abajo no se redirige mientras hay otra encima', () => {
      renderHook(() => useFocusTrap({ current: contenedor }, true, () => {}))
      renderHook(() => useFocusTrap({ current: otro }, true, () => {}))
      buscador.focus()

      const evento = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
      document.dispatchEvent(evento)

      expect(primero).not.toHaveFocus()
    })

    it('al cerrar la de arriba el foco vuelve al elemento que tenía antes de abrirse', () => {
      renderHook(() => useFocusTrap({ current: contenedor }, true, () => {}))
      buscador.focus()
      const superior = renderHook(() => useFocusTrap({ current: otro }, true, () => {}))
      expect(otroPrimero).toHaveFocus()

      superior.unmount()

      expect(buscador).toHaveFocus()
    })
  })
})
