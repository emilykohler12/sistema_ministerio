import { Card } from '@/shared/components/ui/Card'

export function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-primary-800">{value.toLocaleString('es-AR')}</p>
    </Card>
  )
}
