import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth, useRole } from '../lib/auth'
import { roleLabel } from '../lib/util'
import CampaignCard from '../components/CampaignCard'
import { DanaCard, MemoTile, MEMO_SELECT, type MemoLite } from '../components/HomeParts'
import { Live, QuickTiles, type QuickTile, firstName, initials, todayLong, useIsMobile } from '../components/pui'
import { loadProgress, type Campaign, type Progress } from '../lib/donations'

export interface FundSummary {
  year: number; families_total: number; families_paid: number; yuran_collected: number
  donations: number; other_income: number; expenses: number; balance: number
}
export interface FeeStatus {
  family_id: number; family_code: string; year: number; fee_due: number; paid: number
  has_pending: boolean; active_children: number; children: string; guardians: string; phone: string | null
  status: 'lunas' | 'menunggu' | 'belum'
}

interface Todo { to: string; label: string; n: number; hint: string }

/** Laman Utama for committee, teachers and admin: same look as the parent home, with a to-do card */
export default function Dashboard() {
  const { profile, settings } = useAuth()
  const r = useRole()
  const mobile = useIsMobile()
  const nav = useNavigate()
  const [fund, setFund] = useState<FundSummary | null>(null)
  const [memos, setMemos] = useState<MemoLite[]>([])
  const [read, setRead] = useState<Set<number>>(new Set())
  const [counts, setCounts] = useState({ claims: 0, payments: 0, donations: 0, unpaid: 0 })
  const [drives, setDrives] = useState<Campaign[]>([])
  const [prog, setProg] = useState<Record<number, Progress>>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    supabase.from('campaigns').select('*').eq('status', 'aktif').order('created_at', { ascending: false }).limit(2)
      .then(({ data }) => setDrives((data as Campaign[]) ?? []))
    loadProgress().then(setProg)
    supabase.rpc('fund_summary').then(({ data }) => setFund((data as FundSummary[] | null)?.[0] ?? null))
    supabase.from('memos').select(MEMO_SELECT).order('pinned', { ascending: false })
      .order('published_at', { ascending: false }).limit(4).then(({ data }) => setMemos((data as unknown as MemoLite[]) ?? []))
    if (profile) supabase.from('memo_reads').select('memo_id').eq('user_id', profile.id)
      .then(({ data }) => setRead(new Set(((data ?? []) as { memo_id: number }[]).map((x) => x.memo_id))))
    const head = { count: 'exact' as const, head: true }
    const jobs: PromiseLike<unknown>[] = [
      supabase.from('child_claims').select('id', head).eq('status', 'menunggu')
        .then(({ count }) => setCounts((c) => ({ ...c, claims: count ?? 0 }))),
    ]
    if (r.isStaff) {
      jobs.push(
        supabase.from('fee_payments').select('id', head).eq('status', 'dihantar')
          .then(({ count }) => setCounts((c) => ({ ...c, payments: count ?? 0 }))),
        supabase.from('donations').select('id', head).eq('status', 'dihantar')
          .then(({ count }) => setCounts((c) => ({ ...c, donations: count ?? 0 }))),
        supabase.from('family_fee_status').select('family_id', head).neq('status', 'lunas')
          .then(({ count }) => setCounts((c) => ({ ...c, unpaid: count ?? 0 }))),
      )
    }
    Promise.all(jobs).then(() => setLoaded(true))
  }, [r.isStaff, profile])

  const name = firstName(profile?.full_name)
  const role = roleLabel[r.role]

  const todos: Todo[] = [
    ...(r.isStaff ? [
      { to: '/semakan-bayaran', label: 'Bukti yuran untuk disemak', n: counts.payments, hint: 'Sahkan dan keluarkan resit' },
      { to: '/kempen', label: 'Sumbangan untuk disemak', n: counts.donations, hint: 'Kutipan dana yang sedang berjalan' },
    ] : []),
    ...(r.canVerify ? [{ to: '/pengesahan', label: 'Pengesahan murid', n: counts.claims, hint: 'Anak yang didaftarkan ibu bapa' }] : []),
    ...(r.isStaff ? [{ to: '/kutipan', label: 'Keluarga belum lunas', n: counts.unpaid, hint: `Yuran ${settings?.current_year ?? ''}` }] : []),
  ]
  const outstanding = todos.filter((t) => t.n > 0 && t.to !== '/kutipan').reduce((a, t) => a + t.n, 0)

  const todoCard = (
    <div className="feecard todo-card">
      <div className="feecard-top"><span>Perlu tindakan</span><span className="pbadge gold">{role}</span></div>
      <Live as="div" className="big-amount">{loaded ? outstanding : '…'}</Live>
      <Live as="div" className="caption">{!loaded ? 'Memuatkan…' : outstanding ? 'perkara menunggu tindakan anda' : 'Tiada perkara tertunggak. Syabas!'}</Live>
      <div className="todo-list">
        {todos.length ? todos.map((t) => (
          <Link key={t.to} to={t.to} className="todo-row">
            <div><b>{t.label}</b><span>{t.hint}</span></div>
            <Live className={`todo-n ${t.n && t.to !== '/kutipan' ? 'hot' : ''}`}>{t.n}</Live>
          </Link>
        )) : <div className="pinfo blue">Anda boleh membaca memo, melihat dana dan menyertai mesyuarat agung.</div>}
      </div>
    </div>
  )

  const tiles: QuickTile[] = r.isStaff
    ? [
        { to: '/semakan-bayaran', img: '/icons/bayar.png', label: 'Semak bayaran', tint: 't-gold', badge: counts.payments },
        { to: '/rekod', img: '/icons/anak.png', label: 'Rekod murid', tint: 't-blue' },
        { to: '/memo', img: '/icons/memo.png', label: 'Memo', tint: 't-red' },
        { to: '/agm', img: '/icons/mesyuarat.png', label: 'Mesyuarat', tint: 't-green' },
      ]
    : [
        r.canVerify
          ? { to: '/pengesahan', img: '/icons/anak.png', label: 'Sahkan murid', tint: 't-blue', badge: counts.claims }
          : { to: '/kelas', img: '/icons/anak.png', label: 'Kelas saya', tint: 't-blue' },
        { to: '/dana', img: '/icons/bayar.png', label: 'Dana PIBG', tint: 't-gold' },
        { to: '/memo', img: '/icons/memo.png', label: 'Memo', tint: 't-red' },
        { to: '/agm', img: '/icons/mesyuarat.png', label: 'Mesyuarat', tint: 't-green' },
      ]

  const drivesBlock = drives.length > 0 && (
    <div className={mobile ? 'home-sec' : ''} style={mobile ? undefined : { marginTop: 20 }}>
      <div className="sec-head"><h2>Kutipan dana</h2><Link to={r.isStaff ? '/kempen' : '/sumbangan'}>Semua →</Link></div>
      <div className="campaign-grid">
        {drives.map((c) => <CampaignCard key={c.id} c={c} p={prog[c.id]} to={r.isStaff ? `/kempen/${c.id}` : `/sumbangan/${c.id}`} compact />)}
      </div>
    </div>
  )

  if (mobile) {
    return (
      <div className="up">
        <div className="hero">
          <div className="deco-ring" style={{ right: -60, top: -40, width: 220, height: 220 }} />
          <div className="deco-disc" style={{ right: 60, top: 120, width: 90, height: 90 }} />
          <div className="hero-top">
            <div className="hero-brand"><img src="/logo.png" alt="Logo PIBG SK Puncak Alam" /><div><strong>Portal PIBG</strong><span>{settings?.school_name ?? 'SK Puncak Alam'}</span></div></div>
            <button className="avatar" onClick={() => nav('/profil')} aria-label="Profil saya">{initials(profile?.full_name)}</button>
          </div>
          <div className="hero-date">{todayLong()}</div>
          <div className="hero-hi">Hai, {name}!</div>
        </div>
        {todoCard}
        <QuickTiles tiles={tiles} mobile />
        {memos.length > 0 && (
          <div className="home-sec">
            <div className="sec-head"><h2>Memo terkini</h2><Link to="/memo">Semua →</Link></div>
            <div className="memo-carousel">{memos.map((m, i) => <MemoTile key={m.id} m={m} i={i} read={read} />)}</div>
          </div>
        )}
        {drivesBlock}
        <div className="home-sec" style={{ paddingBottom: 24 }}><DanaCard fund={fund} /></div>
      </div>
    )
  }

  return (
    <>
      <div className="dhero">
        <div className="deco-ring" style={{ right: -80, top: -120, width: 320, height: 320, borderWidth: 40 }} />
        <div className="deco-disc" style={{ left: '38%', bottom: -60, width: 160, height: 160 }} />
        <div>
          <div className="date">{todayLong()}</div>
          <div className="hi">Hai, {name}!</div>
          <p>Ringkasan terkini PIBG {settings?.school_name ?? 'SK Puncak Alam'}.</p>
          <div className="pills">
            <span>{role}</span>
            {r.myClasses.length > 0 && <span translate="no">Kelas {r.myClasses.map((c) => c.name).join(', ')}</span>}
          </div>
        </div>
        {todoCard}
      </div>
      <QuickTiles tiles={tiles} mobile={false} />
      <div className="pgrid eq">
        <div className="pcard">
          <div className="pcard-head"><h2>Memo terkini</h2><Link to="/memo">Semua memo →</Link></div>
          {memos.length ? <div className="memo-grid">{memos.map((m, i) => <MemoTile key={m.id} m={m} i={i} read={read} />)}</div> : <div className="pempty">Belum ada memo.</div>}
        </div>
        <DanaCard fund={fund} large />
      </div>
      {drivesBlock}
    </>
  )
}
