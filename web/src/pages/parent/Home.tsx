import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useFamily } from '../../lib/useFamily'
import { rm, feeStatusLabel } from '../../lib/util'
import { PBadge, Ring, firstName, initials, shortRM, tintBg, todayLong, useIsMobile, dayMonth } from '../../components/pui'
import CampaignCard from '../../components/CampaignCard'
import { loadProgress, type Campaign, type Progress } from '../../lib/donations'
import type { FundSummary } from '../Dashboard'

interface MemoLite { id: number; title: string; published_at: string; pinned: boolean; audience: string; author: { full_name: string } | null }

const feeTone = { lunas: 'green', menunggu: 'amber', belum: 'red' } as const

export default function ParentHome() {
  const { profile, settings } = useAuth()
  const { familyId, fee, kids, latestReceipt } = useFamily()
  const mobile = useIsMobile()
  const nav = useNavigate()
  const [memos, setMemos] = useState<MemoLite[]>([])
  const [read, setRead] = useState<Set<number>>(new Set())
  const [fund, setFund] = useState<FundSummary | null>(null)
  const [drives, setDrives] = useState<Campaign[]>([])
  const [prog, setProg] = useState<Record<number, Progress>>({})

  useEffect(() => {
    supabase.from('memos').select('id,title,published_at,pinned,audience,author:profiles!memos_author_id_fkey(full_name)')
      .order('pinned', { ascending: false }).order('published_at', { ascending: false }).limit(4)
      .then(({ data }) => setMemos((data as unknown as MemoLite[]) ?? []))
    if (profile) supabase.from('memo_reads').select('memo_id').eq('user_id', profile.id)
      .then(({ data }) => setRead(new Set(((data ?? []) as { memo_id: number }[]).map((x) => x.memo_id))))
    supabase.rpc('fund_summary').then(({ data }) => setFund((data as FundSummary[] | null)?.[0] ?? null))
    supabase.from('campaigns').select('*').eq('status', 'aktif').order('created_at', { ascending: false }).limit(2)
      .then(({ data }) => setDrives((data as Campaign[]) ?? []))
    loadProgress().then(setProg)
  }, [profile])

  const name = firstName(profile?.full_name)
  const status = fee?.status ?? 'belum'
  const balance = fee ? Math.max(0, Number(fee.fee_due) - Number(fee.paid)) : 0
  const amount = status === 'belum' ? balance : Number(fee?.fee_due ?? 0)
  const caption = { belum: 'Baki perlu dibayar untuk sekeluarga', menunggu: 'Bukti bayaran sedang disemak bendahari', lunas: 'Telah dibayar sepenuhnya. Terima kasih!' }[status]
  const paidPct = fund && fund.families_total ? (fund.families_paid / fund.families_total) * 100 : 0
  const surplus = Number(fund?.balance ?? 0)

  const feeCard = !familyId ? (
    <div className="feecard">
      <div className="feecard-top"><span>Yuran PIBG {settings?.current_year}</span></div>
      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 10 }}>Daftarkan anak anda</div>
      <div className="caption">Tambah nama dan kelas setiap anak. Guru kelas akan mengesahkannya, dan anak-anak dikumpulkan sebagai satu keluarga supaya yuran dibayar sekali sahaja.</div>
      <Link className="pbtn" to="/anak" state={{ tab: 'tambah' }}>Tambah anak →</Link>
    </div>
  ) : fee ? (
    <div className="feecard">
      <div className="feecard-top">
        <span>Yuran PIBG {fee.year} · <span className="mono" translate="no">{fee.family_code}</span></span>
        <PBadge tone={feeTone[status]}>{feeStatusLabel[status]}</PBadge>
      </div>
      <div className="big-amount">{rm(amount)}</div>
      <div className="caption">{caption}</div>
      <div className="chips">{kids.map((k) => <span key={k.id} className="pchip" translate="no">{firstName(k.full_name)} · {k.className}</span>)}</div>
      {status === 'belum' && <Link className="pbtn" to="/yuran" state={{ tab: 'bayar' }}>Bayar sekarang →</Link>}
      {status === 'menunggu' && <div className="pinfo amber" style={{ textAlign: 'center' }}>Bendahari akan sahkan dalam 1–3 hari</div>}
      {status === 'lunas' && latestReceipt && <Link className="pbtn green" to={`/resit/${latestReceipt.id}`}>Lihat resit {latestReceipt.receipt_no}</Link>}
    </div>
  ) : <div className="feecard"><div className="caption">Memuatkan…</div></div>

  const tiles = [
    { to: '/yuran', state: { tab: 'bayar' }, icon: '◆', label: 'Bayar yuran', t: 't-gold' },
    { to: '/anak', icon: '☺', label: 'Anak saya', t: 't-blue' },
    { to: '/memo', icon: '✉', label: 'Memo', t: 't-red' },
    { to: '/agm', icon: '☑', label: 'Mesyuarat', t: 't-green' },
  ]

  const memoCard = (m: MemoLite, i: number) => {
    const dm = dayMonth(m.published_at)
    const flag = m.pinned ? 'Disemat' : !read.has(m.id) ? 'Baru' : m.audience === 'kelas' ? 'Kelas' : 'Umum'
    return (
      <Link key={m.id} to={`/memo#${m.id}`} className="memo-card" style={{ background: tintBg(i) }}>
        <div className="top"><span>{dm.day} {dm.month}</span><span className="flag">{flag}</span></div>
        <div className="title">{m.title}</div>
        <div className="by">{m.author?.full_name ?? 'PIBG'}</div>
      </Link>
    )
  }

  const danaCard = (
    <div className="pcard">
      <div className="pcard-head"><h2>Dana PIBG {fund?.year ?? ''}</h2><Link to="/dana">Butiran →</Link></div>
      <div className="ring-row">
        <Ring pct={paidPct} large={!mobile} />
        <div><b>{fund?.families_paid ?? 0} daripada {fund?.families_total ?? 0} keluarga</b><span className="sub">telah melunaskan yuran tahun ini</span></div>
      </div>
      <div className="mini-tiles">
        <div><span>Dikutip</span><b>{shortRM(Number(fund?.yuran_collected ?? 0) + Number(fund?.donations ?? 0))}</b></div>
        <div><span>Belanja</span><b>{shortRM(fund?.expenses)}</b></div>
        <div className={surplus < 0 ? 'neg' : 'pos'}><span>{surplus < 0 ? 'Kurangan' : 'Lebihan'}</span><b>{shortRM(surplus)}</b></div>
      </div>
    </div>
  )

  const drivesBlock = drives.length > 0 && (
    <div className={mobile ? 'home-sec' : ''} style={mobile ? undefined : { marginTop: 20 }}>
      <div className="sec-head"><h2>Kutipan dana</h2><Link to="/sumbangan">Semua →</Link></div>
      <div className="campaign-grid">{drives.map((c) => <CampaignCard key={c.id} c={c} p={prog[c.id]} to={`/sumbangan/${c.id}`} compact />)}</div>
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
        {feeCard}
        <div className="quick">
          {tiles.map((t) => <Link key={t.to} to={t.to} state={t.state}><span className={`tile ${t.t}`} aria-hidden="true">{t.icon}</span>{t.label}</Link>)}
        </div>
        {memos.length > 0 && (
          <div className="home-sec">
            <div className="sec-head"><h2>Memo terkini</h2><Link to="/memo">Semua →</Link></div>
            <div className="memo-carousel">{memos.map(memoCard)}</div>
          </div>
        )}
        {drivesBlock}
        <div className="home-sec" style={{ paddingBottom: 24 }}>{danaCard}</div>
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
          <p>Ringkasan terkini PIBG {settings?.school_name ?? 'SK Puncak Alam'} untuk keluarga anda.</p>
          {kids.length > 0 && <div className="pills">{kids.map((k) => <span key={k.id} translate="no">{firstName(k.full_name)} · {k.className}</span>)}</div>}
        </div>
        {feeCard}
      </div>
      <div className="dquick">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to} state={t.state} className={t.t}><span className="ico" aria-hidden="true">{t.icon}</span>{t.label}</Link>
        ))}
      </div>
      <div className="pgrid">
        <div className="pcard">
          <div className="pcard-head"><h2>Memo terkini</h2><Link to="/memo">Semua memo →</Link></div>
          {memos.length ? <div className="memo-grid">{memos.map(memoCard)}</div> : <div className="pempty">Belum ada memo.</div>}
        </div>
        {danaCard}
      </div>
      {drivesBlock}
    </>
  )
}
