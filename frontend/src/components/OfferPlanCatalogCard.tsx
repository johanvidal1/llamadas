import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { FileSpreadsheet, Star, Upload } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  getOfferPlanTables,
  importOfferPlanTable,
  patchOfferPlanTable,
  type OfferPlanTable,
} from '../api/client'
import { formatSoles } from '../lib/proposalPlans'

function apiError(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
  return msg ?? fallback
}

function formatTableDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function OfferPlanCatalogCard() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const qc = useQueryClient()

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ['offer-plan-tables', 'admin'],
    queryFn: () => getOfferPlanTables('admin'),
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['offer-plan-tables'] })

  const upload = useMutation({
    mutationFn: (file: File) => importOfferPlanTable(file, name),
    onSuccess: (table) => {
      setName('')
      refresh()
      toast.success(
        table.isPrincipal
          ? `Tabla «${table.name}» creada con ${table.planCount} planes. Quedó activa y principal.`
          : `Tabla «${table.name}» creada con ${table.planCount} planes. Márcala activa para que los agentes la vean.`
      )
    },
    onError: (err: unknown) => toast.error(apiError(err, 'No se pudo importar la tabla')),
  })

  const patch = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { isActive?: boolean; isPrincipal?: boolean } }) =>
      patchOfferPlanTable(id, data),
    onSuccess: () => {
      refresh()
      toast.success('Tabla actualizada')
    },
    onError: (err: unknown) => toast.error(apiError(err, 'No se pudo actualizar la tabla')),
  })

  return (
    <div className="card p-4 space-y-4">
      <div className="min-w-0">
        <h2 className="font-semibold text-gray-900">Planes de propuesta</h2>
        <p className="text-xs text-gray-500 mt-1">
          Cada Excel crea una tabla nueva, con nombre y fecha. Las anteriores se conservan. Los agentes
          solo ven las activas; la principal queda preseleccionada. Hoja{' '}
          <span className="font-mono">MAX Negocios +</span>.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre de la tabla (opcional, si no usa el archivo)"
          className="bg-white"
          maxLength={80}
        />
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) upload.mutate(file)
            e.target.value = ''
          }}
        />
        <Button
          type="button"
          size="sm"
          disabled={upload.isPending}
          onClick={() => fileRef.current?.click()}
          className="shrink-0 bg-blue-600 text-white hover:bg-blue-700"
        >
          <Upload />
          {upload.isPending ? 'Subiendo…' : 'Subir Excel'}
        </Button>
      </div>

      {isLoading ? (
        <div className="h-16 bg-gray-100 rounded-lg animate-pulse" />
      ) : tables.length === 0 ? (
        <p className="text-sm text-gray-400">Aún no hay tablas cargadas.</p>
      ) : (
        <ul className="space-y-3">
          {tables.map((table) => (
            <TableRow
              key={table.id}
              table={table}
              busy={patch.isPending}
              onActivate={() => patch.mutate({ id: table.id, data: { isActive: true } })}
              onDeactivate={() => patch.mutate({ id: table.id, data: { isActive: false } })}
              onPrincipal={() => patch.mutate({ id: table.id, data: { isPrincipal: true } })}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function TableRow({
  table,
  busy,
  onActivate,
  onDeactivate,
  onPrincipal,
}: {
  table: OfferPlanTable
  busy: boolean
  onActivate: () => void
  onDeactivate: () => void
  onPrincipal: () => void
}) {
  return (
    <li className="rounded-lg border border-gray-200">
      <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-gray-900">{table.name}</p>
            {table.isPrincipal ? (
              <Badge className="border-transparent bg-blue-600 text-white hover:bg-blue-600">
                <Star className="mr-1 size-3" />
                Principal
              </Badge>
            ) : null}
            {table.isActive ? (
              <Badge variant="secondary" className="bg-emerald-50 text-emerald-800 hover:bg-emerald-50">
                Activa
              </Badge>
            ) : (
              <Badge variant="outline" className="text-gray-500">
                Inactiva
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {formatTableDate(table.createdAt)} · {table.planCount} {table.planCount === 1 ? 'plan' : 'planes'}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {!table.isPrincipal ? (
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onPrincipal}>
              Hacer principal
            </Button>
          ) : null}
          {table.isActive && !table.isPrincipal ? (
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onDeactivate}>
              Desactivar
            </Button>
          ) : null}
          {!table.isActive ? (
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onActivate}>
              Activar
            </Button>
          ) : null}
        </div>
      </div>
      {table.plans.length > 0 ? (
        <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto border-t border-gray-100">
          {table.plans.map((plan) => (
            <li key={plan.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2 text-gray-800">
                <FileSpreadsheet size={14} className="shrink-0 text-gray-400" />
                <span className="truncate">{plan.name}</span>
              </span>
              <span className="shrink-0 font-medium tabular-nums text-gray-900">{formatSoles(plan.priceSoles)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t border-gray-100 px-3 py-2 text-sm text-gray-400">Esta tabla no tiene planes.</p>
      )}
    </li>
  )
}
