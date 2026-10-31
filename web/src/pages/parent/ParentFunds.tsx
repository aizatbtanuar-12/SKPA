import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { Live, PageHead, PBadge, PPager, Seg, dayMonth, shortRM, useIsMobile, usePaged, type PTone } from '../../components/pui'
import { date, rm } from '../../lib/util'
import type { FundSummary } from '../Dashboard'

interface Program { id: number; title: string; description: string | null; start_date: string | null; budget: number; status: string; panitia: string | null }
interface Txn { id: number; txn_date: string; kind: 'masuk' | 'keluar'; category: string; amount: number; description: string | null; program_id: number | null }

const progStatus: Record<string, [string, PTone]> = {
  dirancang: ['Dirancang', 'blue'], berjalan: ['Sedang berjalan', 'amber'], selesai: ['Selesai', 'green'], dibatalkan: ['Dibatalkan', 'grey'],
}
const BAR = ['var(--brand)', 'var(--accent)', 'var(--logo-red)', '#9aa0ad']
type Tab = 'ringkasan' | 'program' | 'transaksi'

export default function ParentFunds() {
  const { settings } = useAuth()
  const mobile = useIsMobile()
  const [year, setYear] = useState(settings?.current_year ?? new Date().getFullYear())
  const [tab, setTab] = useState<Tab>('ringkasan')
  const [fund, setFund] = useState<FundSummary | null>(null)
  const [progs, setProgs] = useState<Program[]>([])
  const [txns, setTxns] = useState<Txn[]>([])

  const load = useCallback(async () => {
    const [f, p, t] = await Promise.all([
      supabase.rpc('fund_summary', { p_year: year }),
      supabase.from('programs').select('*').order('start_date', { ascending: false, nullsFirst: true }),
      supabase.from('transactions').select('*').gte('txn_date', `${year}-01-01`).lte('txn_date', `${year}-12-31`).order('txn_date', { ascending: false }),
    ])
    setFund((f.data as FundSummary[] | null)?.[0] ?? null)
    setProgs((p.data as Program[]) ?? [])
    setTxns((t.data as Txn[]) ?? [])
  }, [year])
  useEffect(() => { load() }, [load])

  const spent = useMemo(() => {
    const m: Record<number, number> = {}
    txns.forEach((t) => { if (t.kind === 'keluar' && t.program_id) m[t.program_id] = (m[t.program_id] ?? 0) + Number(t.amount) })
    return m
  }, [txns])
  const cats = useMemo(() => {
    const m: Record<string, number> = {}
    txns.filter((t) => t.kind === 'keluar').forEach((t) => { m[t.category] = (m[t.category] ?? 0) + Number(t.amount) })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [txns])
  const prog = usePaged(progs, 1)
  const tx = usePaged(txns, 5)

  const surplus = Number(fund?.balance ?? 0)
  const otherIncome = Number(fund?.donations ?? 0) + Number(fund?.other_income ?? 0)
  const years = [0, 1, 2].map((d) => (settings?.current_year ?? year) - d)

  const tiles = fund && (
    <div className="dana-tiles up" key={JSON.stringify(fund)}>
      <div className="navy"><span>Yuran dikutip</span><Live as="b">{shortRM(fund.yuran_collected)}</Live><Live as="small">{`${fund.families_paid} / ${fund.families_total} keluarga`}</Live></div>
      <div className="gold"><span>Sumbangan &amp; pendapatan lain</span><b>{shortRM(otherIncome)}</b>{Number(fund.donations) > 0 && <small>termasuk kutipan dana {shortRM(fund.donations)}</small>}</div>
      <div className="red"><span>Perbelanjaan</span><b>{shortRM(fund.expenses)}</b></div>
      <div className={surplus < 0 ? 'neg' : 'green'}><span>{surplus < 0 ? 'Kurangan tahun ini' : 'Lebihan tahun ini'}</span><b>{shortRM(surplus)}</b></div>
    </div>
  )

  const max = cats[0]?.[1] ?? 1
  const catCard = (
    <div className="pcard up">
      <div className="pcard-head"><h2>Ke mana duit pergi?</h2></div>
      {cats.length ? (
        <div className="cat-bars">
          {cats.map(([k, v], i) => (
            <div key={k}>
              <div className="row1"><span>{k}</span><b>{shortRM(v)}</b></div>
              <div className="track"><div style={{ width: `${(v / max) * 100}%`, background: BAR[i % BAR.length] }} /></div>
            </div>
          ))}
        </div>
      ) : <div key="empty" className="pempty">Belum ada perbelanjaan direkodkan.</div>}
    </div>
  )

  const p = prog.slice[0]
  const progCard = (
    <div className="pcard prog-card up" key={p?.id}>
      {p ? (
        <>
          <div className="in">
            <div className="meta">
              <span>{[p.start_date ? date(p.start_date) : null, p.panitia].filter(Boolean).join(' · ')}</span>
              <PBadge tone={progStatus[p.status][1]}>{progStatus[p.status][0]}</PBadge>
            </div>
            <h3>{p.title}</h3>
            {p.description && <p>{p.description}</p>}
            <div className="spent"><span>Dibelanjakan <b>{rm(spent[p.id] ?? 0)}</b></span><span className="muted">Bajet {rm(p.budget)}</span></div>
            <div className="track"><div style={{ width: `${Number(p.budget) ? Math.min(100, ((spent[p.id] ?? 0) / Number(p.budget)) * 100) : 0}%` }} /></div>
            <PPager page={prog.page} pages={prog.pages} onChange={prog.setPage} />
          </div>
        </>
      ) : <div key="empty" className="pempty">Belum ada program.</div>}
    </div>
  )

  const txList = (
    <div className="pcard up">
      <div className="pcard-head"><h2>Transaksi {year}</h2>{!mobile && <span className="muted" style={{ fontSize: 13 }}>Kutipan yuran dikira automatik daripada bayaran yang diluluskan.</span>}</div>
      {tx.slice.length ? tx.slice.map((t) => {
        const dm = dayMonth(t.txn_date)
        const io = t.kind === 'masuk' ? 'in' : 'out'
        return mobile ? (
          <div key={t.id} className="tx-row">
            <span className={`sign ${io}`} aria-hidden="true">{io === 'in' ? '+' : '−'}</span>
            <div style={{ minWidth: 0 }}><div className="d">{t.description || t.category}</div><div className="m">{dm.day} {dm.month} · {t.category}</div></div>
            <span className={`a ${io}`}>{io === 'in' ? '+' : '−'}{shortRM(t.amount)}</span>
          </div>
        ) : (
          <div key={t.id} className="tx-row wide">
            <span className={`sign ${io}`} aria-hidden="true">{io === 'in' ? '+' : '−'}</span>
            <span className="c">{dm.day} {dm.month}</span>
            <span className="d">{t.description || t.category}</span>
            <span className="c">{t.category}</span>
            <span className={`a ${io}`}>{io === 'in' ? '+' : '−'}{shortRM(t.amount)}</span>
          </div>
        )
      }) : <div key="empty" className="pempty">Tiada transaksi selain kutipan yuran.</div>}
      <PPager page={tx.page} pages={tx.pages} onChange={tx.setPage} variant={mobile ? 'label' : 'text'} />
      {mobile && <p className="muted" style={{ fontSize: 12, margin: '12px 0 0' }}>Kutipan yuran dikira automatik daripada bayaran yang diluluskan.</p>}
    </div>
  )

  const yearSel = (
    <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Tahun"
      style={{ height: 38, borderRadius: 12, border: '1px solid var(--input-line)', padding: '0 10px', font: 'inherit', fontWeight: 700, background: '#fff' }}>
      {years.map((y) => <option key={y} value={y}>{y}</option>)}
    </select>
  )

  if (mobile) {
    return (
      <>
        <PageHead title="Dana & Program" sub={`Ketelusan penggunaan dana PIBG ${year}`} right={yearSel} />
        <Seg value={tab} onChange={setTab} options={[['ringkasan', 'Ringkasan'], ['program', 'Program'], ['transaksi', 'Transaksi']]} />
        {tab === 'ringkasan' && <>{tiles}{catCard}</>}
        {tab === 'program' && progCard}
        {tab === 'transaksi' && txList}
      </>
    )
  }
  return (
    <>
      <PageHead title="Dana & Program PIBG" sub={`Ketelusan penggunaan dana PIBG untuk semua ibu bapa · ${year}`} right={yearSel} />
      {tiles}
      <div className="pgrid" style={{ marginBottom: 20 }}>{catCard}{progCard}</div>
      {txList}
    </>
  )
}
