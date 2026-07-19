/**
 * Prepend a release entry to frontend/src/content/releaseNotes.ts (RELEASES).
 * Does NOT commit or deploy.
 *
 * Interactive:
 *   npm run release-notes
 *
 * Flags:
 *   npm run release-notes -- --date 2026-07-20 --item "Cambio A" --item "Cambio B"
 */

import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RELEASE_NOTES_PATH = path.resolve(__dirname, '../src/content/releaseNotes.ts')

const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

function todayIso() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dateLabelEs(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) throw new Error(`Fecha inválida: ${isoDate} (usa YYYY-MM-DD)`)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`Fecha inválida: ${isoDate}`)
  }
  return `${day} de ${MONTHS_ES[month - 1]} de ${year}`
}

function parseArgs(argv) {
  let date = null
  const items = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--date') {
      date = argv[++i]
      if (!date) throw new Error('--date requiere YYYY-MM-DD')
    } else if (arg === '--item') {
      const item = argv[++i]
      if (!item) throw new Error('--item requiere un texto')
      items.push(item)
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage:
  npm run release-notes
  npm run release-notes -- --date YYYY-MM-DD --item "..." [--item "..."]`)
      process.exit(0)
    } else {
      throw new Error(`Argumento desconocido: ${arg}`)
    }
  }
  return { date, items }
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve))
}

async function promptInteractive() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    const defaultDate = todayIso()
    const dateRaw = (await ask(rl, `Fecha ISO [${defaultDate}]: `)).trim()
    const date = dateRaw || defaultDate
    dateLabelEs(date) // validate early

    console.log('Bullets (una por línea; línea vacía para terminar):')
    const items = []
    while (true) {
      const line = (await ask(rl, `  ${items.length + 1}. `)).trim()
      if (!line) break
      items.push(line)
    }
    return { date, items }
  } finally {
    rl.close()
  }
}

function escapeTsString(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function formatReleaseBlock({ date, dateLabel, items }) {
  const itemLines = items.map((item) => `      '${escapeTsString(item)}',`).join('\n')
  return `  {
    date: '${date}',
    dateLabel: '${escapeTsString(dateLabel)}',
    items: [
${itemLines}
    ],
  },`
}

function prependRelease(fileContent, release) {
  const marker = 'export const RELEASES: ReleaseNotes[] = ['
  const idx = fileContent.indexOf(marker)
  if (idx === -1) {
    throw new Error(`No se encontró "${marker}" en ${RELEASE_NOTES_PATH}`)
  }

  const dateMatches = [...fileContent.matchAll(/date:\s*'(\d{4}-\d{2}-\d{2})'/g)].map((m) => m[1])
  if (dateMatches.includes(release.date)) {
    throw new Error(`Ya existe una entrada con date '${release.date}'. Elige otra fecha.`)
  }

  const insertAt = idx + marker.length
  const block = `\n${formatReleaseBlock(release)}`
  return fileContent.slice(0, insertAt) + block + fileContent.slice(insertAt)
}

async function main() {
  const flagged = parseArgs(process.argv.slice(2))
  const useFlags = flagged.date != null || flagged.items.length > 0

  let date
  let items
  if (useFlags) {
    if (!flagged.date) throw new Error('Con flags, --date es obligatorio')
    if (flagged.items.length === 0) throw new Error('Con flags, al menos un --item es obligatorio')
    date = flagged.date
    items = flagged.items
  } else {
    ;({ date, items } = await promptInteractive())
  }

  if (items.length === 0) {
    throw new Error('Se necesita al menos un bullet')
  }

  const dateLabel = dateLabelEs(date)
  const original = fs.readFileSync(RELEASE_NOTES_PATH, 'utf8')
  const updated = prependRelease(original, { date, dateLabel, items })
  fs.writeFileSync(RELEASE_NOTES_PATH, updated, 'utf8')

  console.log(`OK: añadido release ${date} (${dateLabel}) con ${items.length} item(s).`)
  console.log(`Archivo: ${RELEASE_NOTES_PATH}`)
  console.log('Recuerda commit/push/deploy manualmente.')
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
