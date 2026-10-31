import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Empty, Spinner } from '../components/ui'
import ReceiptDoc, { type ReceiptData } from '../components/ReceiptDoc'
import type { Payment } from './parent/ParentFees'

interface StudentRow { full_name: string; classes: { name: string; year_level: number | null } | null }

export default function Receipt() {
  const { id } = useParams()
  const { settings } = useAuth()
  const nav = useNavigate()
  const [data, setData] = useState<ReceiptData | null | undefined>(undefined)

  useEffect(() => {
    (async () => {
      const { data: p } = await supabase.from('fee_payments').select('*').eq('id', Number(id)).maybeSingle()
      const pay = p as Payment | null
      if (!pay || pay.status !== 'diluluskan') { setData(null); return }
      const [f, st] = await Promise.all([
        supabase.from('family_fee_status').select('family_code,guardians').eq('family_id', pay.family_id).maybeSingle(),
        supabase.from('students').select('full_name, classes(name, year_level)').eq('family_id', pay.family_id).eq('status', 'aktif'),
      ])
      const fam = f.data as { family_code: string; guardians: string } | null
      const kids = ((st.data as unknown as StudentRow[]) ?? [])
        .sort((a, b) => (a.classes?.year_level ?? 99) - (b.classes?.year_level ?? 99) || a.full_name.localeCompare(b.full_name))
      setData({
        receipt_no: pay.receipt_no, date: pay.reviewed_at, family_code: fam?.family_code ?? '',
        guardians: fam?.guardians ?? '', year: pay.year, amount: pay.amount, method: pay.method, reference: pay.reference,
        children: kids.map((k) => ({ name: k.full_name, className: k.classes?.name ?? '' })),
      })
    })()
  }, [id])

  if (data === undefined) return <Spinner />
  if (!data || !settings) return <Empty>Resit tidak dijumpai atau bayaran belum diluluskan.</Empty>

  return (
    <div className="receipt-wrap">
      <div className="row gap no-print">
        <button className="btn primary" onClick={() => window.print()}>Cetak / Simpan PDF</button>
        <button className="btn ghost" onClick={() => nav(-1)}>Kembali</button>
      </div>
      <ReceiptDoc s={settings} d={data} />
    </div>
  )
}
