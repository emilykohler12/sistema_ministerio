import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { NormativaConteo } from '../types'
import { TablaNormativas } from './TablaNormativas'

/*
 * #32 (criterios 3 y 5): TablaNormativas({ normativas: NormativaConteo[] }) con las columnas
 * «Normativa», «Número / año», «En el período» y «Total histórico» (última). Ordena con ordenarNormativas
 * (período desc, total desc, id asc). El cero se muestra. Sin normativas, EmptyState.
 */
const n = (id: number, titulo: string, descargas: number, descargas_periodo: number): NormativaConteo => ({
  id,
  titulo,
  numero: String(id),
  anio: 2024,
  descargas,
  descargas_periodo,
})

const celdas = (fila: HTMLElement) => within(fila).getAllByRole('cell').map((c) => c.textContent)

describe('TablaNormativas', () => {
  it('muestra «En el período» y «Total histórico», esta última al final', () => {
    render(<TablaNormativas normativas={[n(1, 'Res. 1', 9, 4)]} />)
    const encabezados = screen.getAllByRole('columnheader').map((c) => c.textContent)
    expect(encabezados).toEqual(['Normativa', 'Número / año', 'En el período', 'Total histórico'])
  })

  it('cada fila trae el período y el total histórico en ese orden', () => {
    render(<TablaNormativas normativas={[n(1, 'Res. 1', 9, 4)]} />)
    const [, fila] = screen.getAllByRole('row')
    expect(celdas(fila).slice(-2)).toEqual(['4', '9'])
  })

  it('muestra el cero de una normativa sin descargas en el período', () => {
    render(<TablaNormativas normativas={[n(1, 'Res. 1', 9, 0)]} />)
    const [, fila] = screen.getAllByRole('row')
    expect(celdas(fila).slice(-2)).toEqual(['0', '9'])
  })

  it('ordena por período desc, total desc e id asc', () => {
    render(
      <TablaNormativas
        normativas={[n(1, 'Uno', 100, 0), n(2, 'Dos', 3, 3), n(3, 'Tres', 8, 3), n(4, 'Cuatro', 8, 3)]}
      />,
    )
    const titulos = screen
      .getAllByRole('row')
      .slice(1)
      .map((f) => celdas(f)[0])
    expect(titulos).toEqual(['Tres', 'Cuatro', 'Dos', 'Uno'])
  })

  it('sin normativas muestra el estado vacío y ninguna tabla', () => {
    render(<TablaNormativas normativas={[]} />)
    expect(screen.getByText('Todavía no hay normativas cargadas')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
