import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import {
  bundledClaroLogoPath,
  bundledRoamingZonesPath,
  decodeHeadlineSuffixSnapshot,
  encodeHeadlineSuffixSnapshot,
  formatMixSummaryLines,
  mixHistoryPlanName,
  mobileHeadline,
  normalizeQuotePlanRows,
  quoteDiscountedLineTotal,
  quoteDiscountedUnit,
  quoteLineTotal,
  quotePdfFilename,
  quoteHeaderMetrics,
  quotePlanTableColumns,
  quoteDisplayCargo,
  formatQuoteAgentName,
  QUOTE_HEADLINE_SUFFIX_DEFAULT,
  QUOTE_DEFAULT_CARGO,
  renderQuotePdf,
  quotePage1Layout,
  QUOTE_MAP_MIN_SCALE,
  HEADER_DIVIDER_X,
  HEADER_SENDER_X,
  HEADER_SENDER_W,
  resolveQuoteSenderEmail,
  parseContactEmail,
  sanitizeQuoteSenderEmail,
  type QuotePdfInput,
} from './quotePdf'
import {
  defaultQuotePlanOrigin,
  mixHasRoaming,
  normalizeQuoteDiscountPercent,
  quoteDiscountPercentsFromTenant,
  quotePlanApps,
  quotePlanAppsShort,
  displayDatosBenefit,
  quotePlanData,
  quotePlanInternet,
} from './quoteDiscount'

function section(name: string) {
  console.log(`\n• ${name}`)
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

function pageCount(pdf: Buffer): number {
  const matches = pdf.toString('latin1').match(/\/Type \/Page(?!s)/g)
  return matches?.length ?? 0
}

/** pdfkit Tm y is PDF space (origin bottom-left). Footer band is y < FOOTER_H. */
function pdfTextAtY(pdf: Buffer): { text: string; y: number }[] {
  const raw = pdf.toString('latin1')
  const items: { text: string; y: number }[] = []
  const headerRe = /<<\r?\n\/Length (\d+)\r?\n>>\r?\nstream\r?\n/g
  let header: RegExpExecArray | null
  while ((header = headerRe.exec(raw))) {
    const stream = raw.slice(header.index + header[0].length, header.index + header[0].length + Number(header[1]))
    let y = 0
    const opRe = /1 0 0 1 [0-9.]+ ([0-9.]+) Tm|([0-9.]+) ([0-9.]+) Td|<([0-9A-Fa-f]{2,})>|\((?:\\\)|[^)])*\)/g
    let match: RegExpExecArray | null
    while ((match = opRe.exec(stream))) {
      if (match[1]) {
        y = Number(match[1])
        continue
      }
      if (match[2] && match[3]) {
        y += Number(match[3])
        continue
      }
      if (match[4]) {
        if (match[4].length % 2 === 0) items.push({ text: Buffer.from(match[4], 'hex').toString('latin1'), y })
        continue
      }
      items.push({ text: match[0].slice(1, -1).replace(/\\(.)/g, '$1'), y })
    }
  }
  return items
}

function pdfPageTexts(pdf: Buffer): string[] {
  const raw = pdf.toString('latin1')
  const pages: string[] = []
  const headerRe = /<<\r?\n\/Length (\d+)\r?\n>>\r?\nstream\r?\n/g
  let header: RegExpExecArray | null
  const tokenRe = /<([0-9A-Fa-f]{2,})>|\((?:\\\)|[^)])*\)/g
  while ((header = headerRe.exec(raw))) {
    const stream = raw.slice(header.index + header[0].length, header.index + header[0].length + Number(header[1]))
    const parts: string[] = []
    tokenRe.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = tokenRe.exec(stream))) {
      if (match[1]) {
        if (match[1].length % 2 === 0) parts.push(Buffer.from(match[1], 'hex').toString('latin1'))
        continue
      }
      parts.push(match[0].slice(1, -1).replace(/\\(.)/g, '$1'))
    }
    const text = parts.join('')
    if (/PROPUESTA|FACTUR|Ejecutivo|PLAN/.test(text)) pages.push(text)
  }
  return pages
}

function shortStampLines(pdf: Buffer): { y: number; width: number }[] {
  const raw = pdf.toString('latin1')
  // Stroked straight lines only (rounded-rect fills also start with `m` + `l`).
  const re = /([0-9.]+) ([0-9.]+) m\r?\n([0-9.]+) ([0-9.]+) l\r?\nS/g
  const out: { y: number; width: number }[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(raw))) {
    const y1 = Number(match[2])
    const y2 = Number(match[4])
    if (Math.abs(y2 - y1) > 0.5) continue
    const width = Math.abs(Number(match[3]) - Number(match[1]))
    if (width >= 140 && width <= 160) out.push({ y: y1, width })
  }
  return out
}

const TEST_PAGE_W = 595.28
const TEST_PAGE_H = 841.89
const TEST_MARGIN_X = 40
const CONTENT_W_TEST = TEST_PAGE_W - TEST_MARGIN_X * 2

type PageGeometry = {
  /** White vertical divider in the page-1 header (x, top-down y span) or null. */
  divider: { x: number; yTop: number; yBottom: number } | null
  /** Text runs with left x and baseline y (top-down). */
  texts: { x: number; y: number; hex: string }[]
  /** Image bottoms (top-down) for pictures wider than half the content area. */
  wideImageBottoms: number[]
  /** Widths of those same pictures. */
  wideImageWidths: number[]
}

/** One entry per page content stream, in page order (uncompressed PDFs only). */
function pdfPageGeometries(pdf: Buffer): PageGeometry[] {
  const raw = pdf.toString('latin1')
  const out: PageGeometry[] = []
  const headerRe = /<<\r?\n\/Length (\d+)\r?\n>>\r?\nstream\r?\n/g
  let header: RegExpExecArray | null
  while ((header = headerRe.exec(raw))) {
    const stream = raw.slice(header.index + header[0].length, header.index + header[0].length + Number(header[1]))
    if (!/ Tf/.test(stream)) continue
    let divider: PageGeometry['divider'] = null
    for (const m of stream.matchAll(/([0-9.]+) ([0-9.]+) m\r?\n([0-9.]+) ([0-9.]+) l/g)) {
      if (Math.abs(Number(m[1]) - Number(m[3])) > 0.01) continue
      const y1 = Number(m[2])
      const y2 = Number(m[4])
      if (Math.abs(y2 - y1) < 20) continue
      divider = { x: Number(m[1]), yTop: Math.min(y1, y2), yBottom: Math.max(y1, y2) }
    }
    const texts: PageGeometry['texts'] = []
    for (const m of stream.matchAll(/1 0 0 1 ([0-9.]+) ([0-9.]+) Tm\r?\n\/F\d+ [0-9.]+ Tf\r?\n\[<([0-9A-Fa-f]+)>/g)) {
      texts.push({ x: Number(m[1]), y: TEST_PAGE_H - Number(m[2]), hex: m[3] })
    }
    const wideImageBottoms: number[] = []
    const wideImageWidths: number[] = []
    for (const m of stream.matchAll(/([0-9.]+) 0 0 -([0-9.]+) [0-9.]+ ([0-9.]+) cm\r?\n\/I\d+ Do/g)) {
      if (Number(m[1]) > 250) {
        wideImageBottoms.push(Number(m[3]))
        wideImageWidths.push(Number(m[1]))
      }
    }
    out.push({ divider, texts, wideImageBottoms, wideImageWidths })
  }
  return out
}

const ANA_HEX = Buffer.from('Ana', 'latin1').toString('hex')

function stampNameRuns(page: PageGeometry) {
  return page.texts.filter((item) => item.hex.toLowerCase().startsWith(ANA_HEX))
}

function mediaBox(pdf: Buffer): { width: number; height: number } {
  const match = pdf.toString('latin1').match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/)
  return { width: Number(match?.[1] ?? 0), height: Number(match?.[2] ?? 0) }
}

