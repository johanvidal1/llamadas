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
  QUOTE_HEADLINE_SUFFIX_DEFAULT,
  renderQuotePdf,
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
  assert.ok(propuestaHits <= 2, 'no second red header on the zones page')
  assert.ok(tallText.includes('EJECUTIVO') || tallText.includes('COMERCIAL'))

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
  assert.ok(appsOverflowText.includes('EJECUTIVO') || appsOverflowText.includes('COMERCIAL'))
  const footerBand = pdfTextAtY(appsOverflow).filter((item) => item.y > 0 && item.y < 36)
  const footerBandText = footerBand.map((item) => item.text).join('')
  if (footerBand.length > 0) {
    assert.ok(
      footerBandText.includes('EJECUTIVO') || footerBandText.includes('COMERCIAL') || footerBandText.includes('CEL'),
      'footer band still has the navy bar text'
    )
    assert.equal(
      /Facebook|WhatsApp|Aplicaciones|MAX NEGOCIOS/i.test(footerBandText),
      false,
      'apps rows must not paint into the footer y-range'
    )
  }
  assert.ok((appsOverflowText.split('PROPUESTA').length - 1) <= 2, 'page 2 chrome is navy footer only')

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
  assert.ok(roamKeepText.includes('EJECUTIVO') || roamKeepText.includes('COMERCIAL'))
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
  assert.ok((sixteenText.split('PROPUESTA').length - 1) <= 2, 'zones page keeps the navy footer, no second red header')

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
  assert.ok(dualText.includes('nueva'))
  assert.ok(dualText.includes('porta'))
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

  console.log('\nquote PDF smoke test ok')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
