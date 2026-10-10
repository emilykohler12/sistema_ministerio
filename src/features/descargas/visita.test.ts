import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatosDescarga } from './types'

/*
 * Contrato (corte descargas, criterio 4). src/features/descargas/visita.ts, con try/catch alrededor de sessionStorage:
 *   recordarFormulario(datos: DatosDescarga): void       // guarda el formulario en sessionStorage
 *   formularioRecordado(): DatosDescarga | null          // lo lee y lo valida con esquemaDescarga.safeParse; si no pasa (o no
 *                                                        // es JSON, o no hay nada), devuelve null
 *   marcarTallerRegistrado(tallerId: number): void       // marca en un Set de módulo (memoria) y en sessionStorage
 *   tallerRegistrado(tallerId: number): boolean          // memoria o sessionStorage
 * Si sessionStorage lanza (modo privado, cuota), nada lanza y la marca sigue valiendo gracias al Set en memoria.
 * Los tests no dependen de los nombres de las claves de sessionStorage.
 */
const datos: DatosDescarga = {
  cargo: 'Docente',
  cargo_otro: null,
  localidad_id: 7,
  institucion_tipo: 'PADRON',
  establecimiento_id: 30,
  institucion_otra: null,
}

// El Set vive en el módulo: cada test arranca con un módulo nuevo (la "recarga" de la página es importar otra vez).
async function cargar() {
  vi.resetModules()
  return import('./visita')
}

function pisarTodoElStorage(valor: string) {
  for (let i = 0; i < sessionStorage.length; i++) sessionStorage.setItem(sessionStorage.key(i) as string, valor)
}

beforeEach(() => {
  sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
})

describe('formulario recordado', () => {
  it('sin nada guardado devuelve null', async () => {
    const { formularioRecordado } = await cargar()
    expect(formularioRecordado()).toBeNull()
  })

  it('devuelve lo que se recordó', async () => {
    const { formularioRecordado, recordarFormulario } = await cargar()
    recordarFormulario(datos)
    expect(formularioRecordado()).toEqual(datos)
  })

  it('sobrevive a una recarga (módulo nuevo) porque está en sessionStorage', async () => {
    const primera = await cargar()
    primera.recordarFormulario(datos)
    const { formularioRecordado } = await cargar()
    expect(formularioRecordado()).toEqual(datos)
  })

  it('descarta lo guardado que no pasa el esquema (cargo desconocido)', async () => {
    const { formularioRecordado, recordarFormulario } = await cargar()
    recordarFormulario(datos)
    pisarTodoElStorage(JSON.stringify({ ...datos, cargo: 'Ministro' }))
    expect(formularioRecordado()).toBeNull()
  })

  it('descarta una forma vieja (faltan campos) y lo que no es JSON', async () => {
    const { formularioRecordado, recordarFormulario } = await cargar()
    recordarFormulario(datos)
    pisarTodoElStorage(JSON.stringify({ escuela: 'Escuela 1', localidad: 'Posadas', rol: 'Docente' }))
    expect(formularioRecordado()).toBeNull()
    pisarTodoElStorage('{no es json')
    expect(formularioRecordado()).toBeNull()
  })

  it('con PADRON sin establecimiento guardado a mano devuelve null', async () => {
    const { formularioRecordado, recordarFormulario } = await cargar()
    recordarFormulario(datos)
    pisarTodoElStorage(JSON.stringify({ ...datos, establecimiento_id: null }))
    expect(formularioRecordado()).toBeNull()
  })
})

describe('talleres registrados en la visita', () => {
  it('un taller sin marcar no está registrado', async () => {
    const { tallerRegistrado } = await cargar()
    expect(tallerRegistrado(5)).toBe(false)
  })

  it('marcar un taller lo registra y no afecta a los demás', async () => {
    const { marcarTallerRegistrado, tallerRegistrado } = await cargar()
    marcarTallerRegistrado(5)
    expect(tallerRegistrado(5)).toBe(true)
    expect(tallerRegistrado(6)).toBe(false)
  })

  it('la marca sobrevive a una recarga (sessionStorage)', async () => {
    const primera = await cargar()
    primera.marcarTallerRegistrado(5)
    const { tallerRegistrado } = await cargar()
    expect(tallerRegistrado(5)).toBe(true)
    expect(tallerRegistrado(6)).toBe(false)
  })

  it('la marca vale en memoria aunque sessionStorage haya sido vaciado', async () => {
    const { marcarTallerRegistrado, tallerRegistrado } = await cargar()
    marcarTallerRegistrado(5)
    sessionStorage.clear()
    expect(tallerRegistrado(5)).toBe(true)
  })
})

describe('sessionStorage que lanza', () => {
  function romperStorage() {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('cuota', 'QuotaExceededError')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('acceso denegado', 'SecurityError')
    })
  }

  it('recordar y leer el formulario no lanzan', async () => {
    const { formularioRecordado, recordarFormulario } = await cargar()
    romperStorage()
    expect(() => recordarFormulario(datos)).not.toThrow()
    expect(() => formularioRecordado()).not.toThrow()
  })

  it('marcar y consultar un taller no lanzan y la marca queda en memoria', async () => {
    const { marcarTallerRegistrado, tallerRegistrado } = await cargar()
    romperStorage()
    expect(() => marcarTallerRegistrado(5)).not.toThrow()
    expect(tallerRegistrado(5)).toBe(true)
    expect(tallerRegistrado(6)).toBe(false)
  })
})
