/**
 * Reads a bank transfer receipt (screenshot or photo) in the browser and pulls out
 * the transaction reference number, amount and the PIBG family code.
 * Runs on the parent's device (tesseract.js); the image is not sent anywhere for this.
 */

export interface ReceiptInfo {
  reference: string | null
  amount: number | null
  familyCode: string | null
  text: string
}

// Labels banks use for the bank's own transaction reference (EN + BM)
const REF_LABEL = new RegExp(
  [
    'reference\\s*(?:no|number|id|#)',
    'ref(?:erence)?\\.?\\s*(?:no|number|id|#)',
    'transaction\\s*(?:id|no|number|ref(?:erence)?)',
    'trans(?:action)?\\.?\\s*ref',
    'txn\\s*(?:id|no|ref)',
    'trx\\s*(?:id|no)',
    'duitnow\\s*ref(?:erence)?',
    'no\\.?\\s*rujukan(?:\\s*transaksi)?',
    'nombor\\s*rujukan',
    'rujukan\\s*transaksi',
    'id\\s*transaksi',
    'no\\.?\\s*transaksi',
  ].join('|'),
  'i',
)
// Payer-typed references (where parents write the family code) — not the bank's reference
const PAYER_REF = /(recipient|beneficiary|penerima|payment\s*details|butiran\s*bayaran|other\s*payment|your\s*reference|rujukan\s*(?:anda|penerima))/i

const looksLikeRef = (t: string) => {
  const digits = (t.match(/\d/g) || []).length
  return t.length >= 6 && t.length <= 40 && digits >= 4 && !/^RM/i.test(t) && !/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(t)
}

function cleanToken(t: string) {
  return t.replace(/^[:#\-–.\s]+/, '').replace(/[.,;:]+$/, '').replace(/\s+/g, '')
}

/** Pick the first plausible reference token from a string */
function refFrom(s: string): string | null {
  // allow references written with spaces, e.g. "2026 1031 8876 5432"
  const grouped = s.match(/[A-Z0-9][A-Z0-9\-/]*(?:\s[A-Z0-9\-/]{3,})*/gi) || []
  for (const g of grouped) {
    const t = cleanToken(g)
    if (looksLikeRef(t)) return t.toUpperCase()
  }
  return null
}

export function parseReceipt(raw: string): ReceiptInfo {
  const text = raw.replace(/\r/g, '')
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  // --- reference ---
  let reference: string | null = null
  for (let i = 0; i < lines.length && !reference; i++) {
    const line = lines[i]
    const m = line.match(REF_LABEL)
    if (!m || PAYER_REF.test(line)) continue
    const after = line.slice((m.index ?? 0) + m[0].length)
    reference = refFrom(after) ?? (lines[i + 1] && !REF_LABEL.test(lines[i + 1]) ? refFrom(lines[i + 1]) : null)
  }

  // --- amount: prefer a line mentioning amount/jumlah, else the first RM figure ---
  const money = /(?:RM|MYR)\s*([\d,]+\.\d{2})/i
  let amount: number | null = null
  const labelled = lines.find((l) => /(amount|jumlah|total|amaun)/i.test(l) && money.test(l))
  const amountLineIdx = lines.findIndex((l) => /^(amount|jumlah|amaun|total)\b/i.test(l))
  const am = (labelled && labelled.match(money))
    || (amountLineIdx >= 0 && lines[amountLineIdx + 1]?.match(money))
    || text.match(money)
  if (am) amount = Number(am[1].replace(/,/g, ''))

  // --- family code (K00012), tolerating OCR reading 0 as O ---
  const fc = text.match(/\bK[O0-9]{5}\b/i)
  const familyCode = fc ? 'K' + fc[0].slice(1).toUpperCase().replace(/O/g, '0') : null

  return { reference, amount, familyCode, text }
}

/** Downscale/greyscale large photos before OCR: faster on phones and usually more accurate */
async function prepare(file: File): Promise<HTMLCanvasElement | File> {
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scale)
    c.height = Math.round(bmp.height * scale)
    const ctx = c.getContext('2d')!
    ctx.filter = 'grayscale(1) contrast(1.2)'
    ctx.drawImage(bmp, 0, 0, c.width, c.height)
    return c
  } catch {
    return file
  }
}

export async function readReceipt(file: File, onProgress?: (pct: number) => void): Promise<ReceiptInfo> {
  const { createWorker } = await import('tesseract.js') // loaded only when needed
  const worker = await createWorker('eng', 1, {
    // served from this site (see scripts/copy-ocr-assets.mjs), not a third-party CDN
    workerPath: '/tesseract/worker.min.js',
    corePath: '/tesseract/core',
    langPath: '/tesseract/lang',
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.(Math.round(m.progress * 100))
    },
  })
  try {
    const { data } = await worker.recognize(await prepare(file))
    return parseReceipt(data.text)
  } finally {
    await worker.terminate()
  }
}