/** pdfkit writes WinAnsi text as hex or literal strings, often split on the first glyph. */
function pdfText(pdf: Buffer): string {
  const raw = pdf.toString('latin1')
  // Slice by /Length so PNG image bytes cannot fake `endstream` and swallow text.
  const parts: string[] = []
  const headerRe = /<<\r?\n\/Length (\d+)\r?\n>>\r?\nstream\r?\n/g
  let header: RegExpExecArray | null
  const tokenRe = /<([0-9A-Fa-f]{2,})>|\((?:\\\)|[^)])*\)/g
  while ((header = headerRe.exec(raw))) {
    const stream = raw.slice(header.index + header[0].length, header.index + header[0].length + Number(header[1]))
    tokenRe.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = tokenRe.exec(stream))) {
      if (match[1]) {
        if (match[1].length % 2 === 0) parts.push(Buffer.from(match[1], 'hex').toString('latin1'))
        continue
      }
      parts.push(match[0].slice(1, -1).replace(/\\(.)/g, '$1'))
    }
  }
  return parts.join('')
}

const CATALOG_BENEFITS = [
  { label: 'Min/SMS nacionales', value: 'ILIMITADO' },
  { label: 'Internet base (GB)', value: '20 GB' },
  { label: 'Full Claro (GB)', value: '45 GB' },
  { label: 'Apps incluidas', value: 'Facebook, Messenger, Instagram, WhatsApp.' },
  { label: 'Cobertura internacional min', value: '300 min' },
  { label: 'Cobertura internacional internet', value: '3 GB' },
  { label: 'Cobertura internacional SMS', value: '300 SMS' },
]

function sample(overrides: Partial<QuotePdfInput> = {}): QuotePdfInput {
  return {
    greeting: 'Estimado/a, gracias por su tiempo. Le presentamos la propuesta comercial de Optick.',
    farewell: 'Quedamos atentos para acompañarle en el siguiente paso. Optick.',
    companyName: 'ACME SAC',
    contactName: 'María',
    ruc: '20123456789',
    phone: '999888777',
    email: 'maria@acme.pe',
    currentPlans: [{ plan: 'Empresa PRO 2.0 36.9', rentaBasica: '', rentaConDesc: '', count: 3 }],
    planName: 'MAX NEGOCIOS+ 29.9',
    priceSoles: 29.9,
    lines: 3,
    totalSoles: quoteLineTotal(29.9, 3),
    tableName: 'MAX Negocios',
    senderName: 'Ana Pérez',
    senderPhone: '999111222',
    discountPercent: 0,
    benefits: CATALOG_BENEFITS,
    ...overrides,
  }
}

