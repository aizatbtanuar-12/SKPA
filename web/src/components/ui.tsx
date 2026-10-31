import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import type { Tone } from '../lib/util'

export function Card({ title, actions, children, className = '' }:
  { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="row gap">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export const Badge = ({ tone = 'grey', children }: { tone?: Tone; children: ReactNode }) =>
  <span className={`badge ${tone}`}>{children}</span>

export function Pager({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null
  return (
    <div className="pager">
      <button className="btn ghost small" disabled={page <= 1} onClick={() => onChange(page - 1)}>‹ Sebelum</button>
      <span className="small muted">Halaman {page} / {pages}</span>
      <button className="btn ghost small" disabled={page >= pages} onClick={() => onChange(page + 1)}>Seterusnya ›</button>
    </div>
  )
}

export const Empty = ({ children }: { children: ReactNode }) => <p className="empty">{children}</p>

export const Spinner = () => <div className="spinner" aria-label="Memuatkan" />

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <div className={`stat ${tone ?? ''}`}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  )
}

export function Modal({ title, onClose, children, wide }:
  { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <header className="card-head">
          <h2>{title}</h2>
          <button className="btn ghost" onClick={onClose} aria-label="Tutup">✕</button>
        </header>
        {children}
      </div>
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}

// ---- Toasts ----
type ToastT = { id: number; msg: string; tone: 'ok' | 'err' }
const ToastCtx = createContext<(msg: string, tone?: 'ok' | 'err') => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastT[]>([])
  const push = useCallback((msg: string, tone: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x, { id, msg, tone }])
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), tone === 'err' ? 6000 : 3500)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {items.map((t) => <div key={t.id} className={`toast ${t.tone}`}>{t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

/** Small helper: run an async action with busy state + toast on error */
export function useAction() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const run = useCallback(async (fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(true)
    try {
      await fn()
      if (okMsg) toast(okMsg)
      return true
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err')
      return false
    } finally {
      setBusy(false)
    }
  }, [toast])
  return { busy, run }
}
