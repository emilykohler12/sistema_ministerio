import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Dialog } from '@/shared/components/ui/Dialog'
import { Label } from '@/shared/components/ui/Label'
import { FieldError } from '@/shared/components/ui/FieldError'
import { Select } from '@/shared/components/ui/Select'
import { AutocompleteInput } from '@/shared/components/ui/AutocompleteInput'
import { Button } from '@/shared/components/ui/Button'
import { useNombresInstitucionSugeridos } from '@/features/talleres/hooks/useTalleres'

const LOCALIDADES = ['Localidad 1', 'Localidad 2', 'Localidad 3', 'Localidad 4', 'Localidad 5']
const ROLES = ['Docente', 'Director/a', 'Supervisor/a', 'Otro']

const schema = z.object({
  escuela: z.string().min(2, 'Ingresá el nombre de la escuela'),
  localidad: z.string().min(1, 'Elegí tu localidad'),
  rol: z.string().min(1, 'Elegí tu rol'),
})

type FormValues = z.infer<typeof schema>

interface DescargaModalProps {
  open: boolean
  onClose: () => void
  recursoNombre: string
  recursoTipo: string
}

export function DescargaModal({ open, onClose, recursoNombre, recursoTipo }: DescargaModalProps) {
  const [enviado, setEnviado] = useState(false)
  const institucionesSugeridas = useNombresInstitucionSugeridos()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { escuela: '', localidad: '', rol: '' },
  })

  function handleClose() {
    reset()
    setEnviado(false)
    onClose()
  }

  async function onSubmit() {
    await new Promise((r) => setTimeout(r, 600))
    setEnviado(true)
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Antes de descargar"
      description={`${recursoNombre} · ${recursoTipo.toUpperCase()}`}
    >
      {enviado ? (
        <div className="py-4 text-center">
          <p className="text-sm font-medium text-green-700">¡Listo! La descarga comenzará en breve.</p>
          <Button className="mt-4" onClick={handleClose}>
            Cerrar
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div>
            <Label htmlFor="escuela">Escuela</Label>
            <AutocompleteInput
              id="escuela"
              value={watch('escuela')}
              onChange={(v) => setValue('escuela', v, { shouldValidate: true })}
              suggestions={institucionesSugeridas}
              placeholder="Nombre de la escuela"
              error={!!errors.escuela}
            />
            <FieldError id="escuela-error" message={errors.escuela?.message} />
          </div>

          <div>
            <Label htmlFor="localidad">Localidad</Label>
            <Select id="localidad" error={!!errors.localidad} {...register('localidad')}>
              <option value="">Elegí tu localidad</option>
              {LOCALIDADES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
            <FieldError id="localidad-error" message={errors.localidad?.message} />
          </div>

          <div>
            <Label htmlFor="rol">Rol</Label>
            <Select id="rol" error={!!errors.rol} {...register('rol')}>
              <option value="">Docente, director/a, supervisor/a...</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
            <FieldError id="rol-error" message={errors.rol?.message} />
          </div>

          <p className="text-xs text-gray-400">Usamos estos datos solo para estadísticas.</p>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Descargando...' : 'Descargar'}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}
