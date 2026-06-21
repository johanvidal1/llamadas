import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { AgentPresence, AgentPresenceStatus } from '../api/client'

const POPOVER_WIDTH = 288
const VIEWPORT_PADDING = 16
const GAP = 6

type HorizontalAlign = 'start' | 'end'
type VerticalPlacement = 'bottom' | 'top'

export function formatTimeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'ahora'
  if (mins === 1) return 'hace 1 min'
  return `hace ${mins} min`
}

export function formatSessionDuration(loginAt: string, lastSeenAt: string): string {
  const totalMins = Math.max(
    0,
    Math.floor((new Date(lastSeenAt).getTime() - new Date(loginAt).getTime()) / 60_000),
  )
  if (totalMins < 1) return '< 1 min'
  const hours = Math.floor(totalMins / 60)
  const mins = totalMins % 60
  if (hours === 0) return `${mins} min`
  if (mins === 0) return `${hours} h`
  return `${hours} h ${mins} min`
}

function formatPresenceDateTime(iso: string): string {
  return format(new Date(iso), 'dd/MM/yyyy HH:mm', { locale: es })
}

function presenceStatusLabel(status: AgentPresenceStatus): string {
  if (status === 'online') return 'En línea'
  if (status === 'recent') return 'Reciente'
  return 'Offline'
}

function computeHorizontalAlign(rect: DOMRect): HorizontalAlign {
  if (rect.left + POPOVER_WIDTH > window.innerWidth - VIEWPORT_PADDING) return 'end'
  if (rect.right - POPOVER_WIDTH < VIEWPORT_PADDING) return 'start'
  return 'start'
}

function computePosition(anchor: DOMRect, popoverHeight: number) {
  const horizontalAlign = computeHorizontalAlign(anchor)
  let left =
    horizontalAlign === 'end' ? anchor.right - POPOVER_WIDTH : anchor.left
  left = Math.max(
    VIEWPORT_PADDING,
    Math.min(left, window.innerWidth - POPOVER_WIDTH - VIEWPORT_PADDING),
  )

  const spaceBelow = window.innerHeight - anchor.bottom - VIEWPORT_PADDING
  const spaceAbove = anchor.top - VIEWPORT_PADDING
  let placement: VerticalPlacement = 'bottom'
  let top = anchor.bottom + GAP

  if (spaceBelow < popoverHeight && spaceAbove > spaceBelow) {
    placement = 'top'
    top = anchor.top - GAP
  }

  return { top, left, placement, horizontalAlign }
}

type PresenceDetailPopoverProps = {
  open: boolean
  anchorEl: HTMLElement | null
  presence: AgentPresence | undefined
  onClose: () => void
  onExpandDevices?: () => void
}

export function PresenceDetailPopover({
  open,
  anchorEl,
  presence,
  onClose,
  onExpandDevices,
}: PresenceDetailPopoverProps) {
  const [position, setPosition] = useState<ReturnType<typeof computePosition> | null>(null)
  const [popoverEl, setPopoverEl] = useState<HTMLDivElement | null>(null)

  const updatePosition = useCallback(() => {
    if (!anchorEl) return
    const height = popoverEl?.offsetHeight ?? 180
    setPosition(computePosition(anchorEl.getBoundingClientRect(), height))
  }, [anchorEl, popoverEl])

  useLayoutEffect(() => {
    if (!open || !anchorEl) {
      setPosition(null)
      return
    }
    updatePosition()
  }, [open, anchorEl, presence, updatePosition])

  useEffect(() => {
    if (!open) return
    const onResize = () => updatePosition()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (anchorEl?.contains(target)) return
      if (popoverEl?.contains(target)) return
      onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, anchorEl, popoverEl, onClose])

  if (!open || !anchorEl || !position) return null

  const session = presence?.sessions[0]
  const extraDevices = (presence?.sessions.length ?? 0) - 1
  const status = presence?.status ?? 'offline'

  const transform =
    position.placement === 'top' ? 'translateY(-100%)' : undefined

  return createPortal(
    <div
      ref={setPopoverEl}
      role="dialog"
      aria-label="Detalle de presencia"
      className="fixed z-[100] rounded-lg border border-gray-200 bg-white p-3 shadow-lg text-left"
      style={{
        top: position.top,
        left: position.left,
        width: POPOVER_WIDTH,
        maxWidth: `min(${POPOVER_WIDTH}px, calc(100vw - ${VIEWPORT_PADDING * 2}px))`,
        transform,
      }}
    >
      {!session ? (
        <p className="text-xs text-gray-500">Sin registro de conexión</p>
      ) : (
        <div className="space-y-2 text-xs">
          <div>
            <p className="font-semibold text-gray-900">Presencia del agente</p>
            <p className="text-gray-500 mt-0.5">
              Estado actual:{' '}
              <span
                className={`font-medium ${
                  status === 'online'
                    ? 'text-green-700'
                    : status === 'recent'
                      ? 'text-yellow-700'
                      : 'text-gray-600'
                }`}
              >
                {presenceStatusLabel(status)}
              </span>
            </p>
            {status === 'offline' && (
              <p className="text-amber-700 mt-1 font-medium">
                Sin actividad reciente · {formatTimeAgo(session.lastSeenAt)}
              </p>
            )}
          </div>

          <dl className="space-y-1.5 text-gray-600">
            <div>
              <dt className="text-gray-500">Última actividad</dt>
              <dd className={`font-medium ${status === 'offline' ? 'text-gray-900' : 'text-gray-800'}`}>
                {formatPresenceDateTime(session.lastSeenAt)}{' '}
                <span className="font-normal text-gray-500">
                  ({formatTimeAgo(session.lastSeenAt)})
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Tiempo en sesión</dt>
              <dd className="font-medium text-gray-800">
                {formatSessionDuration(session.loginAt, session.lastSeenAt)}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Navegador / SO</dt>
              <dd className="font-medium text-gray-800">
                {session.browser ?? 'Desconocido'} · {session.os ?? 'Desconocido'}
                {session.platform ? ` · ${session.platform}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">IP</dt>
              <dd className="font-medium text-gray-800">{session.ipAddress ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Última pantalla</dt>
              <dd className="font-medium text-gray-800">{session.currentRoute ?? '—'}</dd>
            </div>
          </dl>

          {extraDevices > 0 && onExpandDevices && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onExpandDevices()
              }}
              className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
            >
              + {extraDevices} dispositivo{extraDevices === 1 ? '' : 's'} más
            </button>
          )}
        </div>
      )}
    </div>,
    document.body,
  )
}
