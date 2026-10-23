import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useInactividad } from './useInactividad'

const MIN = 60_000
const LIMITE = 30 * MIN
const AVISO = 2 * MIN

function avanzar(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

function montar(opciones: { activo?: boolean } = {}) {
  const onVencida = vi.fn()
  const vista = renderHook(
    ({ activo }) => useInactividad({ activo, limiteMs: LIMITE, avisoMs: AVISO, onVencida }),
    { initialProps: { activo: opciones.activo ?? true } },
  )
  return { onVencida, ...vista }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useInactividad', () => {
  it('sin actividad vence a los 30 minutos y no antes', () => {
    const { onVencida } = montar()
    avanzar(LIMITE - 1000)
    expect(onVencida).not.toHaveBeenCalled()
    avanzar(2000)
    expect(onVencida).toHaveBeenCalledTimes(1)
  })

  it('no vuelve a llamar a onVencida después de vencer', () => {
    const { onVencida } = montar()
    avanzar(LIMITE + 10 * MIN)
    expect(onVencida).toHaveBeenCalledTimes(1)
  })

  it('muestra el aviso a los 28 minutos y no antes', () => {
    const { result } = montar()
    avanzar(LIMITE - AVISO - 2000)
    expect(result.current.aviso).toBe(false)
    avanzar(3000)
    expect(result.current.aviso).toBe(true)
    expect(result.current.venceEn).toBe(Date.now() + (AVISO - 1000))
  })

  it.each([
    ['pointerdown', window],
    ['keydown', window],
    ['scroll', window],
    ['touchstart', window],
    ['pointerdown', document.body],
  ])('el evento %s reinicia el contador', (tipo, destino) => {
    const { onVencida, result } = montar()
    avanzar(LIMITE - 5 * MIN)
    act(() => {
      destino.dispatchEvent(new Event(tipo, { bubbles: true }))
    })
    avanzar(LIMITE - 1000)
    expect(onVencida).not.toHaveBeenCalled()
    expect(result.current.aviso).toBe(true)
    avanzar(2000)
    expect(onVencida).toHaveBeenCalledTimes(1)
  })

  it('un scroll dentro de un elemento (no burbujea) también reinicia', () => {
    const { onVencida } = montar()
    const caja = document.createElement('div')
    document.body.appendChild(caja)
    avanzar(LIMITE - 5 * MIN)
    act(() => {
      caja.dispatchEvent(new Event('scroll'))
    })
    avanzar(LIMITE - 1000)
    expect(onVencida).not.toHaveBeenCalled()
    caja.remove()
  })

  it('con el aviso visible la actividad ambiente no lo oculta: solo extender', () => {
    const { onVencida, result } = montar()
    avanzar(LIMITE - AVISO + 1000)
    expect(result.current.aviso).toBe(true)
    act(() => {
      window.dispatchEvent(new Event('keydown'))
    })
    expect(result.current.aviso).toBe(true)
    avanzar(AVISO)
    expect(onVencida).toHaveBeenCalledTimes(1)
  })

  it('extender oculta el aviso y reinicia los 30 minutos', () => {
    const { onVencida, result } = montar()
    avanzar(LIMITE - AVISO + 1000)
    expect(result.current.aviso).toBe(true)
    act(() => result.current.extender())
    expect(result.current.aviso).toBe(false)
    avanzar(LIMITE - 1000)
    expect(onVencida).not.toHaveBeenCalled()
    avanzar(2000)
    expect(onVencida).toHaveBeenCalledTimes(1)
  })

  it('mide con la hora del sistema: un salto de reloj (pestaña dormida) vence apenas corre el temporizador', () => {
    const { onVencida } = montar()
    act(() => {
      vi.setSystemTime(Date.now() + LIMITE + MIN)
      vi.advanceTimersByTime(1000)
    })
    expect(onVencida).toHaveBeenCalledTimes(1)
  })

  it('con activo en false no hay temporizador ni aviso', () => {
    const { onVencida, result } = montar({ activo: false })
    expect(vi.getTimerCount()).toBe(0)
    avanzar(LIMITE * 2)
    expect(onVencida).not.toHaveBeenCalled()
    expect(result.current.aviso).toBe(false)
  })

  it('al pasar activo a false limpia temporizadores y oculta el aviso; al volver a true cuenta de nuevo', () => {
    const { onVencida, result, rerender } = montar()
    avanzar(LIMITE - AVISO + 1000)
    expect(result.current.aviso).toBe(true)
    rerender({ activo: false })
    expect(result.current.aviso).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    avanzar(LIMITE * 2)
    expect(onVencida).not.toHaveBeenCalled()
    rerender({ activo: true })
    avanzar(LIMITE - 1000)
    expect(onVencida).not.toHaveBeenCalled()
    avanzar(2000)
    expect(onVencida).toHaveBeenCalledTimes(1)
  })

  it('al desmontar quita los listeners y los temporizadores', () => {
    const quitar = vi.spyOn(window, 'removeEventListener')
    const agregar = vi.spyOn(window, 'addEventListener')
    const { onVencida, unmount } = montar()
    const tipos = ['pointerdown', 'keydown', 'scroll', 'touchstart']
    for (const tipo of tipos) {
      expect(agregar.mock.calls.some(([t]) => t === tipo)).toBe(true)
    }
    unmount()
    for (const tipo of tipos) {
      expect(quitar.mock.calls.some(([t]) => t === tipo)).toBe(true)
    }
    expect(vi.getTimerCount()).toBe(0)
    avanzar(LIMITE * 2)
    expect(onVencida).not.toHaveBeenCalled()
    quitar.mockRestore()
    agregar.mockRestore()
  })

  it('usa el onVencida más reciente sin reiniciar el contador', () => {
    const primera = vi.fn()
    const segunda = vi.fn()
    const { rerender } = renderHook(
      ({ cb }) => useInactividad({ activo: true, limiteMs: LIMITE, avisoMs: AVISO, onVencida: cb }),
      { initialProps: { cb: primera } },
    )
    avanzar(10 * MIN)
    rerender({ cb: segunda })
    avanzar(LIMITE - 10 * MIN + 1000)
    expect(primera).not.toHaveBeenCalled()
    expect(segunda).toHaveBeenCalledTimes(1)
  })

  describe('si el temporizador se demoró (equipo dormido) y el tiempo ya pasó', () => {
    function saltar(ms: number) {
      act(() => {
        vi.setSystemTime(Date.now() + ms)
      })
    }

    it('un pointerdown antes del próximo tic cierra en vez de reiniciar el plazo', () => {
      const { onVencida } = montar()
      avanzar(10 * MIN)
      saltar(LIMITE + MIN)
      act(() => {
        window.dispatchEvent(new Event('pointerdown'))
      })
      expect(onVencida).toHaveBeenCalledTimes(1)
    })

    it('extender() con el aviso visible no reinicia una sesión que ya venció', () => {
      const { onVencida, result } = montar()
      avanzar(LIMITE - AVISO + 1000)
      expect(result.current.aviso).toBe(true)
      saltar(AVISO + MIN)
      act(() => result.current.extender())
      expect(onVencida).toHaveBeenCalledTimes(1)
      expect(result.current.aviso).toBe(false)
    })

    it('visibilitychange al volver a la pestaña cierra sin esperar al tic', () => {
      const { onVencida } = montar()
      saltar(LIMITE + MIN)
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      expect(onVencida).toHaveBeenCalledTimes(1)
    })

    it('después de cerrar, otra actividad o extender() no vuelven a llamar a onVencida', () => {
      const { onVencida, result } = montar()
      saltar(LIMITE + MIN)
      act(() => {
        window.dispatchEvent(new Event('keydown'))
      })
      act(() => result.current.extender())
      act(() => {
        window.dispatchEvent(new Event('pointerdown'))
      })
      expect(onVencida).toHaveBeenCalledTimes(1)
    })
  })
})
