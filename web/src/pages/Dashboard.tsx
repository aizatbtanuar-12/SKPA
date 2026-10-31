import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth, useRole } from '../lib/auth'
import { PageHead } from '../components/Layout'
import { Badge, Card, Empty, Stat } from '../components/ui'
import { date, feeStatusLabel, feeStatusTone, rm } from '../lib/util'

export interface FundSummary {
  year: number; families_total: number; families_paid: number; yuran_collected: number
  other_income: number; expenses: number; balance: number
}
export interface FeeStatus {
  family_id: number; family_code: string; year: number; fee_due: number; paid: number
  has_pending: boolean; active_children: number; children: string; guardians: string; phone: string | null
  status: 'lunas' | 'menunggu' | 'belum'
}
interface MemoLite { id: number; title: string; published_at: string; pinned: boolean }

export default function Dashboard() {
  const { profile, familyId } = useAuth()
  const r = useRole()
  const [fund, setFund] = useState<FundSummary | null>(null)
  const [memos, setMemos] = useState<MemoLite[]>([])
  const [fee, setFee] = useState<FeeStatus | null>(null)
  const [counts, setCounts] = useState({ claims: 0, payments: 0, unpaid: 0, myClaims: 0 })

  useEffect(() => {
    supabase.rpc('fund_summary').then(({ data }) => setFund((data as FundSummary[] | null)?.[0] ?? null))
    supabase.from('memos').select('id,title,published_at,pinned').order('pinned', { ascending: false })
      .order('published_at', { ascending: false }).limit(4).then(({ data }) => setMemos((data as MemoLite[]) ?? []))
    if (r.isParent) {
      if (familyId) supabase.from('family_fee_status').select('*').eq('family_id', familyId).maybeSingle()
        .then(({ data }) => setFee(data as FeeStatus | null))
      supabase.from('child_claims').select('id', { count: 'exact', head: true }).eq('status', 'menunggu')
        .then(({ count }) => setCounts((c) => ({ ...c, myClaims: count ?? 0 })))
    } else {
      supabase.from('child_claims').select('id', { count: 'exact', head: true }).eq('status', 'menunggu')
        .then(({ count }) => setCounts((c) => ({ ...c, claims: count ?? 0 })))
      if (r.isStaff) {
        supabase.from('fee_payments').select('id', { count: 'exact', head: true }).eq('status', 'dihantar')
          .then(({ count }) => setCounts((c) => ({ ...c, payments: count ?? 0 })))
        supabase.from('family_fee_status').select('family_id', { count: 'exact', head: true }).neq('status', 'lunas')
          .then(({ count }) => setCounts((c) => ({ ...c, unpaid: count ?? 0 })))
      }
    }
  }, [r.isParent, r.isStaff, familyId])

  const first = profile?.full_name?.split(' ')[0] || ''

  return (
    <>
      <PageHead title={`Selamat datang${first ? ', ' + first : ''}`} sub="Ringkasan terkini PIBG SK Puncak Alam" />

      {r.isParent && !familyId && (
        <div className="callout">
          <strong>Langkah seterusnya: daftarkan anak anda.</strong>
          <p>
            Tambah nama dan kelas setiap anak anda. Guru kelas akan mengesahkannya, dan anak-anak anda akan
            dikumpulkan sebagai satu keluarga supaya yuran dibayar sekali sahaja.
            {counts.myClaims > 0 && ` (${counts.myClaims} permohonan sedang menunggu pengesahan.)`}
          </p>
          <Link className="btn primary" to="/anak">Tambah anak</Link>
        </div>
      )}

      {r.isParent && fee && (
        <Card title={`Yuran PIBG ${fee.year}`} actions={<Badge tone={feeStatusTone[fee.status]}>{feeStatusLabel[fee.status]}</Badge>}>
          <div className="stats">
            <Stat label="Yuran sekeluarga" value={rm(fee.fee_due)} sub={`${fee.active_children} orang anak`} />
            <Stat label="Telah dibayar" value={rm(fee.paid)} tone={fee.status === 'lunas' ? 'green' : undefined} />
          </div>
          <p className="muted small">{fee.children}</p>
          {fee.status !== 'lunas' && <Link className="btn primary" to="/yuran">Bayar / muat naik bukti</Link>}
        </Card>
      )}

      {!r.isParent && (
        <div className="stats">
          {r.canVerify && (
            <Link to="/pengesahan" className="stat-link">
              <Stat label="Pengesahan murid menunggu" value={counts.claims} tone={counts.claims ? 'amber' : undefined} />
            </Link>
          )}
          {r.isStaff && (
            <>
              <Link to="/semakan-bayaran" className="stat-link">
                <Stat label="Bukti bayaran untuk disemak" value={counts.payments} tone={counts.payments ? 'amber' : undefined} />
              </Link>
              <Link to="/kutipan" className="stat-link">
                <Stat label="Keluarga belum lunas" value={counts.unpaid} />
              </Link>
            </>
          )}
        </div>
      )}

      <div className="grid2">
        <Card title={`Dana PIBG ${fund?.year ?? ''}`} actions={<Link to="/dana" className="link">Butiran</Link>}>
          {fund ? (
            <div className="stats tight">
              <Stat label="Yuran dikutip" value={rm(fund.yuran_collected)} sub={`${fund.families_paid} / ${fund.families_total} keluarga`} />
              <Stat label="Perbelanjaan" value={rm(fund.expenses)} />
              <Stat label="Lebihan / kurangan" value={rm(fund.balance)} tone={Number(fund.balance) < 0 ? 'red' : 'green'} />
            </div>
          ) : <Empty>Tiada data.</Empty>}
          {fund && fund.families_total > 0 && (
            <div className="progress" title="Peratus keluarga yang telah membayar">
              <div style={{ width: `${Math.round((fund.families_paid / fund.families_total) * 100)}%` }} />
            </div>
          )}
        </Card>

        <Card title="Memo terkini" actions={<Link to="/memo" className="link">Semua memo</Link>}>
          {memos.length ? (
            <ul className="list">
              {memos.map((m) => (
                <li key={m.id}>
                  <Link to={`/memo#${m.id}`}>{m.pinned && '📌 '}{m.title}</Link>
                  <span className="muted small">{date(m.published_at)}</span>
                </li>
              ))}
            </ul>
          ) : <Empty>Belum ada memo.</Empty>}
        </Card>
      </div>
    </>
  )
}
