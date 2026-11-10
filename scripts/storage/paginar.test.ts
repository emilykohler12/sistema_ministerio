// @vitest-environment node
// traerPorClave es puro: recibe la función que pide una página (filas con id > ultimoId, orden por id) y la recorre.
import { describe, expect, it } from 'vitest'
import { traerPorClave } from './paginar.ts'

interface Fila {
  id: number
  ruta: string
}

const filas = (...ids: number[]): Fila[] => ids.map((id) => ({ id, ruta: `r${id}` }))

/** Simula la tabla: devuelve hasta `tope` filas con id > ultimoId, aunque se pidan más (el max_rows del servidor). */
function tabla(todas: Fila[], tope: number) {
  const pedidos: number[] = []
  const pagina = (ultimoId: number, limite: number) => {
    pedidos.push(ultimoId)
    const data = todas.filter((f) => f.id > ultimoId).slice(0, Math.min(tope, limite))
    return Promise.resolve({ data, error: null })
  }
  return { pagina, pedidos }
}

describe('traerPorClave', () => {
  it('recorre todas las páginas hasta una vacía', async () => {
    const { pagina, pedidos } = tabla(filas(1, 2, 3, 4, 5), 100)
    expect(await traerPorClave(pagina, 2)).toEqual(filas(1, 2, 3, 4, 5))
    expect(pedidos).toEqual([0, 2, 4, 5])
  })

  it('avanza por el último id recibido aunque el servidor devuelva páginas más cortas que la pedida', async () => {
    const { pagina, pedidos } = tabla(filas(1, 2, 3, 4, 5, 6, 7), 3)
    expect(await traerPorClave(pagina, 1000)).toEqual(filas(1, 2, 3, 4, 5, 6, 7))
    expect(pedidos).toEqual([0, 3, 6, 7])
  })

  it('no se corre si faltan ids (huecos por filas borradas)', async () => {
    const { pagina } = tabla(filas(1, 5, 9, 20), 2)
    expect(await traerPorClave(pagina, 2)).toEqual(filas(1, 5, 9, 20))
  })

  it('una tabla vacía da una lista vacía', async () => {
    const { pagina } = tabla([], 10)
    expect(await traerPorClave(pagina, 10)).toEqual([])
  })

  it('una página nula se trata como vacía', async () => {
    expect(await traerPorClave<Fila>(() => Promise.resolve({ data: null, error: null }), 10)).toEqual([])
  })

  it('falla cerrada: un error en cualquier página lanza y no devuelve lo leído', async () => {
    let llamadas = 0
    const pagina = (ultimoId: number) => {
      llamadas++
      if (llamadas === 2) return Promise.resolve({ data: null, error: new Error('caída') })
      return Promise.resolve({ data: filas(ultimoId + 1), error: null })
    }
    await expect(traerPorClave(pagina, 1)).rejects.toThrow('caída')
  })
})