async function main() {
  section('line total keeps cents and discount does not invent 50%')
  assert.equal(quoteLineTotal(29.9, 3), 89.7)
  assert.equal(quoteDiscountedUnit(29.9, 0), 29.9)
  assert.equal(quoteDiscountedUnit(29.9, 50), 14.95)
  assert.equal(quoteDiscountedUnit(159.9, 50), 79.95)
  assert.equal(quoteDiscountedLineTotal(29.9, 3, 50), 44.85)
  assert.equal(quoteDiscountedLineTotal(29.9, 3, 0), 89.7)
  assert.equal(normalizeQuoteDiscountPercent(50), 50)
  assert.equal(normalizeQuoteDiscountPercent(0), 0)
  assert.equal(normalizeQuoteDiscountPercent(17), 0)
  assert.equal(normalizeQuoteDiscountPercent(50, [25]), 0)
  assert.deepEqual(quoteDiscountPercentsFromTenant(undefined), [25, 50])
  assert.deepEqual(quoteDiscountPercentsFromTenant([50, 25, 30]), [25, 50])
  assert.deepEqual(quoteDiscountPercentsFromTenant([]), [])
  assert.equal(quotePlanInternet(CATALOG_BENEFITS, 'nueva'), '20 GB')
  assert.equal(quotePlanData(CATALOG_BENEFITS, 'nueva'), '45 GB')
  assert.equal(
    quotePlanInternet([{ label: 'Lineas nueva Gbs', value: '30 GB' }], 'nueva'),
    '30 GB'
  )
  assert.equal(
    quotePlanData([{ label: 'Lineass nuevas Internet', value: '30 GB' }], 'nueva'),
    '30 GB'
  )
  assert.equal(
    quotePlanData([{ label: 'Portabilidad internet', value: '55 GB' }], 'portabilidad'),
    '55 GB'
  )
  assert.equal(
    quotePlanData([{ label: 'Portabilidad  internet', value: '55 GB' }], 'portabilidad'),
    '55 GB'
  )
  assert.equal(defaultQuotePlanOrigin(0), 'nueva')
  assert.equal(defaultQuotePlanOrigin(4), 'portabilidad')
  assert.equal(quotePlanApps(CATALOG_BENEFITS).includes('Waze'), false)
  assert.equal(quotePlanAppsShort(CATALOG_BENEFITS), 'Ilimitadas')
  assert.equal(quotePlanAppsShort([{ label: 'Apps incluidas', value: 'Ilimitadas' }]), 'Ilimitadas')
  assert.equal(mixHasRoaming([{ benefits: CATALOG_BENEFITS }]), true)
  assert.equal(
    mixHasRoaming([{ benefits: CATALOG_BENEFITS.filter((row) => !row.label.startsWith('Cobertura')) }]),
    false
  )
  assert.equal(mobileHeadline(1), `1 línea móvil ${QUOTE_HEADLINE_SUFFIX_DEFAULT}`)
  assert.equal(mobileHeadline(6), `6 líneas móviles ${QUOTE_HEADLINE_SUFFIX_DEFAULT}`)
  assert.equal(mobileHeadline(6, ''), '6 líneas móviles.')
  assert.equal(mobileHeadline(1, ''), '1 línea móvil.')
  assert.equal(
    decodeHeadlineSuffixSnapshot(encodeHeadlineSuffixSnapshot(QUOTE_HEADLINE_SUFFIX_DEFAULT)),
    QUOTE_HEADLINE_SUFFIX_DEFAULT
  )
  assert.equal(decodeHeadlineSuffixSnapshot(encodeHeadlineSuffixSnapshot('')), '')
  assert.equal(decodeHeadlineSuffixSnapshot('Estimado/a, gracias por su tiempo.'), undefined)
  assert.equal(decodeHeadlineSuffixSnapshot(''), undefined)

  section('zero discount stays CONTECH hierarchy without inventing 50% or plan actual')
  const dir = mkdtempSync(path.join(tmpdir(), 'optick-quote-'))
  const png = path.join(dir, 'pixel.png')
  writeFileSync(png, PNG)
  const pdf = await renderQuotePdf(
    sample({
      letterheadPath: 'https://example.com/letterhead.png',
      signaturePath: png,
      promoPaths: [png, 'http://example.com/promo.png'],
    }),
    { compress: false }
  )
  const text = pdfText(pdf)
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
  const box = mediaBox(pdf)
  assert.ok(box.height > box.width, 'page stays portrait')
  assert.ok(pageCount(pdf) >= 1)
  assert.ok(pageCount(pdf) <= 2)
  assert.ok(text.includes('PROPUESTA COMERCIAL') || text.includes('PROPUESTA'))
  assert.ok(text.includes('PORTABILIDAD'))
  assert.equal(text.includes('OPTICK'), false)
  assert.equal(text.includes('Optick'), false)
  assert.equal(text.includes('Estimado'), false)
  assert.equal(text.includes('Quedamos atentos'), false)
  assert.ok(text.includes('FACTURACI') || text.includes('FACTUR'))
  assert.ok(text.includes('Planes, precios') || text.includes('beneficios'))
  assert.ok(text.includes('Roaming'))
  assert.ok(text.includes('Aplicaciones') || text.includes('ilimitadas'))
  assert.ok(text.includes('MAX NEGOCIOS+ 29.9'))
  assert.ok(text.includes('Ana') || text.includes('ANA'))
  assert.ok(text.includes('999111222') || text.includes('999 111 222'))
  assert.ok(text.includes(QUOTE_DEFAULT_CARGO))
  assert.equal(text.includes('EJECUTIVO COMERCIAL'), false)
  assert.equal(text.includes('EJECUTIVO'), false)
  assert.equal(text.includes(' · porta'), false)
  assert.equal(text.includes(' · nueva'), false)
  assert.equal(text.includes('999888777'), false)
  assert.equal(text.includes('Empresa PRO'), false)
  assert.equal(text.includes('Plan actual'), false)
  assert.equal(text.includes('50%'), false)
  assert.equal(text.includes('50 %'), false)
  assert.equal(text.includes('Richard'), false)
  assert.equal(text.includes('Correo y Waze'), false)
  assert.ok(text.includes('20 GB'))
  assert.ok(text.includes('Ilimitadas'))
  assert.equal(text.includes('example.com'), false)
  assert.equal(text.toLowerCase().includes('prueba'), false)
  assert.equal(text.toLowerCase().includes('borrador'), false)
  assert.ok(text.includes('Facebook') || text.includes('WhatsApp'))
  assert.equal(text.includes('BENEFICIOS ADICIONALES'), false)
  assert.ok(text.includes('corporativas'))
  assert.ok(text.includes('portabilidad'))
  assert.ok(text.includes('INTERNET'))
  assert.ok(text.includes('TETHERING'))
  assert.ok(text.indexOf('INTERNET') < text.indexOf('TETHERING'), 'headers: INTERNET then TETHERING')

  section('50% snapshot shows badge, DCTO column and discounted mix total')
  const discounted = await renderQuotePdf(sample({ discountPercent: 50 }), { compress: false })
  const discountedText = pdfText(discounted)
  assert.ok(discountedText.includes('50%') || discountedText.includes('50 %'))
  assert.ok(discountedText.includes('DCTO') || discountedText.includes('DESCUENTO'))
  assert.ok(discountedText.includes('14.95') || discountedText.includes('14,95'))
  assert.ok(discountedText.includes('44.85') || discountedText.includes('44,85'))
  assert.equal(discountedText.includes('Empresa PRO'), false)
  assert.equal(discountedText.includes('Plan actual'), false)
  assert.equal(discountedText.includes('Richard'), false)

  section('compressed output is still a PDF')
  const compressed = await renderQuotePdf(sample())
  assert.equal(compressed.subarray(0, 5).toString(), '%PDF-')
  assert.ok(compressed.length > 500)

  section('comparison table lists only the chosen rows')
  const compared = await renderQuotePdf(
    sample({
      planRows: [
        {
          name: 'MAX NEGOCIOS+ 29.9',
          priceSoles: 29.9,
          lines: 3,
          monthlySoles: quoteLineTotal(29.9, 3),
          proposed: true,
          benefits: CATALOG_BENEFITS,
          colors: {
            title: '#B9280B',
            header: '#182333',
            headerText: '#FFFFFF',
            priceHeader: 'Precio (S/)',
            row: null,
            cells: {
              'Precio (S/)': '#B9280B',
              'Full Claro (GB)': '#FFF0E9',
            },
          },
        },
        {
          name: 'MAX NEGOCIOS+ 39.9',
          priceSoles: 39.9,
          lines: 1,
          monthlySoles: 39.9,
          proposed: false,
          benefits: [
            { label: 'Internet base (GB)', value: '25 GB' },
            { label: 'Apps incluidas', value: 'Facebook, WhatsApp.' },
          ],
        },
      ],
    }),
    { compress: false }
  )
  const comparedText = pdfText(compared)
  assert.ok(comparedText.includes('MAX NEGOCIOS+ 39.9'))
  assert.ok(comparedText.includes('25 GB'))
  assert.equal(comparedText.includes('MAX ILIMITADO + 289.9'), false)
  assert.equal(comparedText.includes('Plan actual'), false)
  assert.equal(comparedText.includes('OPTICK'), false)
  assert.equal(comparedText.includes('Estimado'), false)

  section('mix history name and filename use RUC only')
  assert.equal(mixHistoryPlanName([]), 'Oferta')
  assert.equal(mixHistoryPlanName(['MAX NEGOCIOS+ 29.9']), 'MAX NEGOCIOS+ 29.9')
  assert.equal(
    mixHistoryPlanName(['MAX NEGOCIOS+ 29.9', 'MAX NEGOCIOS+ 39.9', 'MAX 49.9']),
    'MAX NEGOCIOS+ 29.9 + 2 más'
  )
  const mixLines = formatMixSummaryLines([
    {
      name: 'MAX NEGOCIOS+ 29.9',
      priceSoles: 29.9,
      lines: 3,
      monthlySoles: quoteLineTotal(29.9, 3),
      proposed: false,
      benefits: [],
    },
    {
      name: 'MAX NEGOCIOS+ 39.9',
      priceSoles: 39.9,
      lines: 2,
      monthlySoles: quoteLineTotal(39.9, 2),
      proposed: false,
      benefits: [],
    },
  ])
  assert.equal(mixLines.length, 3)
  assert.ok(mixLines[0].includes('MAX NEGOCIOS+ 29.9'))
  assert.ok(mixLines[2].startsWith('Total mensual:'), true)

  section('preview filename carries prueba; the registrar name does not')
  const previewName = quotePdfFilename('20123456789', true)
  const registrarName = quotePdfFilename('20123456789', false)
  assert.equal(previewName, 'Propuesta-prueba-20123456789.pdf')
  assert.equal(registrarName, 'Propuesta-20123456789.pdf')
  assert.equal(registrarName.includes('prueba'), false)
  assert.equal(text.toLowerCase().includes('prueba'), false)
  assert.equal(text.toLowerCase().includes('borrador'), false)

  section('four mix plans stay portrait and keep catalog internet / apps')
  const headers = [
    'Min/SMS nacionales',
    'Internet base (GB)',
    'Full Claro (GB)',
    'Apps incluidas',
    'Cobertura internacional min',
    'Cobertura internacional internet',
    'Cobertura internacional SMS',
  ]
  const colors = {
    title: '#B9280B',
    header: '#182333',
    headerText: '#FFFFFF',
    priceHeader: 'Precio (S/)',
    row: null,
    cells: {},
  }
  const names = ['MAX NEGOCIOS+ 29.9', 'MAX NEGOCIOS+ 39.9', 'MAX NEGOCIOS+ 49.9', 'MAX ILIMITADO + 69.9']
  const wide = await renderQuotePdf(
    sample({
      senderPhone: '',
      discountPercent: 25,
      planRows: names.map((name, index) => ({
        name,
        priceSoles: 29.9 + index,
        lines: index === 0 ? 5 : 1,
        monthlySoles: index === 0 ? quoteLineTotal(29.9, 5) : 29.9 + index,
        proposed: index === 0,
        colors,
        benefits: headers.map((label) => ({
          label,
          value: label.startsWith('Apps')
            ? 'Facebook, Messenger, Threads, Instagram, WhatsApp.'
            : label.startsWith('Internet')
              ? `${20 + index} GB`
              : 'ILIMITADO',
        })),
      })),
    }),
    { compress: false }
  )
  const wideBox = mediaBox(wide)
  const wideText = pdfText(wide)
  assert.ok(wideBox.height > wideBox.width)
  assert.ok(pageCount(wide) >= 1)
  assert.ok(wideText.includes('MAX ILIMITADO + 69.9'))
  assert.ok(wideText.includes('25%') || wideText.includes('25 %'))
  assert.ok(wideText.includes('20 GB'))
  assert.equal(wideText.includes('Correo y Waze'), false)
  assert.equal(wideText.includes('Plan actual'), false)
  assert.equal(wideText.includes('nota de cr'), false)
  assert.equal(wideText.includes('999111222'), false)
  assert.equal(wideText.includes('999 111 222'), false)
  assert.equal(wideText.includes('OPTICK'), false)
  assert.equal(wideText.includes('Estimado'), false)
  assert.equal(wideText.toLowerCase().includes('prueba'), false)
  assert.equal(wideText.toLowerCase().includes('borrador'), false)

  section('empty headline suffix prints only the line count')
  const shortHeadline = await renderQuotePdf(sample({ headlineSuffix: '' }), { compress: false })
  const shortText = pdfText(shortHeadline)
  assert.equal(shortText.includes('corporativas'), false)
  assert.equal(shortText.includes('portabilidad'), false)

  section('custom headline suffix is snapshotted into the PDF')
  const customHeadline = await renderQuotePdf(
    sample({ headlineSuffix: 'con cobertura nacional.' }),
    { compress: false }
  )
  const customText = pdfText(customHeadline)
  assert.ok(customText.includes('cobertura') || customText.includes('nacional'))
  assert.equal(customText.includes('corporativas'), false)

  section('bundled Claro logo and roaming zones graphic exist')
  const logoPath = bundledClaroLogoPath()
  const zonesPath = bundledRoamingZonesPath()
  assert.ok(logoPath, 'bundled Claro logo path')
  assert.ok(zonesPath, 'bundled roaming zones path')
  assert.equal(existsSync(logoPath as string), true)
  assert.equal(existsSync(zonesPath as string), true)
  assert.ok((logoPath as string).endsWith('claro-empresas-logo.png'))
  assert.ok((zonesPath as string).endsWith('claro-roaming-zonas.png'))

  section('zones map omitted without roaming')
  const noRoamingBenefits = CATALOG_BENEFITS.filter((row) => !row.label.startsWith('Cobertura'))
  const noRoam = await renderQuotePdf(sample({ benefits: noRoamingBenefits }), { compress: false })
  const noRoamText = pdfText(noRoam)
  assert.equal(pageCount(noRoam), 1)
  assert.equal(noRoamText.includes('Zonas de roaming'), false)
  assert.equal(noRoamText.includes('Zonas'), false)
  assert.ok(noRoamText.includes('Roaming'))
  assert.ok(noRoamText.includes('Aplicaciones') || noRoamText.includes('ilimitadas'))

  section('long company name wraps above RUC and grows the header')
  const LONG_COMPANY =
    'INVERSIONES BOSTON FOODS EMPRESA INDIVIDUAL DE RESPONSABILIDAD LIMITADA'
  const shortHeader = quoteHeaderMetrics('ACME SAC')
  const longHeader = quoteHeaderMetrics(LONG_COMPANY)
  assert.equal(shortHeader.height, 96)
  assert.equal(shortHeader.companyLineCount, 1)
  assert.ok(longHeader.companyLineCount === 2, 'Boston Foods wraps to two lines')
  assert.equal(longHeader.lines.join(' '), LONG_COMPANY)
  assert.ok(longHeader.height > shortHeader.height, 'red band grows for the second company line')
  assert.ok(
    longHeader.rucY > longHeader.companyY + longHeader.companyHeight - 0.01,
    'RUC sits below the last company line'
  )
  const longPdf = await renderQuotePdf(
    sample({
      companyName: LONG_COMPANY,
      ruc: '20613798049',
      issuedAt: new Date('2026-11-20T12:00:00-05:00'),
      benefits: noRoamingBenefits,
    }),
    { compress: false }
  )
  const longPdfText = pdfText(longPdf)
  assert.ok(longPdfText.includes('INVERSIONES'))
  assert.ok(longPdfText.includes('BOSTON'))
  assert.ok(longPdfText.includes('RESPONSABILIDAD'))
  assert.ok(longPdfText.includes('LIMITADA'))
  assert.equal(longPdfText.includes('...'), false, 'two-line razón social is not truncated')
  assert.ok(longPdfText.includes('20613798049'))
  const longPlaced = pdfTextAtY(longPdf)
  const rucPlaced = longPlaced.filter((item) => /RUC|20613798049/.test(item.text))
  const companyPlaced = longPlaced.filter((item) =>
    /INVERSIONES|BOSTON|FOODS|EMPRESA|INDIVIDUAL|RESPONSABILIDAD|LIMITADA/.test(item.text)
  )
  assert.ok(rucPlaced.length > 0, 'RUC is painted')
  assert.ok(companyPlaced.length > 0, 'company name is painted')
  const companyBottomPdfY = Math.min(...companyPlaced.map((item) => item.y))
  const rucPdfY = Math.max(...rucPlaced.map((item) => item.y))
  assert.ok(
    companyBottomPdfY > rucPdfY,
    `company last line (pdf y ${companyBottomPdfY}) must sit above RUC (pdf y ${rucPdfY})`
  )
  assert.equal(pageCount(longPdf), 1)

  section('company name longer than three lines ellipsizes the third line')
  const hugeCompany = Array.from({ length: 24 }, () => 'RESPONSABILIDAD').join(' ')
  const hugeHeader = quoteHeaderMetrics(hugeCompany)
  assert.equal(hugeHeader.companyLineCount, 3)
  assert.equal(hugeHeader.companySize, 10, 'three lines use the 10 pt company font')
  assert.ok(hugeHeader.lines[2]?.includes('...'))
  assert.ok(hugeHeader.rucY > hugeHeader.companyY + hugeHeader.companyHeight - 0.01)

  section('short mix of 2–3 plans without roaming stays on one page')
  const threeNoRoam = await renderQuotePdf(
    sample({
      benefits: noRoamingBenefits,
      planRows: ['MAX NEGOCIOS+ 29.9', 'MAX NEGOCIOS+ 39.9', 'MAX NEGOCIOS+ 49.9'].map((name, index) => ({
        name,
        priceSoles: 29.9 + index,
        lines: 1,
        monthlySoles: 29.9 + index,
        proposed: index === 0,
        benefits: noRoamingBenefits,
      })),
    }),
    { compress: false }
  )
  assert.equal(pageCount(threeNoRoam), 1)
  const threeText = pdfText(threeNoRoam)
  assert.ok(threeText.includes('MAX NEGOCIOS+ 49.9'))
  assert.equal(threeText.includes('Zonas'), false)

  section('zones map keep-together on page 2 when mix is tall')
  const tallRows = names.map((name, index) => ({
    name,
    priceSoles: 29.9 + index,
    lines: index === 0 ? 5 : 1,
    monthlySoles: index === 0 ? quoteLineTotal(29.9, 5) : 29.9 + index,
    proposed: index === 0,
    colors,
    benefits: CATALOG_BENEFITS,
  }))
  const tall = await renderQuotePdf(
    sample({
      extras: 'Asesor posventa · Nota de crédito en el tercer mes · Portabilidad asistida',
      discountPercent: 50,
      planRows: tallRows,
    }),
    { compress: false }
  )
  const tallText = pdfText(tall)
  const tallPages = pageCount(tall)
  assert.ok(tallPages >= 2, 'tall mix with zones uses a second page')
  assert.ok(tallPages <= 3, 'zones block stays together instead of spilling extra pages')
  assert.ok(tallText.includes('Zonas de roaming') || tallText.includes('Zonas'))
  assert.ok(tallText.includes('Roaming'))
  const propuestaHits = tallText.split('PROPUESTA').length - 1
  assert.equal(propuestaHits, tallPages, 'each page including zones has red header chrome (PROPUESTA COMERCIAL)')
  assert.ok(tallText.includes('4Zonas'), 'zones title uses section badge 4')
  assert.equal(tallText.includes('2Zonas'), false, 'zones is sequential section 4, not badge 2')
  assert.equal(
    tallText.split('PORTABILIDAD').length - 1,
    1,
    'continuation header stays one-line (PORTABILIDAD MÓVIL only on page 1)'
  )
  assert.equal(tallText.includes('EJECUTIVO COMERCIAL'), false)
  assert.ok(tallText.includes(QUOTE_DEFAULT_CARGO))
  const tallPagesText = pdfPageTexts(tall)
  assert.ok(tallPagesText.length >= 2, 'tall mix exposes at least two page text streams')
  assert.ok(tallPagesText[0]?.includes(QUOTE_DEFAULT_CARGO), 'page 1 header carries the sender block')
  assert.equal(
    tallPagesText[tallPagesText.length - 1]?.includes(QUOTE_DEFAULT_CARGO),
    false,
    'no signature stamp on the last page anymore'
  )
  const tallFooter = pdfTextAtY(tall).filter((item) => item.y > 0 && item.y < 36)
  const tallFooterText = tallFooter.map((item) => item.text).join('')
  if (tallFooter.length > 0) {
    assert.equal(
      /Zonas|Andina|Europa/i.test(tallFooterText),
      false,
      'zones title+map stay above the stamp'
    )
  }

  section('apps keep-together moves §3 off the footer')
  const appsOverflowRows = Array.from({ length: 16 }, (_, index) => ({
    name: `MAX NEGOCIOS+ ${String(29.9 + index)}`,
    priceSoles: 29.9 + index,
    lines: 1,
    monthlySoles: 29.9 + index,
    proposed: index === 0,
    origin: (index % 2 === 0 ? 'portabilidad' : 'nueva') as 'portabilidad' | 'nueva',
    colors,
    benefits: CATALOG_BENEFITS,
  }))
  const appsOverflow = await renderQuotePdf(sample({ planRows: appsOverflowRows }), { compress: false })
  const appsOverflowText = pdfText(appsOverflow)
  const appsOverflowPages = pageCount(appsOverflow)
  assert.ok(appsOverflowPages >= 2, 'many mix rows need a second page so apps do not cover the footer')
  assert.ok(appsOverflowText.includes('Aplicaciones') || appsOverflowText.includes('ilimitadas'))
  assert.equal(appsOverflowText.includes('EJECUTIVO COMERCIAL'), false)
  assert.ok(appsOverflowText.includes(QUOTE_DEFAULT_CARGO))
  const footerBand = pdfTextAtY(appsOverflow).filter((item) => item.y > 0 && item.y < 36)
  const footerBandText = footerBand.map((item) => item.text).join('')
  if (footerBand.length > 0) {
    assert.equal(
      /Facebook|WhatsApp|Aplicaciones|MAX NEGOCIOS/i.test(footerBandText),
      false,
      'apps rows must not paint into the stamp y-range'
    )
  }
  assert.equal(
    appsOverflowText.split('PROPUESTA').length - 1,
    appsOverflowPages,
    'continuation pages get compact red header chrome'
  )

  section('roaming keep-together when leftover space is small')
  const roamKeepRows = Array.from({ length: 12 }, (_, index) => ({
    name: `MAX NEGOCIOS+ ${String(29.9 + index)}`,
    priceSoles: 29.9 + index,
    lines: 1,
    monthlySoles: 29.9 + index,
    proposed: index === 0,
    origin: (index % 2 === 0 ? 'portabilidad' : 'nueva') as 'portabilidad' | 'nueva',
    colors,
    benefits: CATALOG_BENEFITS,
  }))
  const roamKeep = await renderQuotePdf(sample({ planRows: roamKeepRows }), { compress: false })
  const roamKeepText = pdfText(roamKeep)
  assert.ok(pageCount(roamKeep) >= 2, 'roaming block moves whole to the next page when leftover is small')
  assert.ok(roamKeepText.includes('Roaming'))
  assert.ok(roamKeepText.includes('Aplicaciones') || roamKeepText.includes('ilimitadas'))
  assert.equal(roamKeepText.includes('EJECUTIVO COMERCIAL'), false)
  assert.ok(roamKeepText.includes(QUOTE_DEFAULT_CARGO))
  const roamFooter = pdfTextAtY(roamKeep).filter((item) => item.y > 0 && item.y < 36)
  const roamFooterText = roamFooter.map((item) => item.text).join('')
  if (roamFooter.length > 0) {
    assert.equal(/300 min|3 GB|300 SMS/i.test(roamFooterText), false, 'roaming cards stay above the footer')
  }

  section('16 unique mix plans may paginate; zones title stays glued to the map')
  const sixteenRows = Array.from({ length: 16 }, (_, index) => ({
    name: `MAX NEGOCIOS+ ${String(29.9 + index)}`,
    priceSoles: 29.9 + index,
    lines: 1,
    monthlySoles: 29.9 + index,
    proposed: index === 0,
    origin: (index % 2 === 0 ? 'portabilidad' : 'nueva') as 'portabilidad' | 'nueva',
    colors,
    benefits: CATALOG_BENEFITS,
  }))
  const sixteenPdf = await renderQuotePdf(sample({ planRows: sixteenRows }), { compress: false })
  const sixteenText = pdfText(sixteenPdf)
  const sixteenPages = pageCount(sixteenPdf)
  assert.ok(sixteenPages >= 2, '16 unique plans may paginate')
  assert.ok(sixteenText.includes('Zonas de roaming') || sixteenText.includes('Zonas'))
  assert.ok(sixteenText.includes('4Zonas'), '16-plan zones title still uses badge 4')
  assert.equal(sixteenText.includes('2Zonas'), false)
  assert.equal(
    sixteenText.split('PROPUESTA').length - 1,
    sixteenPages,
    'zones continuation page has compact red header'
  )

  section('sample with roaming prints the zones title')
  assert.ok(text.includes('Zonas de roaming') || text.includes('Zonas'))

  section('updated MAX Negocios GB headers fill DATOS and INTERNET in the PDF')
  const renamed = await renderQuotePdf(
    sample({
      benefits: [
        { label: 'Min/SMS nacionales', value: 'ILIMITADO' },
        { label: 'Lineas nueva Gbs', value: '30 GB' },
        { label: 'Lineass nuevas Internet', value: '45 GB' },
        { label: 'Portabilidad internet', value: '55 GB' },
        { label: 'Apps incluidas', value: 'WhatsApp' },
        { label: 'Cobertura internacional min', value: '30 min' },
      ],
    }),
    { compress: false }
  )
  const renamedText = pdfText(renamed)
  assert.ok(renamedText.includes('30 GB'))
  assert.ok(renamedText.includes('45 GB'))
  assert.equal(renamedText.includes('55 GB'), false)
  assert.equal(quotePlanInternet([{ label: 'Lineas nueva Gbs', value: '30 GB' }], 'nueva'), '30 GB')
  assert.equal(quotePlanData([{ label: 'Lineass nuevas Internet', value: '45 GB' }], 'nueva'), '45 GB')
  assert.equal(
    quotePlanData([{ label: 'Portabilidad internet', value: '55 GB' }], 'nueva'),
    ''
  )

  section('per-row origin keeps PORTABILIDAD MÓVIL and does not mix GB groups')
  const mixedBenefits = [
    { label: 'Min/SMS nacionales', value: 'ILIMITADO' },
    { label: 'Internet base (GB)', value: '21 GB' },
    { label: 'Full Claro (GB)', value: '41 GB' },
    { label: 'Portabilidad base (GB)', value: '52 GB' },
    { label: 'Portabilidad Full Claro (GB)', value: '62 GB' },
    { label: 'Apps incluidas', value: 'WhatsApp' },
  ]
  const dual = await renderQuotePdf(
    sample({
      planRows: [
        {
          name: 'MAX NEGOCIOS+ 29.9',
          priceSoles: 29.9,
          lines: 2,
          monthlySoles: quoteLineTotal(29.9, 2),
          proposed: false,
          origin: 'nueva',
          benefits: mixedBenefits,
        },
        {
          name: 'MAX NEGOCIOS+ 29.9',
          priceSoles: 29.9,
          lines: 3,
          monthlySoles: quoteLineTotal(29.9, 3),
          proposed: false,
          origin: 'portabilidad',
          benefits: mixedBenefits,
        },
      ],
    }),
    { compress: false }
  )
  const dualText = pdfText(dual)
  assert.ok(dualText.includes('PORTABILIDAD'))
  assert.equal(dualText.includes(' · nueva'), false)
  assert.equal(dualText.includes(' · porta'), false)
  assert.equal(dualText.includes('· nueva'), false)
  assert.equal(dualText.includes('· porta'), false)
  assert.ok(dualText.includes('21 GB'))
  assert.ok(dualText.includes('41 GB'))
  assert.ok(dualText.includes('52 GB'))
  assert.ok(dualText.includes('62 GB'))
  assert.ok(dualText.indexOf('62 GB') < dualText.indexOf('41 GB'), 'same plan: porta DATOS before nueva')
  assert.ok(dualText.indexOf('52 GB') < dualText.indexOf('21 GB'), 'same plan: porta INTERNET before nueva')

  const stored = normalizeQuotePlanRows([
    {
      name: 'MAX NEGOCIOS+ 29.9',
      priceSoles: 29.9,
      lines: 1,
      monthlySoles: 29.9,
      origin: 'portabilidad',
      benefits: mixedBenefits,
    },
    {
      name: 'MAX NEGOCIOS+ 29.9',
      priceSoles: 29.9,
      lines: 1,
      monthlySoles: 29.9,
      benefits: mixedBenefits,
    },
  ])
  assert.equal(stored[0]?.origin, 'portabilidad')
  assert.equal(stored[1]?.origin, undefined)
  assert.equal(quotePlanData(mixedBenefits, stored[0]?.origin), '62 GB')
  assert.equal(quotePlanInternet(mixedBenefits, stored[0]?.origin), '52 GB')
  assert.equal(quotePlanData(mixedBenefits, stored[1]?.origin), '41 GB')
  assert.equal(quotePlanInternet(mixedBenefits, stored[1]?.origin), '21 GB')

  section('PDF mix table follows cheapest-first then porta before nueva')
  const sortedMix = await renderQuotePdf(
    sample({
      planRows: [
        {
          name: 'PLAN-CARO',
          priceSoles: 49.9,
          lines: 1,
          monthlySoles: 49.9,
          proposed: false,
          origin: 'nueva',
          benefits: mixedBenefits,
        },
        {
          name: 'PLAN-BARATO',
          priceSoles: 29.9,
          lines: 1,
          monthlySoles: 29.9,
          proposed: false,
          origin: 'nueva',
          benefits: mixedBenefits,
        },
        {
          name: 'PLAN-MEDIO',
          priceSoles: 39.9,
          lines: 1,
          monthlySoles: 39.9,
          proposed: false,
          origin: 'portabilidad',
          benefits: mixedBenefits,
        },
        {
          name: 'PLAN-BARATO',
          priceSoles: 29.9,
          lines: 1,
          monthlySoles: 29.9,
          proposed: false,
          origin: 'portabilidad',
          benefits: mixedBenefits,
        },
      ],
    }),
    { compress: false }
  )
  const sortedText = pdfText(sortedMix)
  const barato = sortedText.indexOf('PLAN-BARATO')
  const medio = sortedText.indexOf('PLAN-MEDIO')
  const caro = sortedText.indexOf('PLAN-CARO')
  assert.ok(barato >= 0 && medio >= 0 && caro >= 0)
  assert.ok(barato < medio && medio < caro, 'PDF prints cheaper plans first')

  section('DATOS Ilimitado prints ILIMITADO; INTERNET stays as catalog')
  assert.equal(displayDatosBenefit('Ilimitado'), 'ILIMITADO')
  const datosIlimitado = await renderQuotePdf(
    sample({
      benefits: [
        { label: 'Min/SMS nacionales', value: '300 min' },
        { label: 'Internet base (GB)', value: 'Ilimitado' },
        { label: 'Full Claro (GB)', value: 'Ilimitado' },
        { label: 'Apps incluidas', value: 'WhatsApp' },
      ],
    }),
    { compress: false }
  )
  const datosText = pdfText(datosIlimitado)
  assert.ok(datosText.includes('ILIMITADO'), 'DATOS Ilimitado becomes ILIMITADO')
  assert.ok(datosText.includes('Ilimitado'), 'INTERNET Ilimitado is not uppercased')
  assert.equal(quotePlanInternet([{ label: 'Internet base (GB)', value: 'Ilimitado' }], 'nueva'), 'Ilimitado')
  assert.equal(quotePlanData([{ label: 'Full Claro (GB)', value: 'Ilimitado' }], 'nueva'), 'Ilimitado')

  section('extras print only when the agent typed them')
  const withExtras = await renderQuotePdf(
    sample({ extras: 'Asesor posventa · Nota de crédito en el tercer mes' }),
    { compress: false }
  )
  const extrasText = pdfText(withExtras)
  assert.ok(extrasText.includes('BENEFICIOS ADICIONALES') || extrasText.includes('BENEFICIOS'))
  assert.ok(extrasText.includes('Asesor posventa') || extrasText.includes('Asesor'))
  assert.equal(extrasText.includes('OPTICK'), false)
  assert.equal(extrasText.includes('Estimado'), false)
  assert.equal(extrasText.includes('Quedamos atentos'), false)

  section('PLAN header is centered; plan names stay left and omit origin tags')
  const planCol = quotePlanTableColumns(515, 0).find((col) => col.key === 'plan')
  assert.equal(planCol?.align, 'center')
  const cantCol = quotePlanTableColumns(515, 0).find((col) => col.key === 'cant')
  assert.equal(cantCol?.align, 'center')

  section('sender block is page-1 header only, with default or custom cargo')
  assert.equal(quoteDisplayCargo(''), QUOTE_DEFAULT_CARGO)
  assert.equal(quoteDisplayCargo('   '), QUOTE_DEFAULT_CARGO)
  assert.equal(quoteDisplayCargo('Consultor senior'), 'Consultor senior')
  assert.equal(formatQuoteAgentName('Ana Pérez'), 'Ana Pérez')
  assert.equal(formatQuoteAgentName('ANA PEREZ'), 'Ana Perez')
  const onePage = await renderQuotePdf(sample({ benefits: noRoamingBenefits }), { compress: false })
  const onePageText = pdfText(onePage)
  assert.equal(pageCount(onePage), 1)
  assert.ok(onePageText.includes('Ana'))
  assert.ok(onePageText.includes(QUOTE_DEFAULT_CARGO))
  assert.ok(onePageText.includes('Cel.') && onePageText.includes('999 111 222'))
  assert.equal(onePageText.includes('EJECUTIVO COMERCIAL'), false)
  assert.equal(onePageText.includes('Firma'), false)
  assert.equal(shortStampLines(onePage).length, 0, 'no horizontal signature line anymore')
  const customCargoPdf = await renderQuotePdf(
    sample({ benefits: noRoamingBenefits, senderCargo: 'Consultor senior' }),
    { compress: false }
  )
  const customCargoText = pdfText(customCargoPdf)
  assert.ok(customCargoText.includes('Consultor senior'))
  assert.equal(customCargoText.includes(QUOTE_DEFAULT_CARGO), false)
  const twoPage = await renderQuotePdf(
    sample({
      extras: 'Asesor posventa · Nota de crédito en el tercer mes · Portabilidad asistida',
      discountPercent: 50,
      planRows: tallRows,
    }),
    { compress: false }
  )
  assert.ok(pageCount(twoPage) >= 2)
  const twoPageTexts = pdfPageTexts(twoPage)
  assert.ok(twoPageTexts.length >= 2)
  assert.ok(twoPageTexts[0]?.includes(QUOTE_DEFAULT_CARGO), 'first page header has the cargo')
  assert.ok(twoPageTexts[0]?.includes('Ana'), 'first page header has the agent name')
  assert.equal(
    twoPageTexts.slice(1).some((text) => text.includes(QUOTE_DEFAULT_CARGO) || text.includes('Ana')),
    false,
    'continuation pages never repeat the sender block'
  )
  assert.equal(pdfText(twoPage).includes('EJECUTIVO COMERCIAL'), false)
  assert.equal(shortStampLines(twoPage).length, 0)

  section('header: white vertical divider, left-aligned sender block right of it')
  assert.equal(HEADER_DIVIDER_X, 450)
  assert.equal(HEADER_SENDER_X, 462)
  assert.ok(HEADER_SENDER_W >= 105 && HEADER_SENDER_W <= 112, `sender width ~105-110 (got ${HEADER_SENDER_W})`)
  assert.ok(HEADER_SENDER_X + HEADER_SENDER_W <= TEST_PAGE_W - 20, 'block stays inside the page')
  const fullSender = {
    name: 'Carlos Tenorio',
    cargo: 'Ejecutivo de ventas',
    email: 'agente1@gmail.com',
    phone: '955442084',
  }
  const withSender = await renderQuotePdf(
    sample({
      senderName: fullSender.name,
      senderCargo: fullSender.cargo,
      senderEmail: fullSender.email,
      senderPhone: fullSender.phone,
      benefits: noRoamingBenefits,
    }),
    { compress: false }
  )
  const withSenderText = pdfText(withSender)
  assert.ok(withSenderText.includes('Carlos Tenorio'))
  assert.ok(withSenderText.includes('agente1@gmail.com'))
  assert.ok(withSenderText.includes('Cel. 955 442 084'))
  assert.equal(onePageText.includes('@'), false, 'no email line when senderEmail is empty (old quotes)')
  const senderGeo = pdfPageGeometries(withSender)
  assert.equal(senderGeo.length, 1)
  const divider = senderGeo[0].divider
  assert.ok(divider, 'page 1 has the vertical divider')
  assert.ok(Math.abs(divider!.x - HEADER_DIVIDER_X) < 0.5, 'divider x ≈ 450')
  const senderHeader = quoteHeaderMetrics(sample().companyName, fullSender)
  assert.equal(senderHeader.senderLines.length, 4, 'name + cargo + email + cel')
  assert.deepEqual(
    senderHeader.senderLines.map((line) => line.size),
    [10, 9, 8, 9],
    'bold 10 / cargo 9 / email 8 / cel 9'
  )
  assert.ok(Math.abs(divider!.yTop - senderHeader.dividerTop) < 0.5)
  assert.ok(Math.abs(divider!.yBottom - senderHeader.dividerBottom) < 0.5)
  const senderRuns = senderGeo[0].texts.filter((item) => Math.abs(item.x - HEADER_SENDER_X) < 0.5)
  assert.equal(senderRuns.length, 4, 'four runs share one left edge (left-aligned, no box)')
  senderRuns.forEach((run, index) => {
    assert.ok(run.y >= divider!.yTop && run.y <= divider!.yBottom + 1, `sender run ${index} inside the divider span`)
    if (index > 0) assert.ok(run.y > senderRuns[index - 1].y, 'lines stack top-down')
  })
  const noEmailHeader = quoteHeaderMetrics('ACME SAC', { ...fullSender, email: '', phone: '' })
  assert.equal(noEmailHeader.senderLines.length, 2, 'email and cel are optional')
  const celOnlyHeader = quoteHeaderMetrics('ACME SAC', { ...fullSender, email: '' })
  assert.equal(celOnlyHeader.senderLines.length, 3)
  assert.equal(HEADER_DIVIDER_X - 10 >= 180 + 255, true, 'left column is ~258-270 pt wide')

  section('sender block fits: name wraps to 2 lines, cargo and email ellipsize, email shrinks first')
  const tallSender = quoteHeaderMetrics('ACME SAC', {
    name: 'Maria Fernanda Del Carmen Rodriguez Villanueva De La Cruz',
    cargo: 'Ejecutivo senior de cuentas corporativas y gobierno',
    email: 'maria.fernanda.rodriguez.villanueva@empresa-corporativa.com.pe',
    phone: '955442084',
  })
  const nameLines = tallSender.senderLines.filter((line) => line.font === 'Helvetica-Bold')
  assert.ok(nameLines.length <= 2, 'name wraps to at most 2 lines')
  assert.ok(nameLines[nameLines.length - 1].text.endsWith('...'), 'name ellipsizes after two lines')
  const cargoLine = tallSender.senderLines.find((line) => line.size === 9 && !line.text.startsWith('Cel.'))
  assert.ok(cargoLine?.text.endsWith('...'), 'long cargo ellipsizes')
  const emailLine = tallSender.senderLines[tallSender.senderLines.length - 2]
  assert.equal(emailLine?.size, 7.5, 'email shrinks to 7.5 before ellipsis')
  assert.ok(emailLine?.text.endsWith('...'), 'email ellipsizes after shrinking')
  assert.ok(tallSender.height >= 96, 'band never smaller than the base height')
  assert.ok(tallSender.dividerBottom >= tallSender.senderBottom - 0.01, 'divider spans the sender block')
  assert.ok(tallSender.height >= tallSender.dividerBottom + 10 - 1, 'band is padded under the content')
  const midEmail = quoteHeaderMetrics('ACME SAC', { ...fullSender, email: 'agente.ventas01@gmail.com' })
  const midEmailLine = midEmail.senderLines[midEmail.senderLines.length - 2]
  assert.ok(midEmailLine && midEmailLine.size <= 8, 'a longer email never grows past 8 pt')

  section('company name may use three lines; 10 pt then, and header grows with max(left, sender, logo)')
  const threeLineCompany =
    'INVERSIONES BOSTON FOODS EMPRESA INDIVIDUAL DE RESPONSABILIDAD LIMITADA DEL PERU Y SERVICIOS GENERALES'
  const threeHeader = quoteHeaderMetrics(threeLineCompany, fullSender)
  assert.equal(threeHeader.companySize, 10, 'three lines drop the company font to 10 pt')
  assert.ok(threeHeader.companyLineCount === 3 || threeHeader.companyLineCount === 2)
  const longHeaderFull = quoteHeaderMetrics(LONG_COMPANY, fullSender)
  assert.ok(threeHeader.height >= longHeaderFull.height - 1)
  assert.ok(threeHeader.height >= threeHeader.leftBottom + 10 - 1, 'left column drives the height')
  assert.ok(
    threeHeader.dividerBottom >= Math.max(threeHeader.leftBottom, 16 + 64),
    'divider covers the whole content height (left column or logo)'
  )
  const threePdf = await renderQuotePdf(
    sample({ companyName: threeLineCompany, senderEmail: fullSender.email, benefits: noRoamingBenefits }),
    { compress: false }
  )
  const threeGeo = pdfPageGeometries(threePdf)[0]
  const headerRuns = threeGeo.texts.filter((item) => item.y <= threeHeader.height)
  const bodyRuns = threeGeo.texts.filter((item) => item.y > threeHeader.height)
  assert.ok(headerRuns.length >= 8, 'title, company, RUC and the sender block live in the band')
  assert.ok(bodyRuns.length > 0)
  assert.ok(
    Math.min(...bodyRuns.map((item) => item.y)) >= threeHeader.height + 20,
    'content starts at the measured header height + 20 (no overlap)'
  )
  assert.ok(
    Math.max(...headerRuns.map((item) => item.y)) <= threeHeader.dividerBottom + 1,
    'header text stays within the divider span'
  )
  assert.ok(threeGeo.divider, 'divider present with the taller header')

  section('page 1: map fits for typical 2-plan quotes; rows are compact; floor 85 %')
  const mixRows = (count: number, origin = true) =>
    Array.from({ length: count }, (_, index) => ({
      name: `MAX NEGOCIOS+ ${String(29.9 + index * 10)}`,
      priceSoles: 29.9 + index * 10,
      lines: 2 + index,
      monthlySoles: quoteLineTotal(29.9 + index * 10, 2 + index),
      proposed: index === 0,
      ...(origin ? { origin: (index % 2 === 0 ? 'nueva' : 'portabilidad') as 'nueva' | 'portabilidad' } : {}),
      colors,
      benefits: CATALOG_BENEFITS,
    }))
  const fitReport: string[] = []
  for (const count of [1, 2, 3, 4]) {
    for (const withExtras of [false, true]) {
      const input = sample({
        planRows: mixRows(count),
        extras: withExtras ? 'Asesor posventa · Nota de crédito en el tercer mes · Portabilidad asistida' : '',
        senderEmail: 'ana@acme.pe',
      })
      const pdf = await renderQuotePdf(input, { compress: false })
      const geo = pdfPageGeometries(pdf)
      const layout = quotePage1Layout(input)
      const label = `plans=${count} extras=${withExtras ? 'yes' : 'no'}`
      const mapPage = geo.findIndex((page) => page.wideImageWidths.some((w) => w > 400))
      assert.ok(mapPage >= 0, `${label}: map is drawn`)
      assert.equal(geo.filter((page) => page.wideImageWidths.some((w) => w > 400)).length, 1, `${label}: map drawn once`)
      const mapW = Math.max(...geo[mapPage].wideImageWidths)
      assert.ok(mapW <= CONTENT_W_TEST + 0.5, `${label}: map never wider than the content`)
      assert.ok(mapW >= CONTENT_W_TEST * QUOTE_MAP_MIN_SCALE - 0.5, `${label}: map never below 85 % (${mapW.toFixed(1)})`)
      assert.equal(layout.mapOnPage1, mapPage === 0, `${label}: layout plan agrees with the render`)
      if (mapPage === 0) {
        assert.ok(Math.max(...geo[0].wideImageBottoms) <= TEST_PAGE_H - 20 + 0.5, `${label}: map above the floor margin`)
        assert.ok(layout.mapScale >= QUOTE_MAP_MIN_SCALE && layout.mapScale <= 1)
      } else {
        assert.ok(mapW > CONTENT_W_TEST - 0.5, `${label}: map on page 2 stays at 100 %`)
        assert.ok(mapPage >= 1)
        assert.ok(geo[mapPage].texts.length > 0)
      }
      if (count <= 2 && !withExtras) {
        assert.equal(pageCount(pdf), 1, `${label}: one page including the map`)
        assert.equal(mapPage, 0)
      }
      fitReport.push(`${label}: pages=${pageCount(pdf)} map=${mapPage + 1} scale=${(mapW / CONTENT_W_TEST).toFixed(3)}`)
    }
  }
  console.log(fitReport.map((line) => `  ${line}`).join('\n'))

  const rowA = await renderQuotePdf(sample({ planRows: mixRows(3), benefits: noRoamingBenefits }), { compress: false })
  const rowGeo = pdfPageGeometries(rowA)[0]
  const planCells = rowGeo.texts
    .filter((item) => Buffer.from(item.hex, 'hex').toString('latin1').startsWith('MAX NEGOCIOS+'))
    .map((item) => item.y)
  assert.ok(planCells.length >= 3, 'three plan rows painted')
  const rowPitch = planCells[1] - planCells[0]
  assert.ok(rowPitch >= 19.5 && rowPitch <= 20.5, `single-line rows are ~20 pt (got ${rowPitch.toFixed(2)})`)

  section('wrapped plan names keep rows tall enough: no clipping or overlap')
  const wrapRows = [
    { ...mixRows(1)[0], name: 'MAX ILIMITADO + 289.9 PLAN CORPORATIVO EXTENDIDO CON NOMBRE MUY LARGO PARA ENVOLVER' },
    { ...mixRows(2)[1], name: 'MAX NEGOCIOS+ 39.9' },
  ]
  const wrapPdf = await renderQuotePdf(sample({ planRows: wrapRows, benefits: noRoamingBenefits }), { compress: false })
  const wrapGeo = pdfPageGeometries(wrapPdf)[0]
  const wrapCells = wrapGeo.texts
    .filter((item) => /^MAX /.test(Buffer.from(item.hex, 'hex').toString('latin1')))
    .map((item) => item.y)
  assert.ok(wrapCells.length >= 2)
  assert.ok(wrapCells[wrapCells.length - 1] > wrapCells[0] + 20, 'the second row starts below the taller first row')
  assert.equal(pageCount(wrapPdf), 1)

  section('sweep: sender once, divider on page 1 only, map once, nothing below the floor')
  for (let count = 1; count <= 14; count += 1) {
    for (const extrasText of ['', 'Asesor posventa · Nota de crédito en el tercer mes · Portabilidad asistida. '.repeat(3)]) {
      const sweep = await renderQuotePdf(
        sample({ planRows: mixRows(count), extras: extrasText, senderEmail: 'ana@acme.pe' }),
        { compress: false }
      )
      const geo = pdfPageGeometries(sweep)
      const label = `rows=${count} extras=${extrasText ? 'yes' : 'no'}`
      assert.equal(geo.length, pageCount(sweep), `${label}: one stream per page`)
      assert.ok(geo[0].divider, `${label}: divider on page 1`)
      geo.slice(1).forEach((page, index) => {
        assert.equal(page.divider, null, `${label}: page ${index + 2} has no divider`)
        assert.equal(
          page.texts.some((item) => Math.abs(item.x - HEADER_SENDER_X) < 0.5),
          false,
          `${label}: page ${index + 2} has no sender block`
        )
      })
      assert.equal(geo.reduce((sum, page) => sum + stampNameRuns(page).length, 0), 1, `${label}: name once`)
      assert.equal(geo.filter((page) => page.wideImageWidths.some((w) => w > 400)).length, 1, `${label}: map once`)
      for (const page of geo) {
        assert.ok(Math.max(...page.texts.map((item) => item.y)) <= TEST_PAGE_H - 12, `${label}: text above the floor`)
        if (page.wideImageBottoms.length) {
          assert.ok(Math.max(...page.wideImageBottoms) <= TEST_PAGE_H - 20 + 0.5, `${label}: map above the floor`)
        }
      }
    }
  }

  section('Correo: profile email wins, login email is the fallback, junk is rejected')
  assert.equal(resolveQuoteSenderEmail('Ventas@Acme.PE ', 'login@x.pe'), 'ventas@acme.pe')
  assert.equal(resolveQuoteSenderEmail('', 'Login@X.pe'), 'login@x.pe')
  assert.equal(resolveQuoteSenderEmail(null, 'login@x.pe'), 'login@x.pe')
  assert.equal(resolveQuoteSenderEmail(undefined, undefined), '')
  assert.equal(sanitizeQuoteSenderEmail('a b@c.pe'), 'ab@c.pe')
  assert.deepEqual(parseContactEmail('  Ventas@Acme.PE '), { email: 'ventas@acme.pe' })
  assert.deepEqual(parseContactEmail(''), { email: null })
  assert.deepEqual(parseContactEmail('   '), { email: null })
  assert.ok('error' in parseContactEmail('no-es-correo'))
  assert.ok('error' in parseContactEmail('a@b'))
  assert.ok('error' in parseContactEmail('a b@c.pe'))
  assert.ok('error' in parseContactEmail(`${'a'.repeat(116)}@b.pe`), 'over 120 chars is rejected')
  assert.deepEqual(parseContactEmail(`${'a'.repeat(110)}@b.pe`), { email: `${'a'.repeat(110)}@b.pe` })

  console.log('\nquote PDF smoke test ok')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
