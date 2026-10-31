import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth, useRole } from '../lib/auth'
import { feeStatusLabel, rm, roleLabel } from '../lib/util'
import { useFamily } from '../lib/useFamily'
import CampaignCard from '../components/CampaignCard'
import { DanaCard, MemoTile, MEMO_SELECT, type MemoLite } from '../components/HomeParts'
import { Live, PBadge, QuickTiles, shortRM, type QuickTile, firstName, initials, todayLong, useIsMobile } from '../components/pui'
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
  const fam = useFamily()
  const canPay = r.can('semak_bayaran')
  const canDon = r.can('semak_sumbangan')
  const canDrive = r.can('kempen') || canDon

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
    if (canPay) jobs.push(supabase.from('fee_payments').select('id', head).eq('status', 'dihantar')
      .then(({ count }) => setCounts((c) => ({ ...c, payments: count ?? 0 }))))
    if (canDon) jobs.push(supabase.from('donations').select('id', head).eq('status', 'dihantar')
      .then(({ count }) => setCounts((c) => ({ ...c, donations: count ?? 0 }))))
    Promise.all(jobs).then(() => setLoaded(true))
  }, [canPay, canDon, profile])

  const name = firstName(profile?.full_name)
  const role = roleLabel[r.role]

  // Hero option 1a (design handoff "Admin Hero"): collection panel + task tiles
  const tasks: Todo[] = [
    ...(canPay ? [{ to: '/semakan-bayaran', label: 'Bukti yuran', n: counts.payments, hint: 'Sahkan & keluarkan resit' }] : []),
    ...(canDon ? [{ to: '/kempen', label: 'Sumbangan', n: counts.donations, hint: 'Kutipan dana berjalan' }] : []),
    ...(r.canVerify ? [{ to: '/pengesahan', label: 'Pengesahan murid', n: counts.claims, hint: 'Didaftarkan ibu bapa' }] : []),
  ]
  const outstanding = tasks.reduce((a, t) => a + t.n, 0)
  const headline = !loaded ? 'Memuatkan…' : outstanding ? `${outstanding} perkara menunggu tindakan anda hari ini.` : 'Tiada perkara tertunggak. Syabas!'
  const famTotal = Number(fund?.families_total ?? 0)
  const famPaid = Number(fund?.families_paid ?? 0)
  const paidPct = famTotal ? Math.round((famPaid / famTotal) * 100) : 0

  const collection = (
    <div className="ah-collect">
      <div className="ah-ring" style={{ background: `conic-gradient(var(--accent) ${paidPct * 3.6}deg, rgba(255,255,255,.14) 0)` }} role="img" aria-label={`${paidPct} peratus keluarga lunas`}>
        <span translate="no">{`${paidPct}%`}</span>
      </div>
      <div style={{ minWidth: 0 }}>
        <Live as="div" className="ah-eyebrow">{`KUTIPAN YURAN ${fund?.year ?? settings?.current_year ?? ''}`}</Live>
        <Live as="div" className="ah-amount">{shortRM(fund?.yuran_collected ?? 0)}</Live>
        <Live as="div" className="ah-sub">{fund ? `${famPaid} / ${famTotal} keluarga lunas · ${Math.max(0, famTotal - famPaid)} belum` : '…'}</Live>
      </div>
    </div>
  )

  const taskTiles = tasks.length > 0 && (
    <div className="ah-tasks" style={{ ['--n' as string]: tasks.length }}>
      {tasks.map((t) => (
        <Link key={t.to} to={t.to} className={`ah-task ${t.n ? 'hot' : 'clear'}`}>
          <Live className="num">{t.n ? t.n : '✓'}</Live>
          <div className="txt"><b>{t.label}</b><span>{t.hint}</span></div>
          {t.n ? <span className="arrow" aria-hidden="true">→</span> : null}
        </Link>
      ))}
    </div>
  )

  const hero = (
    <div className={`ahero ${mobile ? 'mob' : ''}`}>
      <div className="ah-deco" />
      {mobile && (
        <div className="hero-top">
          <div className="hero-brand"><img src="/logo.png" alt="Logo PIBG SK Puncak Alam" /><div><strong>Portal PIBG</strong><span>{settings?.school_name ?? 'SK Puncak Alam'}</span></div></div>
          <button className="avatar" onClick={() => nav('/profil')} aria-label="Profil saya">{initials(profile?.full_name)}</button>
        </div>
      )}
      <div className="ah-top">
        <div>
          <div className="ah-date">{todayLong()} · {role}</div>
          <div className="ah-hi">Hai, {name}!</div>
          <Live as="div" className="ah-head">{headline}</Live>
        </div>
        {collection}
      </div>
      {taskTiles}
    </div>
  )

  // first four shortcuts this user can open
  const tiles: QuickTile[] = ([
    canPay && { to: '/semakan-bayaran', img: '/icons/bayar.png', label: 'Semak bayaran', tint: 't-gold', badge: counts.payments },
    r.canVerify && { to: '/pengesahan', img: '/icons/anak.png', label: 'Sahkan murid', tint: 't-blue', badge: counts.claims },
    r.can('rekod_urus') && { to: '/rekod', img: '/icons/anak.png', label: 'Rekod murid', tint: 't-blue' },
    !r.canVerify && r.myClasses.length > 0 && { to: '/kelas', img: '/icons/anak.png', label: 'Kelas saya', tint: 't-blue' },
    r.can('kempen') && { to: '/kempen', img: '/icons/bayar.png', label: 'Kutipan dana', tint: 't-gold' },
    r.can('laporan') && { to: '/laporan', img: '/icons/bayar.png', label: 'Laporan', tint: 't-blue' },
    { to: '/memo', img: '/icons/memo.png', label: 'Memo', tint: 't-red' },
    { to: '/agm', img: '/icons/mesyuarat.png', label: 'Mesyuarat', tint: 't-green' },
    { to: '/dana', img: '/icons/bayar.png', label: 'Dana PIBG', tint: 't-gold' },
  ].filter(Boolean) as QuickTile[])
    .slice(0, 4)

  // committee / chairman / admin are parents too
  const feeTone = { lunas: 'green', menunggu: 'amber', belum: 'red' } as const
  const famStatus = fam.fee?.status ?? 'belum'
  const familyCard = r.hasFamily && (
    <div className="pcard family-card">
      <div className="pcard-head">
        <h2>Keluarga saya</h2>
        {fam.fee && <span className="row gap" style={{ alignItems: 'center' }}><span className="mono small" translate="no">{fam.fee.family_code}</span><PBadge tone={feeTone[famStatus]}>{feeStatusLabel[famStatus]}</PBadge></span>}
      </div>
      {fam.familyId && fam.fee ? (
        <div className="family-row">
          <div>
            <Live as="b">{famStatus === 'lunas' ? `Yuran ${fam.fee.year} telah dilunaskan` : `Yuran ${fam.fee.year}: ${rm(Math.max(0, Number(fam.fee.fee_due) - Number(fam.fee.paid)))}`}</Live>
            <div className="chips">{fam.kids.map((k) => <span key={k.id} className="pchip" translate="no">{firstName(k.full_name)} · {k.className}</span>)}</div>
          </div>
          <div className="row gap wrap">
            <Link className="pbtn sec small" to="/anak">Anak saya</Link>
            {famStatus === 'lunas' && fam.latestReceipt
              ? <Link className="pbtn green small" to={`/resit/${fam.latestReceipt.id}`}>Resit {fam.latestReceipt.receipt_no}</Link>
              : famStatus === 'belum' && <Link className="pbtn small" to="/yuran" state={{ tab: 'bayar' }}>Bayar yuran →</Link>}
          </div>
        </div>
      ) : (
        <div className="family-row">
          <span className="muted">Anda juga ibu bapa murid sekolah ini? Daftarkan anak anda untuk membayar yuran, menyumbang dan mengundi sebagai keluarga.</span>
          <Link className="pbtn small" to="/anak" state={{ tab: 'tambah' }}>Tambah anak →</Link>
        </div>
      )}
    </div>
  )

  const drivesBlock = drives.length > 0 && (
    <div className={mobile ? 'home-sec' : ''} style={mobile ? undefined : { marginTop: 20 }}>
      <div className="sec-head"><h2>Kutipan dana</h2><Link to={canDrive ? '/kempen' : '/sumbangan'}>Semua →</Link></div>
      <div className="campaign-grid">
        {drives.map((c) => <CampaignCard key={c.id} c={c} p={prog[c.id]} to={canDrive ? `/kempen/${c.id}` : `/sumbangan/${c.id}`} compact />)}
      </div>
    </div>
  )

  if (mobile) {
    return (
      <div className="up">
        {hero}
        <QuickTiles tiles={tiles} mobile />
        {familyCard && <div className="home-sec">{familyCard}</div>}
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
      {hero}
      <QuickTiles tiles={tiles} mobile={false} />
      {familyCard && <div style={{ marginBottom: 20 }}>{familyCard}</div>}
      <div className="pgrid eq">
        <div className="pcard">
          <div className="pcard-head"><h2>Memo terkini</h2><Link to="/memo">Semua memo →</Link></div>
          {memos.length ? <div className="memo-grid">{memos.map((m, i) => <MemoTile key={m.id} m={m} i={i} read={read} />)}</div> : <div key="empty" className="pempty">Belum ada memo.</div>}
        </div>
        <DanaCard fund={fund} large />
      </div>
      {drivesBlock}
    </>
  )
}
