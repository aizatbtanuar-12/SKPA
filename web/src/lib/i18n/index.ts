/**
 * App language (Bahasa Melayu / English).
 *
 * The app is written in Bahasa Melayu. In English mode the visible text is
 * translated in place from the dictionary in ./en.ts. Each text node keeps its
 * own identity and only its value changes, so React keeps working normally
 * (unlike browser translation, which swaps nodes and breaks React's updates).
 * The choice is saved on the user's profile (and in this browser for the
 * sign-in page).
 */
import { useSyncExternalStore } from 'react'
import en from './en'

export type Lang = 'ms' | 'en'
const KEY = 'pibg.lang'
let lang: Lang = (() => { try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'ms' } catch { return 'ms' } })()
const subs = new Set<() => void>()

export const getLang = () => lang
/** locale for dates and numbers */
export const locale = () => (lang === 'en' ? 'en-GB' : 'ms-MY')
export function useLang() {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, getLang, getLang)
}
export function setLang(l: Lang) {
  if (l === lang) return
  lang = l
  try { localStorage.setItem(KEY, l) } catch { /* private mode */ }
  document.documentElement.lang = l === 'en' ? 'en' : 'ms'
  cache.clear()
  retranslateAll()
  subs.forEach((f) => f())
}

// ---------- dictionary ----------
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const decode = (s: string) => s.replace(/&amp;/g, '&')
const exact = new Map<string, string>()
const lower = new Map<string, string>()
const templates: { re: RegExp; out: string }[] = []
for (const [k, v] of Object.entries(en)) {
  const key = norm(decode(k))
  if (/\{\d\}/.test(key)) {
    const parts = key.split(/(\{\d\})/)
    const order: number[] = []
    const src = parts.map((p) => {
      const m = p.match(/^\{(\d)\}$/)
      if (m) { order.push(Number(m[1])); return '(.+?)' }
      return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }).join('')
    templates.push({ re: new RegExp('^' + src + '$', 's'), out: v.replace(/\{(\d)\}/g, (_x, d) => `{@${order.indexOf(Number(d))}}`) })
  } else {
    exact.set(key, v)
    lower.set(key.toLowerCase(), v)
  }
}
// longer templates first, so the most specific one wins
templates.sort((a, b) => b.re.source.length - a.re.source.length)

const NAME_PARTS = new Set(['bin', 'binti', 'bt', 'bt.', 'b.', 'a/l', 'a/p', 'anak', '@', '&', '/', '-', '·', '—', '(', ')'])
/** looks like a value: numbers, money, dates, codes, e-mails, or Capitalised Names */
function isValue(g: string) {
  const s = g.trim()
  if (!s) return true
  return s.split(/\s+/).every((w) => /^[^a-z]/.test(w) || NAME_PARTS.has(w.toLowerCase()) || /[@\d.]/.test(w))
}

const cache = new Map<string, string | null>()
function lookup(core: string, depth = 0): string | null {
  const hit = exact.get(core)
  if (hit !== undefined) return hit
  const lo = lower.get(core.toLowerCase())
  if (lo !== undefined) return /^[A-Z]/.test(core) ? lo.charAt(0).toUpperCase() + lo.slice(1) : lo.charAt(0).toLowerCase() + lo.slice(1)
  if (depth > 1) return null
  for (const t of templates) {
    const m = core.match(t.re)
    if (!m) continue
    const caps = m.slice(1)
    // a fill-in must be a value (number, date, code, name…) or a known label — never a piece of
    // someone's own sentence, so memo titles and descriptions are left exactly as written
    if (!caps.every((g) => isValue(g) || lookup(g, depth + 1) != null)) continue
    return t.out.replace(/\{@(\d)\}/g, (_x, i) => { const g = caps[Number(i)] ?? ''; return lookup(g, depth + 1) ?? g })
  }
  return null
}
/** Translate one piece of Malay text into the current language (unchanged if unknown or in BM mode). */
export function tr(s: string): string {
  if (lang === 'ms' || !s || !/[a-zA-Z]/.test(s)) return s
  if (cache.has(s)) return cache.get(s) ?? s
  const core = norm(s)
  const t = lookup(core)
  const out = t == null ? null : s.match(/^\s*/)![0] + t + s.match(/\s*$/)![0]
  cache.set(s, out)
  return out ?? s
}

// ---------- in-page translation ----------
const SKIP = 'script,style,textarea,[translate="no"],.no-i18n'
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt']
const texts = new WeakMap<Text, { src: string; out: string }>()
const attrs = new WeakMap<Element, Record<string, { src: string; out: string }>>()
let started = false

function doText(n: Text) {
  const p = n.parentElement
  if (!p || p.closest(SKIP)) return
  const cur = n.nodeValue ?? ''
  const rec = texts.get(n)
  if (rec && cur === rec.out) return // our own change
  const out = tr(cur)
  texts.set(n, { src: cur, out })
  if (out !== cur) n.nodeValue = out
}
function doAttrs(el: Element) {
  if (el.closest(SKIP)) return
  let recs = attrs.get(el)
  for (const a of ATTRS) {
    const cur = el.getAttribute(a)
    if (cur == null) continue
    const rec = recs?.[a]
    if (rec && cur === rec.out) continue
    const out = tr(cur)
    recs = recs ?? {}
    recs[a] = { src: cur, out }
    attrs.set(el, recs)
    if (out !== cur) el.setAttribute(a, out)
  }
}
function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) { doText(root as Text); return }
  if (root.nodeType !== Node.ELEMENT_NODE) return
  doAttrs(root as Element)
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let n: Node | null
  while ((n = w.nextNode())) n.nodeType === Node.TEXT_NODE ? doText(n as Text) : doAttrs(n as Element)
}
function retranslateAll() {
  if (!started) return
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let n: Node | null
  while ((n = w.nextNode())) {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = n as Text, rec = texts.get(t)
      if (rec) { const out = tr(rec.src); texts.set(t, { src: rec.src, out }); if (t.nodeValue !== out) t.nodeValue = out } else doText(t)
    } else {
      const el = n as Element, recs = attrs.get(el)
      if (recs) for (const a of Object.keys(recs)) { const out = tr(recs[a].src); recs[a] = { src: recs[a].src, out }; el.setAttribute(a, out) }
      else doAttrs(el)
    }
  }
}

/** Start translating the page; call once before the app renders. */
export function startI18n() {
  if (started || typeof document === 'undefined') return
  started = true
  document.documentElement.lang = lang === 'en' ? 'en' : 'ms'
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') doText(m.target as Text)
      else if (m.type === 'attributes') doAttrs(m.target as Element)
      else m.addedNodes.forEach(walk)
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS })
  walk(document.body)
  // browser dialogs
  const c = window.confirm.bind(window), a = window.alert.bind(window)
  window.confirm = (m?: string) => c(m == null ? m : tr(m))
  window.alert = (m?: string) => a(m == null ? m : tr(m))
}
