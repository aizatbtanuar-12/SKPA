import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Empty } from './ui'

export type SortVal = string | number | null | undefined
export interface Col<T> {
  key: string
  label: ReactNode
  /** value used for sorting; omit to make the column not sortable */
  sort?: (r: T) => SortVal
  render: (r: T) => ReactNode
  num?: boolean
  className?: string
}

const blank = (v: SortVal) => v == null || v === ''
const cmp = (a: SortVal, b: SortVal, dir: 1 | -1) => {
  if (blank(a)) return blank(b) ? 0 : 1 // blanks always last, whichever direction
  if (blank(b)) return -1
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * dir
  return String(a).localeCompare(String(b), 'ms', { numeric: true, sensitivity: 'base' }) * dir
}

/**
 * Table with clickable sort headers and pagination. Used by every table in the app.
 * `resetKey` (e.g. the active filter) sends the user back to page 1.
 */
const SIZES = [10, 20, 50, 100]

export function DataTable<T>({ rows, cols, rowKey, pageSize = 10, initialSort, empty = 'Tiada rekod.', resetKey, onRowClick, rowClassName, storeKey }: {
  rows: T[]
  cols: Col<T>[]
  rowKey: (r: T) => string | number
  pageSize?: number
  initialSort?: { key: string; dir: 'asc' | 'desc' }
  empty?: ReactNode
  resetKey?: unknown
  onRowClick?: (r: T) => void
  rowClassName?: (r: T) => string
  /** remembers the chosen rows per page on this device; defaults to the page + column names */
  storeKey?: string
}) {
  const [sort, setSort] = useState(initialSort ?? null)
  const [page, setPage] = useState(0)
  const key = 'pibg.rows.' + (storeKey ?? (typeof location !== 'undefined' ? location.hash.split('?')[0] : '') + ':' + cols.map((c) => c.key).join(','))
  const [size, setSizeState] = useState<number>(() => {
    try { const v = Number(localStorage.getItem(key)); return SIZES.includes(v) ? v : pageSize } catch { return pageSize }
  })
  const setSize = (n: number) => { setSizeState(n); setPage(0); try { localStorage.setItem(key, String(n)) } catch { /* private mode */ } }
  const sizes = [...new Set([...SIZES, pageSize])].sort((a, b) => a - b)

  const sorted = useMemo(() => {
    const col = sort && cols.find((c) => c.key === sort.key)
    if (!col?.sort) return rows
    const f = col.sort
    const dir = sort!.dir === 'desc' ? -1 : 1
    return [...rows].sort((a, b) => cmp(f(a), f(b), dir))
  }, [rows, cols, sort])

  const pages = Math.max(1, Math.ceil(sorted.length / size))
  useEffect(() => { setPage(0) }, [resetKey, sort])
  useEffect(() => { if (page > pages - 1) setPage(pages - 1) }, [page, pages])
  const slice = sorted.slice(page * size, page * size + size)

  const toggle = (c: Col<T>) => {
    if (!c.sort) return
    setSort((s) => (s?.key !== c.key ? { key: c.key, dir: 'asc' } : s.dir === 'asc' ? { key: c.key, dir: 'desc' } : null))
  }

  if (!rows.length) return <Empty>{empty}</Empty>

  const from = page * size + 1
  const to = Math.min(sorted.length, from + size - 1)
  return (
    <div className="dt">
      <div className="dt-scroll">
        <table className={`table ${onRowClick ? 'hover' : ''}`}>
          <thead>
            <tr>
              {cols.map((c) => {
                const on = sort?.key === c.key
                const cls = c.num ? 'num' : undefined
                if (!c.sort) return <th key={c.key} className={cls}>{c.label}</th>
                return (
                  <th key={c.key} className={cls} aria-sort={on ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className={`th-sort ${on ? 'on' : ''}`} onClick={() => toggle(c)}>
                      {c.label}<span className="arr" aria-hidden="true">{on ? (sort!.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {slice.map((r) => (
              <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={rowClassName?.(r)}>
                {cols.map((c) => (
                  <td key={c.key} className={[c.num ? 'num' : '', c.className ?? ''].join(' ').trim() || undefined}>{c.render(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="dt-foot">
        <div className="dt-left">
          <span className="dt-count">{sorted.length > size ? `${from}–${to} daripada ${sorted.length}` : `${sorted.length} rekod`}</span>
          <label className="dt-size">
            <span>Baris</span>
            <select value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="Baris setiap halaman">
              {sizes.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
        {pages > 1 && (
          <div className="dt-pager">
            <button type="button" className="txt" disabled={page === 0} onClick={() => setPage(page - 1)}>‹ Sebelum</button>
            <span className="label">Halaman {page + 1} / {pages}</span>
            <button type="button" className="txt" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Seterusnya ›</button>
          </div>
        )}
      </div>
    </div>
  )
}
