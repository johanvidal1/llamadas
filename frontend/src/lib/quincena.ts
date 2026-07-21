import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export type QuincenaHalf = 1 | 2

export type QuincenaKey = `${number}-${string}-${QuincenaHalf}`

/** Peru calendar: 1st = days 1–15, 2nd = days 16–end. */
export function getQuincenaHalf(date: Date): QuincenaHalf {
  return date.getDate() <= 15 ? 1 : 2
}

export function getQuincenaKey(date: Date): QuincenaKey {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}-${getQuincenaHalf(date)}`
}

export function formatQuincenaLabel(key: QuincenaKey): string {
  const [yearStr, monthStr, halfStr] = key.split('-')
  const year = Number(yearStr)
  const monthIndex = Number(monthStr) - 1
  const half = Number(halfStr) as QuincenaHalf
  const monthShort = format(new Date(year, monthIndex, 1), 'MMM', { locale: es })
  if (half === 1) {
    return `1–15 ${monthShort} ${year}`
  }
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  return `16–${lastDay} ${monthShort} ${year}`
}

export function compareQuincenaKeysDesc(a: QuincenaKey, b: QuincenaKey): number {
  return b.localeCompare(a)
}
