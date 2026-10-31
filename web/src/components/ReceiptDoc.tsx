import type { Settings } from '../lib/supabase'
import { dateTime, rm } from '../lib/util'

export interface ReceiptData {
  receipt_no: string | null
  date: string | null
  family_code: string
  guardians: string
  children: { name: string; className: string }[]
  year: number
  amount: number
  method: string
  reference: string | null
}

const methodLabel: Record<string, string> = { pindahan: 'Pindahan bank', tunai: 'Tunai', lain: 'Lain-lain' }

/** The printable receipt. Used for real receipts and for the live preview in Tetapan. */
export default function ReceiptDoc({ s, d }: { s: Partial<Settings>; d: ReceiptData }) {
  const header = (s.receipt_header ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
  return (
    <article className="receipt">
      <header>
        {(s.receipt_show_logo ?? true) && <img className="logo" src="/logo.png" alt="Logo PIBG" />}
        <div>
          <h1>{s.receipt_org_name || 'Persatuan Ibu Bapa dan Guru'}</h1>
          <h2>{s.school_name}{s.school_code ? ` (${s.school_code})` : ''}</h2>
          {header.map((l, i) => <div key={i} className="receipt-header-line">{l}</div>)}
        </div>
      </header>
      <h3>{s.receipt_title || 'RESIT RASMI YURAN PIBG'}</h3>
      <dl className="dl">
        <dt>No. resit</dt><dd className="mono" translate="no">{d.receipt_no}</dd>
        <dt>Tarikh</dt><dd>{dateTime(d.date)}</dd>
        <dt>Kod keluarga</dt><dd className="mono" translate="no">{d.family_code}</dd>
        <dt>Diterima daripada</dt><dd translate="no">{d.guardians}</dd>
        <dt>Perkara</dt><dd>Yuran PIBG sekeluarga tahun {d.year}</dd>
        <dt>Kaedah</dt><dd>{methodLabel[d.method] ?? d.method}{d.reference ? <> · <span className="mono" translate="no">{d.reference}</span></> : ''}</dd>
      </dl>
      <div className="receipt-children">
        <span className="receipt-label">Anak ({d.children.length})</span>
        <ol translate="no">
          {d.children.map((c, i) => <li key={i}><span>{c.name}</span><span className="muted">{c.className}</span></li>)}
        </ol>
      </div>
      <div className="receipt-total"><span>Jumlah</span><strong>{rm(d.amount)}</strong></div>
      {s.receipt_note && <p className="receipt-note">{s.receipt_note}</p>}
      {s.receipt_signatory && (
        <div className="receipt-sign">
          <div className="sign-line" />
          <span>{s.receipt_signatory}</span>
        </div>
      )}
      {s.receipt_footer && <p className="receipt-footer">{s.receipt_footer}</p>}
    </article>
  )
}

export const SAMPLE_RECEIPT: ReceiptData = {
  receipt_no: 'PIBG-SKPA/2026/0001',
  date: new Date().toISOString(),
  family_code: 'K00001',
  guardians: 'Ahmad bin Abdullah / Siti binti Ali',
  children: [
    { name: 'Nur Aisyah binti Ahmad', className: '2 IBNU SINA' },
    { name: 'Muhammad Adam bin Ahmad', className: '4 IBNU SINA' },
    { name: 'Nur Hana binti Ahmad', className: '5 IBNU SINA' },
  ],
  year: 2026,
  amount: 90,
  method: 'pindahan',
  reference: '3829174650',
}
