import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Empty, Spinner } from '../components/ui'
import { dateTime, rm } from '../lib/util'
import type { Payment } from './parent/ParentFees'

interface Fam { family_code: string; children: string; guardians: string }
const methodLabel: Record<string, string> = { pindahan: 'Pindahan bank', tunai: 'Tunai', lain: 'Lain-lain' }

export default function Receipt() {
  const { id } = useParams()
  const { settings } = useAuth()
  const nav = useNavigate()
  const [p, setP] = useState<Payment | null | undefined>(undefined)
  const [fam, setFam] = useState<Fam | null>(null)

  useEffect(() => {
    supabase.from('fee_payments').select('*').eq('id', Number(id)).maybeSingle().then(async ({ data }) => {
      const pay = data as Payment | null
      setP(pay)
      if (pay) {
        const { data: f } = await supabase.from('family_fee_status')
          .select('family_code,children,guardians').eq('family_id', pay.family_id).maybeSingle()
        setFam(f as Fam | null)
      }
    })
  }, [id])

  if (p === undefined) return <Spinner />
  if (!p || p.status !== 'diluluskan') return <Empty>Resit tidak dijumpai atau bayaran belum diluluskan.</Empty>

  return (
    <div className="receipt-wrap">
      <div className="row gap no-print">
        <button className="btn primary" onClick={() => window.print()}>Cetak / Simpan PDF</button>
        <button className="btn ghost" onClick={() => nav(-1)}>Kembali</button>
      </div>
      <article className="receipt">
        <header>
          <div className="logo">P</div>
          <div>
            <h1>Persatuan Ibu Bapa dan Guru</h1>
            <h2>{settings?.school_name}{settings?.school_code ? ` (${settings.school_code})` : ''}</h2>
          </div>
        </header>
        <h3>RESIT RASMI YURAN PIBG</h3>
        <dl className="dl">
          <dt>No. resit</dt><dd className="mono">{p.receipt_no}</dd>
          <dt>Tarikh</dt><dd>{dateTime(p.reviewed_at)}</dd>
          <dt>Kod keluarga</dt><dd className="mono">{fam?.family_code}</dd>
          <dt>Diterima daripada</dt><dd>{fam?.guardians}</dd>
          <dt>Anak</dt><dd>{fam?.children}</dd>
          <dt>Perkara</dt><dd>Yuran PIBG sekeluarga tahun {p.year}</dd>
          <dt>Kaedah</dt><dd>{methodLabel[p.method] ?? p.method}{p.reference ? ` · ${p.reference}` : ''}</dd>
        </dl>
        <div className="receipt-total"><span>Jumlah</span><strong>{rm(p.amount)}</strong></div>
        <p className="muted small">Resit ini dijana oleh komputer dan tidak memerlukan tandatangan.</p>
      </article>
    </div>
  )
}
