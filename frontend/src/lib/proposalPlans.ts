export type ProposalLine = {
  plan?: string | null
  rentaBasica?: string | null
  rentaBasicaConDesc?: string | null
}

export type CurrentPlanGroup = {
  plan: string
  rentaBasica: string
  rentaConDesc: string
  count: number
}

export type ProposalBenefit = {
  label: string
  value: string
}

export function groupCurrentPlans(lines: ProposalLine[]): CurrentPlanGroup[] {
  const groups: CurrentPlanGroup[] = []
  const index = new Map<string, CurrentPlanGroup>()
  for (const line of lines) {
    const plan = (line.plan ?? '').trim()
    const rentaBasica = (line.rentaBasica ?? '').trim()
    const rentaConDesc = (line.rentaBasicaConDesc ?? '').trim()
    const key = currentPlanGroupKey({ plan, rentaBasica, rentaConDesc, count: 0 })
    const existing = index.get(key)
    if (existing) {
      existing.count += 1
      continue
    }
    const group = { plan, rentaBasica, rentaConDesc, count: 1 }
    index.set(key, group)
    groups.push(group)
  }
  return groups
}

export function currentPlanGroupKey(group: CurrentPlanGroup): string {
  return `${group.plan}\0${group.rentaBasica}\0${group.rentaConDesc}`
}

export function formatLineCount(count: number): string {
  return count === 1 ? '1 línea' : `${count} líneas`
}

/** Renta básica and discount, or '' when both are empty. */
export function formatCurrentPlanRenta(group: CurrentPlanGroup): string {
  const renta: string[] = []
  if (group.rentaBasica) renta.push(`Renta ${group.rentaBasica}`)
  if (group.rentaConDesc) renta.push(`c/desc ${group.rentaConDesc}`)
  return renta.join(' · ')
}

/** Plan name, renta only when it has text, then the line count. */
export function formatCurrentPlanGroup(group: CurrentPlanGroup): string {
  const name = group.plan || '—'
  const renta = formatCurrentPlanRenta(group)
  const count = formatLineCount(group.count)
  return renta ? `${name} · ${renta} · ${count}` : `${name} · ${count}`
}

export function isPortabilityBenefit(label: string): boolean {
  return label.toLowerCase().includes('portabilidad')
}

export function splitPortabilityBenefits(benefits: ProposalBenefit[]): {
  portability: ProposalBenefit[]
  rest: ProposalBenefit[]
} {
  const portability: ProposalBenefit[] = []
  const rest: ProposalBenefit[] = []
  for (const benefit of benefits) {
    if (isPortabilityBenefit(benefit.label)) portability.push(benefit)
    else rest.push(benefit)
  }
  return { portability, rest }
}

export function formatSoles(amount: number): string {
  return `S/ ${amount.toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function lineTotal(price: number, lines: number): number {
  const cents = Math.round(price * 100)
  return (cents * lines) / 100
}

export function buildProposalSummary(input: {
  contactName: string
  razonSocial: string
  ruc: string
  currentPlans: CurrentPlanGroup[]
  planName: string
  price: number
  lines: number
  total: number
  benefits: ProposalBenefit[]
}): string {
  const hello = input.contactName.trim() ? `Hola ${input.contactName.trim()},` : 'Hola,'
  const company = input.razonSocial.trim() || 'su empresa'
  const { portability, rest } = splitPortabilityBenefits(input.benefits)
  const current = input.currentPlans.length
    ? input.currentPlans.map((group) => `• ${formatCurrentPlanGroup(group)}`).join('\n')
    : '• Sin líneas móviles registradas'
  const lines = [
    hello,
    '',
    `Te comparto una propuesta Optick para ${company} (RUC ${input.ruc.trim() || '—'}).`,
    '',
    'Plan actual:',
    current,
    '',
    `Plan: ${input.planName}`,
    `Precio por línea: ${formatSoles(input.price)}`,
    `Líneas: ${input.lines}`,
    `Total mensual: ${formatSoles(input.total)}`,
  ]
  if (portability.length) {
    lines.push('', ...portability.map((benefit) => `${benefit.label}: ${benefit.value}`))
  }
  if (rest.length) {
    lines.push('', 'Beneficios:', ...rest.map((benefit) => `• ${benefit.label}: ${benefit.value}`))
  } else if (!portability.length) {
    lines.push('', 'Beneficios:', '• Sin beneficios listados')
  }
  return lines.join('\n')
}

/** WhatsApp and mailto carry only this line. Prices stay in the PDF. */
export function buildProposalShareText(contactName: string, url: string): string {
  const who = contactName.trim() || 'cliente'
  return `Estimado/a ${who}, le compartimos su propuesta comercial: ${url}`
}
