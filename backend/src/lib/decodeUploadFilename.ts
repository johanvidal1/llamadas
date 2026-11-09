/**
 * Multer/busboy often treats Content-Disposition filenames as Latin-1.
 * UTF-8 bytes of e.g. ñ (C3 B1) become JS chars U+00C3 U+00B1, shown as Ã±.
 *
 * Decode only when the name looks like that mojibake and latin1→utf8 yields
 * valid UTF-8 with Spanish letters. Already-correct UTF-8 is left unchanged.
 */

const MOJIBAKE_MARKERS = /\u00C3.|\u00C2./
const SPANISH_LETTERS = /[\u00E1\u00E9\u00ED\u00F3\u00FA\u00F1\u00FC\u00C1\u00C9\u00CD\u00D3\u00DA\u00D1\u00DC\u00BF\u00A1]/

/** UTF-8 misread then saved as Unicode (Ã + ñ, not multer's Ã + ±). */
const TRANSCRIBED_MOJIBAKE: [RegExp, string][] = [
  [/\u00C3\u00F1/g, '\u00F1'],
  [/\u00C3\u00E1/g, '\u00E1'],
  [/\u00C3\u00E9/g, '\u00E9'],
  [/\u00C3\u00ED/g, '\u00ED'],
  [/\u00C3\u00F3/g, '\u00F3'],
  [/\u00C3\u00FA/g, '\u00FA'],
  [/\u00C3\u00FC/g, '\u00FC'],
  [/\u00C3\u00D1/g, '\u00D1'],
  [/\u00C2\u00BF/g, '\u00BF'],
  [/\u00C2\u00A1/g, '\u00A1'],
]

function looksLikeMojibake(value: string): boolean {
  return MOJIBAKE_MARKERS.test(value)
}

function decodeTranscribedMojibake(name: string): string {
  let next = name
  for (const [pattern, replacement] of TRANSCRIBED_MOJIBAKE) {
    next = next.replace(pattern, replacement)
  }
  return next
}

export function decodeUploadFilename(name: string): string {
  if (!name) return name
  if (!looksLikeMojibake(name)) return name

  const decoded = Buffer.from(name, 'latin1').toString('utf8')
  if (!decoded.includes('\uFFFD') && decoded !== name && SPANISH_LETTERS.test(decoded)) {
    return decoded
  }

  const transcribed = decodeTranscribedMojibake(name)
  if (transcribed !== name && SPANISH_LETTERS.test(transcribed)) {
    return transcribed
  }
  return name
}
