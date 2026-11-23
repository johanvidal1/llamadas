import { useRef, useState, type CSSProperties } from 'react'
import { toBlob } from 'html-to-image'
import toast from 'react-hot-toast'
import { Download } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { OfferPlanTable } from '../api/client'
import { saveBlobWithPicker } from '../lib/downloadFile'
import {
  catalogBenefitLabels,
  catalogCellStyle,
  catalogCellValue,
  catalogHeaderStyle,
  catalogPngFilename,
  catalogPriceHeader,
} from '../lib/offerPlanSheet'

type Props = {
  table: OfferPlanTable | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SHEET_FONT = 'Calibri, Arial, sans-serif'
const GRID_LINE = '#C8C8C8'

async function tableToPngBlob(table: HTMLTableElement): Promise<Blob> {
  const wrap = document.createElement('div')
  wrap.setAttribute('aria-hidden', 'true')
  wrap.style.cssText =
    'position:fixed;left:0;top:0;z-index:-1;opacity:0;pointer-events:none;background:#ffffff;'
  const clone = table.cloneNode(true) as HTMLTableElement
  clone.querySelectorAll<HTMLElement>('[data-sticky]').forEach((el) => {
    el.style.position = 'static'
    el.style.left = 'auto'
    el.style.top = 'auto'
    el.style.zIndex = 'auto'
  })
  wrap.appendChild(clone)
  document.body.appendChild(wrap)
  try {
    const blob = await toBlob(clone, {
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      cacheBust: true,
    })
    if (!blob) throw new Error('empty-png')
    return blob
  } finally {
    wrap.remove()
  }
}

function cellBox(fill: string | null, ink: string | null, extra?: CSSProperties): CSSProperties {
  return {
    backgroundColor: fill ?? '#ffffff',
    color: ink ?? undefined,
    border: `1px solid ${GRID_LINE}`,
    padding: '6px 10px',
    whiteSpace: 'nowrap',
    fontFamily: SHEET_FONT,
    fontSize: 12,
    lineHeight: 1.3,
    ...extra,
  }
}

export default function OfferPlanSheetModal({ table, open, onOpenChange }: Props) {
  const sheetRef = useRef<HTMLTableElement>(null)
  const [downloading, setDownloading] = useState(false)
  const empty = !table || table.plans.length === 0
  const priceHeader = table ? catalogPriceHeader(table.plans) : 'Precio (S/)'
  const labels = table ? catalogBenefitLabels(table.plans) : []
  const headerStyle = table ? catalogHeaderStyle(table.plans) : { fill: null, ink: null }

  async function downloadPng() {
    if (!table || empty) return
    const node = sheetRef.current
    if (!node) {
      toast.error('No se pudo generar la imagen')
      return
    }
    setDownloading(true)
    try {
      const blob = await tableToPngBlob(node)
      const saved = await saveBlobWithPicker(blob, catalogPngFilename(table.name), {
        onLocked: (message) => toast.error(message),
      })
      if (saved) toast.success('Imagen descargada')
    } catch (err) {
      console.error(err)
      toast.error('No se pudo generar la imagen')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,calc(100vh-2rem))] w-[min(1120px,calc(100vw-2rem))] max-w-[min(1120px,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-1 border-b border-gray-200 px-4 py-3 pr-12 text-left">
          <DialogTitle className="truncate">{table?.name ?? 'Planes de propuesta'}</DialogTitle>
          <DialogDescription className="sr-only">
            Vista de la hoja del catálogo, con las columnas del Excel.
          </DialogDescription>
        </DialogHeader>

        {!table || table.plans.length === 0 ? (
          <p className="px-4 py-10 text-sm text-gray-500">Esta tabla no tiene planes.</p>
        ) : (
          <div className="min-h-0 min-w-0 flex-1 overflow-auto bg-white">
            <table
              ref={sheetRef}
              className="border-collapse text-left"
              style={{ fontFamily: SHEET_FONT }}
            >
              <thead>
                <tr>
                  <th
                    data-sticky
                    scope="col"
                    className="sticky left-0 top-0 z-30"
                    style={cellBox(headerStyle.fill, headerStyle.ink, {
                      fontWeight: 700,
                      minWidth: 180,
                      position: 'sticky',
                      left: 0,
                      top: 0,
                      zIndex: 30,
                    })}
                  >
                    {priceHeader}
                  </th>
                  {labels.map((label) => (
                    <th
                      key={label}
                      scope="col"
                      className="sticky top-0 z-20"
                      style={cellBox(headerStyle.fill, headerStyle.ink, {
                        fontWeight: 700,
                        minWidth: 112,
                        position: 'sticky',
                        top: 0,
                        zIndex: 20,
                      })}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.plans.map((plan) => {
                  const nameStyle = catalogCellStyle(plan, priceHeader)
                  return (
                    <tr key={plan.id}>
                      <th
                        data-sticky
                        scope="row"
                        className="sticky left-0 z-10 text-left font-medium"
                        style={cellBox(nameStyle.fill, nameStyle.ink, {
                          minWidth: 180,
                          position: 'sticky',
                          left: 0,
                          zIndex: 10,
                          fontWeight: 600,
                        })}
                      >
                        {plan.name}
                      </th>
                      {labels.map((label) => {
                        const style = catalogCellStyle(plan, label)
                        return (
                          <td key={label} style={cellBox(style.fill, style.ink, { minWidth: 112 })}>
                            {catalogCellValue(plan, label, priceHeader)}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex shrink-0 justify-end gap-2 border-t border-gray-200 px-4 py-3">
          {empty ? null : (
            <Button
              type="button"
              size="sm"
              onClick={() => void downloadPng()}
              disabled={downloading}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              <Download />
              {downloading ? 'Generando…' : 'Descargar imagen'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
