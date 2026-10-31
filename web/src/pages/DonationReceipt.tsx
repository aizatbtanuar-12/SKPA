import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Empty, Spinner } from '../components/ui'
import ReceiptDoc, { type ReceiptData } from '../components/ReceiptDoc'
import type { Donation } from '../lib/donations'

interface StudentRow { full_name: string; classes: { name: string; year_level: number | null } | null }

export default function DonationReceipt() {
  const { id } = useParams()
  const { settings } = useAuth()
  const nav = useNavigate()
  const [data, setData] = useState<ReceiptData | null | undefined>(undefined)

  useEffect(() => {
    (async () => {
      const { data: row } = await supabase.from('donations').select('*, campaigns(title, code)').eq('id', Number(id)).maybeSingle()
      const d = row as (Donation & { campaigns: { title: string; code: string } | null }) | null
      if (!d || d.status !== 'diluluskan') { setData(null); return }
      let familyCode = '', guardians = d.donor_name ?? '', kids: StudentRow[] = []
      if (d.family_id) {
        const [f, st] = await Promise.all([
          supabase.from('family_fee_status').select('family_code,guardians').eq('family_id', d.family_id).maybeSingle(),
          supabase.from('students').select('full_name, classes(name, year_level)').eq('family_id', d.family_id).eq('status', 'aktif'),
        ])
        const fam = f.data as { family_code: string; guardians: string } | null
        familyCode = fam?.family_code ?? ''
        guardians = guardians || fam?.guardians || ''
        kids = ((st.data as unknown as StudentRow[]) ?? [])
          .sort((a, b) => (a.classes?.year_level ?? 99) - (b.classes?.year_level ?? 99) || a.full_name.localeCompare(b.full_name))
      }
      setData({
        title: 'RESIT SUMBANGAN', item: `Sumbangan: ${d.campaigns?.title ?? ''}`,
        receipt_no: d.receipt_no, date: d.reviewed_at, family_code: familyCode || '-', guardians,
        year: new Date(d.reviewed_at ?? d.submitted_at).getFullYear(), amount: d.amount, method: d.method, reference: d.reference,
        children: kids.map((k) => ({ name: k.full_name, className: k.classes?.name ?? '' })),
      })
    })()
  }, [id])

  if (data === undefined) return <Spinner />
  if (!data || !settings) return <Empty>Resit tidak dijumpai atau sumbangan belum diluluskan.</Empty>
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
