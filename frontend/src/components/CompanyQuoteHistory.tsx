import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { getCompanyQuotes } from '../api/client'
import { formatSoles } from '../lib/proposalPlans'

function statusClass(status: string): string {
  if (status === 'VISTA') return 'bg-blue-50 text-blue-800'
  if (status === 'COMPARTIDA') return 'bg-emerald-50 text-emerald-800'
  return 'bg-gray-100 text-gray-700'
}

export default function CompanyQuoteHistory({
  companyId,
  nuevo,
}: {
  companyId: string
  nuevo: boolean
}) {
  const { data: quotes = [], isLoading, isError } = useQuery({
    queryKey: ['company-quotes', companyId],
    queryFn: () => getCompanyQuotes(companyId),
    enabled: Boolean(companyId),
  })

  const titleClass = nuevo
    ? 'text-[11px] font-medium text-muted-foreground'
    : 'text-[10px] font-bold text-gray-400 uppercase tracking-widest'
  const shell = nuevo
    ? 'rounded-xl border border-border/60 bg-card text-card-foreground shadow-sm p-4'
    : 'bg-white border border-gray-200 rounded-lg p-4'
  const muted = nuevo ? 'text-muted-foreground' : 'text-gray-500'

  return (
    <section className={shell} aria-label="Propuestas">
      <p className={titleClass}>Propuestas</p>
      {isLoading ? (
        <div className="mt-2 h-8 animate-pulse rounded bg-gray-100" />
      ) : isError ? (
        <p className="mt-2 text-sm text-red-600">No se pudo cargar las propuestas.</p>
      ) : quotes.length === 0 ? (
        <p className={`mt-2 text-sm ${muted}`}>Sin propuestas generadas.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {quotes.map((quote) => {
            const when = new Date(quote.createdAt)
            const dateLabel = Number.isNaN(when.getTime())
              ? ''
              : format(when, "d MMM yyyy, HH:mm", { locale: es })
            return (
              <li key={quote.id} className="flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium leading-snug break-words">{quote.planName}</p>
                  <p className={`text-xs ${muted}`}>
                    {dateLabel}
                    {quote.lines ? ` · ${quote.lines === 1 ? '1 línea' : `${quote.lines} líneas`}` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold tabular-nums">{formatSoles(quote.totalSoles)}</p>
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass(quote.status)}`}>
                    {quote.statusLabel}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
