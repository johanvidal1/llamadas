import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { quoteLineTotal, quotePdfFilename, renderQuotePdf, type QuotePdfInput } from './quotePdf'

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

function mediaBox(pdf: Buffer): { width: number; height: number } {
  const match = pdf.toString('latin1').match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/)
  return { width: Number(match?.[1] ?? 0), height: Number(match?.[2] ?? 0) }
}

/** pdfkit writes WinAnsi text as hex or literal strings, often split on the first glyph. */
function pdfText(pdf: Buffer): string {
  const raw = pdf.toString('latin1')
  const parts: string[] = []
  const re = /<([0-9A-Fa-f]{2,})>|\((?:\\\)|[^)])*\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(raw))) {
    if (match[1]) {
      if (match[1].length % 2 === 0) parts.push(Buffer.from(match[1], 'hex').toString('latin1'))
      continue
    }
    parts.push(match[0].slice(1, -1).replace(/\\(.)/g, '$1'))
  }
  return parts.join('')
}

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
    benefits: [
      { label: 'Min/SMS nacionales', value: 'ILIMITADO' },
      { label: 'Full Claro (GB)', value: '45 GB' },
      { label: 'Portabilidad base (GB)', value: '20 GB' },
      { label: 'Portabilidad Full Claro (GB)', value: '30 GB' },
    ],
    ...overrides,
  }
}

async function main() {
  section('line total keeps cents')
  assert.equal(quoteLineTotal(29.9, 3), 89.7)

  section('one page holds a short proposal and ignores remote images')
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
  assert.equal(pageCount(pdf), 1)
  assert.ok(text.includes('Optick'))
  assert.ok(text.includes('al mes'))
  assert.ok(text.includes('MAX Negocios'))
  assert.ok(text.includes('MAX NEGOCIOS+ 29.9'))
  assert.ok(text.includes('Propuesta'))
  assert.ok(text.includes('Ana'))
  assert.ok(text.includes('999111222'))
  assert.equal(text.includes('999888777'), false)
  assert.ok(text.includes('Full Claro'))
  assert.ok(text.includes('tabilidad'))
  assert.ok(text.includes('Empresa PRO'))
  assert.equal(text.includes('Precio mensual'), false)
  assert.equal(text.includes('example.com'), false)
  assert.equal(text.toLowerCase().includes('prueba'), false)
  assert.equal(text.toLowerCase().includes('borrador'), false)

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
          benefits: sample().benefits,
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
            { label: 'Portabilidad base (GB)', value: '25 GB' },
            { label: 'Full Claro (GB)', value: '55 GB' },
          ],
        },
      ],
    }),
    { compress: false }
  )
  const comparedText = pdfText(compared)
  assert.ok(comparedText.includes('Propuesta'))
  assert.ok(comparedText.includes('MAX NEGOCIOS+ 39.9'))
  assert.ok(comparedText.includes('al mes'))
  assert.ok(comparedText.includes('Precio'))
  assert.equal(comparedText.includes('MAX ILIMITADO + 289.9'), false)
  assert.equal(comparedText.includes('MAX ILIMITADO + 189.9'), false)

  section('preview filename carries prueba; the registrar name does not')
  const previewName = quotePdfFilename('20123456789', 'Plan 69.90', true)
  const registrarName = quotePdfFilename('20123456789', 'Plan 69.90', false)
  assert.equal(previewName, 'Propuesta-prueba-20123456789-Plan-69-90.pdf')
  assert.equal(registrarName, 'Propuesta-20123456789-Plan-69-90.pdf')
  assert.equal(registrarName.includes('prueba'), false)
  assert.equal(text.toLowerCase().includes('prueba'), false)
  assert.equal(text.toLowerCase().includes('borrador'), false)

  section('eleven excel columns and four rows stay on one portrait page')
  const headers = [
    'Min/SMS nacionales',
    'Min internacionales',
    'Internet base (GB)',
    'Full Claro (GB)',
    'Portabilidad base (GB)',
    'Portabilidad Full Claro (GB)',
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
    cells: {
      'Precio (S/)': '#B9280B',
      'Full Claro (GB)': '#FFF0E9',
      'Portabilidad Full Claro (GB)': '#FFF0E9',
    },
  }
  const names = ['MAX NEGOCIOS+ 29.9', 'MAX NEGOCIOS+ 39.9', 'MAX NEGOCIOS+ 49.9', 'MAX ILIMITADO + 69.9']
  const wide = await renderQuotePdf(
    sample({
      senderPhone: '',
      planRows: names.map((name, index) => ({
        name,
        priceSoles: 29.9 + index,
        lines: index === 0 ? 5 : 1,
        monthlySoles: index === 0 ? quoteLineTotal(29.9, 5) : 29.9 + index,
        proposed: index === 0,
        colors,
        benefits: headers.map((label) => ({
          label,
          value: label.startsWith('Apps') ? 'Facebook, Messenger, Threads, Instagram, WhatsApp.' : 'ILIMITADO',
        })),
      })),
    }),
    { compress: false }
  )
  const wideBox = mediaBox(wide)
  const wideText = pdfText(wide)
  assert.ok(wideBox.height > wideBox.width)
  assert.equal(pageCount(wide), 1)
  assert.ok(wideText.includes('Precio (S/)'))
  assert.ok(wideText.includes('Portabilidad Full Claro'))
  assert.ok(wideText.includes('Cobertura internacional SMS'))
  assert.ok(wideText.includes('MAX ILIMITADO + 69.9'))
  assert.ok(wideText.includes('Propuesta: MAX NEGOCIOS+ 29.9'))
  assert.equal(wideText.includes('999111222'), false)
  assert.equal(wideText.toLowerCase().includes('prueba'), false)
  assert.equal(wideText.toLowerCase().includes('borrador'), false)

  console.log('\nquote PDF smoke test ok')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
