// Copies the receipt-reader (tesseract.js) engine and English language data into public/tesseract,
// so the portal serves them itself instead of relying on a third-party CDN. Runs before dev/build.
import { cpSync, mkdirSync, existsSync } from 'node:fs'

const out = 'public/tesseract'
mkdirSync(`${out}/core`, { recursive: true })
mkdirSync(`${out}/lang`, { recursive: true })
cpSync('node_modules/tesseract.js/dist/worker.min.js', `${out}/worker.min.js`)
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) {
  cpSync(`node_modules/tesseract.js-core/${f}`, `${out}/core/${f}`)
}
const lang = 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'
if (!existsSync(lang)) throw new Error('Missing ' + lang + ' — run npm install')
cpSync(lang, `${out}/lang/eng.traineddata.gz`)
console.log('OCR assets copied to', out)
