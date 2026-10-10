import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Breadcrumb } from './Breadcrumb'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Breadcrumb', () => {
  it('con dos labels iguales no repite la key de React', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <MemoryRouter>
        <Breadcrumb
          items={[
            { label: 'Talleres', to: '/admin/talleres' },
            { label: 'Robótica', to: '/admin/talleres/1/2' },
            { label: 'Robótica' },
          ]}
        />
      </MemoryRouter>,
    )

    expect(screen.getAllByText('Robótica')).toHaveLength(2)
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('marca el último elemento como página actual', () => {
    render(
      <MemoryRouter>
        <Breadcrumb items={[{ label: 'Normativas', to: '/admin/normativas' }, { label: 'Nueva Normativa' }]} />
      </MemoryRouter>,
    )

    expect(screen.getByText('Nueva Normativa')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Normativas' })).toHaveAttribute('href', '/admin/normativas')
  })
})
