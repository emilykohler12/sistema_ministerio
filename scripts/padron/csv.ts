// Lectura del CSV del padrón (RFC 4180). Cuando llegue la muestra real (C-08) cambian `leerFilas` y sus columnas.

export interface FilaCsv {
  /** Número de registro en el archivo; el encabezado es el 1. */
  fila: number
  cue: string
  nombre: string
  localidad: string
}

/**
 * Decodifica los bytes del archivo como UTF-8 estricto y quita el BOM. Un archivo en otra codificación (el "CSV" de Excel
 * en español es Windows-1252) lanza en lugar de cambiar los caracteres por U+FFFD, que terminarían guardados en la base.
 */
export function decodificarCsv(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error(
      'El CSV debe estar en UTF-8 y este archivo no lo está. Desde Excel: Guardar como > "CSV UTF-8 (delimitado por comas)".',
    )
  }
}

/** El separador es `;` si el encabezado tiene más `;` que `,` (fuera de comillas); si no, `,`. */
function detectarSeparador(texto: string): string {
  let comas = 0
  let puntosYComas = 0
  let entreComillas = false
  for (const c of texto) {
    if (c === '"') entreComillas = !entreComillas
    else if (!entreComillas) {
      if (c === '\n' || c === '\r') break
      if (c === ',') comas++
      else if (c === ';') puntosYComas++
    }
  }
  return puntosYComas > comas ? ';' : ','
}

/** Devuelve todos los registros, encabezado incluido, como arreglos de celdas. */
export function parsearCsv(texto: string): string[][] {
  const t = texto.startsWith('﻿') ? texto.slice(1) : texto
  const separador = detectarSeparador(t)
  const registros: string[][] = []
  let registro: string[] = []
  let celda = ''
  let entreComillas = false
  let hayContenido = false
  let inicioCelda = true
  let registroDeComilla = 0

  const cerrarCelda = () => {
    registro.push(celda)
    celda = ''
    inicioCelda = true
  }
  const cerrarRegistro = () => {
    cerrarCelda()
    registros.push(registro)
    registro = []
    hayContenido = false
  }

  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (entreComillas) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          celda += '"'
          i++
        } else entreComillas = false
      } else celda += c
    } else if (c === '"' && inicioCelda) {
      // Solo una comilla al principio de la celda abre el modo comillas; en medio de una celda es literal.
      entreComillas = true
      hayContenido = true
      inicioCelda = false
      registroDeComilla = registros.length + 1
    } else if (c === separador) {
      cerrarCelda()
      hayContenido = true
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      cerrarRegistro()
    } else {
      celda += c
      hayContenido = true
      inicioCelda = false
    }
  }
  if (entreComillas) throw new Error(`Comilla sin cerrar: se abrió en el registro ${registroDeComilla} y no se cierra.`)
  // Último registro sin salto de línea. Un salto final no agrega un registro vacío.
  if (hayContenido || celda !== '' || registro.length > 0) cerrarRegistro()
  return registros
}

const COLUMNAS = ['cue', 'nombre', 'localidad'] as const

/** Mapea las columnas `cue`, `nombre` y `localidad` (sin distinguir mayúsculas ni orden). Salta las líneas en blanco. */
export function leerFilas(texto: string): FilaCsv[] {
  const [encabezado, ...resto] = parsearCsv(texto)
  if (!encabezado) throw new Error('El archivo está vacío.')
  const nombres = encabezado.map((n) => n.trim().toLowerCase())
  const indice = Object.fromEntries(COLUMNAS.map((c) => [c, nombres.indexOf(c)])) as Record<
    (typeof COLUMNAS)[number],
    number
  >
  const faltan = COLUMNAS.filter((c) => indice[c] === -1)
  if (faltan.length > 0) throw new Error(`Falta la columna: ${faltan.join(', ')}.`)

  const filas: FilaCsv[] = []
  resto.forEach((celdas, i) => {
    if (celdas.length === 1 && celdas[0] === '') return
    filas.push({
      fila: i + 2,
      cue: celdas[indice.cue] ?? '',
      nombre: celdas[indice.nombre] ?? '',
      localidad: celdas[indice.localidad] ?? '',
    })
  })
  return filas
}
