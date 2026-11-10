import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { formatearTamanio } from '../archivos'
import { ProgresoSubida } from './ProgresoSubida'

/*
 * Contrato (spec subida-reanudable, criterios 1, 3, 6 y 10). src/features/recursos/components/ProgresoSubida.tsx, export `ProgresoSubida`:
 *   props: { nombre: string; tamanio: number (bytes del archivo); progreso: number (entero 0-100);
 *            estado: 'esperando' | 'subiendo' | 'reintentando' | 'finalizando'; onCancelar: () => void }
 *   - <progress max=100 value=progreso> con nombre accesible = nombre (el del archivo).
 *   - texto "<enviados> de <total> (<progreso> %)" con formatearTamanio (enviados = tamanio * progreso / 100); espacio normal antes de "%".
 *   - 'esperando' dice "En espera"; 'reintentando' dice "Sin conexión, reintentando…"; 'finalizando' dice "Finalizando…".
 *   - botón "Cancelar" (name que empieza con "Cancelar"), salvo en 'finalizando'.
 */
const MIB = 1024 * 1024

function renderizar(p: Partial<Parameters<typeof ProgresoSubida>[0]> = {}) {
  const onCancelar = vi.fn()
  render(
    <ProgresoSubida nombre="clase.mp4" tamanio={40 * MIB} progreso={25} estado="subiendo" onCancelar={onCancelar} {...p} />,
  )
  return { onCancelar }
}

describe('ProgresoSubida', () => {
  it('muestra un <progress> con el nombre del archivo como nombre accesible, valor y máximo 100', () => {
    renderizar()

    const barra = screen.getByRole('progressbar', { name: 'clase.mp4' })
    expect(barra.tagName).toBe('PROGRESS')
    expect(barra).toHaveAttribute('value', '25')
    expect(barra).toHaveAttribute('max', '100')
  })

  it('muestra los MiB enviados, el total y el porcentaje con formatearTamanio', () => {
    renderizar({ progreso: 25 })

    const esperado = `${formatearTamanio(10 * MIB)} de ${formatearTamanio(40 * MIB)} (25 %)`
    expect(screen.getByText(esperado)).toBeInTheDocument()
  })

  it('el texto sigue al progreso', () => {
    renderizar({ progreso: 50 })

    expect(screen.getByText(`${formatearTamanio(20 * MIB)} de ${formatearTamanio(40 * MIB)} (50 %)`)).toBeInTheDocument()
  })

  it('tiene un botón "Cancelar" que avisa al pulsarlo', async () => {
    const { onCancelar } = renderizar()

    await userEvent.click(screen.getByRole('button', { name: /^Cancelar/ }))

    expect(onCancelar).toHaveBeenCalledTimes(1)
  })

  it('"Cancelar" se opera con el teclado (Enter)', async () => {
    const { onCancelar } = renderizar()
    const user = userEvent.setup()

    await user.tab()
    expect(screen.getByRole('button', { name: /^Cancelar/ })).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(onCancelar).toHaveBeenCalledTimes(1)
  })

  it('en espera dice "En espera" y deja cancelar', () => {
    renderizar({ estado: 'esperando', progreso: 0 })

    expect(screen.getByText('En espera')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Cancelar/ })).toBeInTheDocument()
  })

  it('reintentando dice "Sin conexión, reintentando…" y deja cancelar', () => {
    renderizar({ estado: 'reintentando' })

    expect(screen.getByText('Sin conexión, reintentando…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Cancelar/ })).toBeInTheDocument()
  })

  it('finalizando dice "Finalizando…" y no ofrece "Cancelar"', () => {
    renderizar({ estado: 'finalizando', progreso: 100 })

    expect(screen.getByText('Finalizando…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Cancelar/ })).not.toBeInTheDocument()
  })

  it('con todos los bytes enviados no ofrece "Cancelar", aunque el estado sea reintentando', () => {
    renderizar({ estado: 'reintentando', progreso: 100 })

    expect(screen.getByText('Sin conexión, reintentando…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Cancelar/ })).not.toBeInTheDocument()
  })

  it('con todos los bytes enviados no ofrece "Cancelar", sea cual sea el estado', () => {
    renderizar({ estado: 'subiendo', progreso: 100 })

    expect(screen.queryByRole('button', { name: /^Cancelar/ })).not.toBeInTheDocument()
  })

  it('con 99 % todavía se puede cancelar', () => {
    renderizar({ estado: 'reintentando', progreso: 99 })

    expect(screen.getByRole('button', { name: /^Cancelar/ })).toBeInTheDocument()
  })

  it('subiendo no dice "En espera" ni "Finalizando…"', () => {
    renderizar()

    expect(screen.queryByText('En espera')).not.toBeInTheDocument()
    expect(screen.queryByText('Finalizando…')).not.toBeInTheDocument()
    expect(screen.queryByText('Sin conexión, reintentando…')).not.toBeInTheDocument()
  })
})
