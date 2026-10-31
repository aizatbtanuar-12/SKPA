/* Pieces shared by the parent and staff home screens */
import { Link } from 'react-router-dom'
import type { FundSummary } from '../pages/Dashboard'
import { Live, Ring, dayMonth, shortRM, tintBg } from './pui'

export interface MemoLite { id: number; title: string; published_at: string; pinned: boolean; audience: string; author: { full_name: string } | null }

export const MEMO_SELECT = 'id,title,published_at,pinned,audience,author:profiles!memos_author_id_fkey(full_name)'

export function MemoTile({ m, i, read }: { m: MemoLite; i: number; read: Set<number> }) {
  const dm = dayMonth(m.published_at)
  const flag = m.pinned ? 'Disemat' : !read.has(m.id) ? 'Baru' : m.audience === 'kelas' ? 'Kelas' : 'Umum'
  return (
    <Link to={`/memo#${m.id}`} className="memo-card" style={{ background: tintBg(i) }}>
      <div className="top"><span>{dm.day} {dm.month}</span><span className="flag">{flag}</span></div>
      <div className="title">{m.title}</div>
      <div className="by">{m.author?.full_name ?? 'PIBG'}</div>
    </Link>
  )
}

export function DanaCard({ fund, large }: { fund: FundSummary | null; large?: boolean }) {
  const paidPct = fund && fund.families_total ? (fund.families_paid / fund.families_total) * 100 : 0
  const surplus = Number(fund?.balance ?? 0)
  return (
    <div className="pcard dana-card">
      <div className="pcard-head"><Live as="h2">{`Dana PIBG ${fund?.year ?? ''}`}</Live><Link to="/dana">Butiran →</Link></div>
      <div className="ring-row">
        <Ring pct={paidPct} large={large} />
        <div>{fund ? <Live as="b">{`${fund.families_paid} daripada ${fund.families_total} keluarga`}</Live> : <b>…</b>}<span className="sub">telah melunaskan yuran tahun ini</span></div>
      </div>
      <div className="mini-tiles">
        <div><span>Dikutip</span><Live as="b">{shortRM(Number(fund?.yuran_collected ?? 0) + Number(fund?.donations ?? 0))}</Live></div>
        <div><span>Belanja</span><Live as="b">{shortRM(fund?.expenses)}</Live></div>
        <div className={surplus < 0 ? 'neg' : 'pos'}><Live>{surplus < 0 ? 'Kurangan' : 'Lebihan'}</Live><Live as="b">{shortRM(surplus)}</Live></div>
      </div>
    </div>
  )
}
