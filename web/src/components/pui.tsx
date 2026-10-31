/* Building blocks for the redesigned parent screens (see parent.css) */
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { locale } from '../lib/i18n'

export function useIsMobile() {
  const q = '(max-width: 759px)'
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return m
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="pseg" role="tablist">
      {options.map(([v, label]) => (
        <button key={v} role="tab" aria-selected={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  )
}

/** Pager: 'dots' = ‹ dots ›, 'label' = ‹ Halaman x / y ›, 'text' = ‹ Sebelum · Halaman · Seterusnya › (desktop) */
export function PPager({ page, pages, onChange, variant = 'dots' }:
  { page: number; pages: number; onChange: (p: number) => void; variant?: 'dots' | 'label' | 'text' }) {
  if (pages <= 1) return null
  const prev = () => page > 0 && onChange(page - 1)
  const next = () => page < pages - 1 && onChange(page + 1)
  const middle = variant === 'dots'
    ? <div className="dots">{Array.from({ length: pages }, (_, i) => (
        <button key={i} aria-label={`Halaman ${i + 1}`} className={i === page ? 'on' : ''} onClick={() => onChange(i)} />
      ))}</div>
    : <span className="label">Halaman {page + 1} / {pages}</span>
  if (variant === 'text') {
    return (
      <div className="ppager">
        <button className="txt" disabled={page === 0} onClick={prev}>‹ Sebelum</button>
        {middle}
        <button className="txt" disabled={page >= pages - 1} onClick={next}>Seterusnya ›</button>
      </div>
    )
  }
  return (
    <div className="ppager">
      <button className="arrow" aria-label="Sebelum" disabled={page === 0} onClick={prev}>‹</button>
      {middle}
      <button className="arrow" aria-label="Seterusnya" disabled={page >= pages - 1} onClick={next}>›</button>
    </div>
  )
}

/**
 * Text that changes after the first render (counts, amounts, sentences with numbers).
 * Chrome's auto-translate swaps text for its own copy, so React's later updates go to
 * a detached node and the screen stays stale ("0 of 0"). Keying on the text makes
 * React replace the element instead, which the translator then picks up afresh.
 */
export function Live({ children, as: Tag = 'span', className }: { children: string | number; as?: 'span' | 'b' | 'i' | 'div' | 'small' | 'strong' | 'h2'; className?: string }) {
  const t = String(children)
  return <Tag key={t} className={className}>{t}</Tag>
}

export type PTone = 'green' | 'amber' | 'red' | 'blue' | 'grey' | 'gold' | 'ghost'
export const PBadge = ({ tone, children }: { tone: PTone; children: ReactNode }) => <span className={`pbadge ${tone}`}>{children}</span>

/** Conic progress ring */
export function Ring({ pct, large }: { pct: number; large?: boolean }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)))
  return (
    <div className={`ring ${large ? 'lg' : ''}`} style={{ background: `conic-gradient(var(--brand) ${p * 3.6}deg, var(--track) 0)` }}
      role="img" aria-label={`${p} peratus`}>
      <span translate="no">{`${p}%`}</span>
    </div>
  )
}

/** Quick-action tiles: illustrated icons in tinted squares (row of 4 on phones, cards on desktop) */
export interface QuickTile { to: string; state?: unknown; img: string; label: string; tint: 't-gold' | 't-blue' | 't-red' | 't-green'; badge?: number }
export function QuickTiles({ tiles, mobile }: { tiles: QuickTile[]; mobile: boolean }) {
  if (mobile) {
    return (
      <div className="quick">
        {tiles.map((t) => (
          <Link key={t.to + t.label} to={t.to} state={t.state}>
            <span className={`tile ${t.tint}`} aria-hidden="true"><img src={t.img} alt="" />{t.badge ? <Live as="i" className="qbadge">{t.badge}</Live> : null}</span>
            {t.label}
          </Link>
        ))}
      </div>
    )
  }
  return (
    <div className="dquick">
      {tiles.map((t) => (
        <Link key={t.to + t.label} to={t.to} state={t.state} className={t.tint}>
          <span className="ico" aria-hidden="true"><img src={t.img} alt="" /></span>
          <span className="lbl">{t.label}</span>
          {t.badge ? <Live as="i" className="qbadge">{t.badge}</Live> : null}
        </Link>
      ))}
    </div>
  )
}

export function PageHead({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="ph">
      <div className="ph-row"><h1>{title}</h1>{right}</div>
      {sub && <p>{sub}</p>}
    </div>
  )
}

const SKIP = new Set(['BIN', 'BINTI', 'A/L', 'A/P', 'B.', 'BT.', 'BT', 'AL', 'AP'])
export function initials(name: string | null | undefined) {
  const w = (name ?? '').toUpperCase().split(/\s+/).filter((x) => x && !SKIP.has(x))
  return ((w[0]?.[0] ?? '') + (w[1]?.[0] ?? '')) || '?'
}
export function firstName(name: string | null | undefined) {
  const w = (name ?? '').split(/\s+/).filter(Boolean)
  if (!w.length) return ''
  // "Muhammad Luqman" → Luqman reads more naturally; "Nur Aisyah" → Aisyah
  return ['MUHAMMAD', 'MOHD', 'MOHAMAD', 'MOHAMMAD', 'NUR', 'NURUL', 'SITI', 'AHMAD'].includes(w[0].toUpperCase()) && w[1] ? w[1] : w[0]
}

/** Lively tints by hue */
export const HUES = [85, 255, 25, 155] as const
export const tintClass = (i: number) => ['t-gold', 't-blue', 't-red', 't-green'][((i % 4) + 4) % 4]
export const tintBg = (i: number, l = 0.93) => `oklch(${l} 0.06 ${HUES[((i % 4) + 4) % 4]})`
export const tintInk = (i: number) => ['#7a5200', '#14315e', '#7a2219', '#145c35'][((i % 4) + 4) % 4]

export const todayLong = () =>
  new Date().toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

const MONTHS = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis']
export const dayMonth = (d: string | null | undefined) => {
  if (!d) return { day: '-', month: '' }
  const x = new Date(d)
  return { day: String(x.getDate()), month: MONTHS[x.getMonth()] }
}

export const shortRM = (n: number | string | null | undefined) =>
  'RM ' + Number(n ?? 0).toLocaleString('ms-MY', { maximumFractionDigits: 0 })

/** Scroll to top whenever a key changes (tab or page) */
export function useScrollTop(key: unknown) {
  useEffect(() => { window.scrollTo({ top: 0 }) }, [key])
}

export function usePaged<T>(items: T[], size: number, resetKey?: unknown) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(items.length / size))
  useEffect(() => { setPage(0) }, [resetKey])
  useEffect(() => { if (page > pages - 1) setPage(pages - 1) }, [page, pages])
  return { page, pages, setPage, slice: items.slice(page * size, page * size + size) }
}
