import { useCallback, useEffect, useState } from 'react'
import { supabase, check } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useAction } from '../../components/ui'
import { PageHead, PBadge, useIsMobile } from '../../components/pui'
import { locale } from '../../lib/i18n'

interface Meeting { id: number; title: string; meeting_date: string | null; venue: string | null; status: string; quorum: number }
interface Motion { id: number; title: string; description: string | null; options: string[]; status: string }
interface Result { choice: string; votes: number }

const when = (d: string | null) => d
  ? new Date(d).toLocaleString(locale(), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  : 'Tarikh akan dimaklumkan'

export default function ParentAgm() {
  const { familyId } = useAuth()
  const mobile = useIsMobile()
  const [meeting, setMeeting] = useState<Meeting | null | undefined>(undefined)
  const [motions, setMotions] = useState<Motion[]>([])
  const [results, setResults] = useState<Record<number, Result[]>>({})
  const [myVotes, setMyVotes] = useState<Record<number, string>>({})
  const [present, setPresent] = useState(false)
  const [stats, setStats] = useState<{ families_present: number; quorum: number } | null>(null)
  const [idx, setIdx] = useState(0)
  const { busy, run } = useAction()

  const load = useCallback(async () => {
    const { data: ms } = await supabase.from('agm_meetings').select('*').order('meeting_date', { ascending: false, nullsFirst: true }).limit(1)
    const m = ((ms as Meeting[]) ?? [])[0] ?? null
    setMeeting(m)
    if (!m) return
    const { data } = await supabase.from('agm_motions').select('*').eq('meeting_id', m.id).neq('status', 'draf').order('sort').order('id')
    const mots = (data as Motion[]) ?? []
    setMotions(mots)
    const res: Record<number, Result[]> = {}
    await Promise.all(mots.filter((x) => x.status === 'ditutup').map(async (x) => {
      const { data: rr } = await supabase.rpc('motion_results', { p_motion: x.id })
      res[x.id] = (rr as Result[]) ?? []
    }))
    setResults(res)
    if (familyId) {
      const [att, v] = await Promise.all([
        supabase.from('agm_attendance').select('meeting_id').eq('meeting_id', m.id).eq('family_id', familyId).maybeSingle(),
        supabase.from('agm_votes').select('motion_id,choice').eq('family_id', familyId),
      ])
      setPresent(Boolean(att.data))
      setMyVotes(Object.fromEntries(((v.data ?? []) as { motion_id: number; choice: string }[]).map((x) => [x.motion_id, x.choice])))
    }
    const { data: st } = await supabase.rpc('agm_stats', { p_meeting: m.id })
    setStats((st as { families_present: number; quorum: number }[] | null)?.[0] ?? null)
  }, [familyId])

  useEffect(() => { load() }, [load])
  useEffect(() => { // live refresh while the meeting is open
    if (meeting?.status !== 'dibuka') return
    const t = setInterval(load, 8000)
    return () => clearInterval(t)
  }, [meeting?.status, load])
  useEffect(() => { if (idx > motions.length - 1) setIdx(Math.max(0, motions.length - 1)) }, [idx, motions.length])

  const checkIn = () => run(async () => { check(await supabase.rpc('agm_check_in', { p_meeting: meeting!.id })); await load() }, 'Kehadiran direkod.')
  const vote = (m: Motion, choice: string) => run(async () => {
    check(await supabase.rpc('cast_vote', { p_motion: m.id, p_choice: choice })); await load()
  }, 'Undian anda telah direkod.')

  const head = <PageHead title={mobile ? 'Mesyuarat Agung' : 'Mesyuarat Agung PIBG'} sub="Satu kehadiran & satu undi bagi setiap keluarga" />
  if (meeting === undefined) return <>{head}<div key="empty" className="pempty">Memuatkan…</div></>
  if (!meeting) return <>{head}<div key="empty" className="pcard pempty">Belum ada mesyuarat dijadualkan.</div></>

  const open = meeting.status === 'dibuka'
  const quorum = stats?.quorum || meeting.quorum
  const presentN = stats?.families_present ?? 0

  const meetingCard = (
    <div className="pnavy agm-card up">
      <div className="deco-ring" style={{ right: -70, top: -70, width: 200, height: 200, borderColor: 'var(--logo-red)', opacity: 0.25 }} />
      {open ? <PBadge tone="gold">Pendaftaran dibuka</PBadge> : <PBadge tone="ghost">{meeting.status === 'ditutup' ? 'Ditutup' : 'Akan datang'}</PBadge>}
      <h2>{meeting.title}</h2>
      <div className="when">{when(meeting.meeting_date)}{meeting.venue ? ` · ${meeting.venue}` : ''}</div>
      <div className="count"><span>{presentN} keluarga hadir</span>{quorum ? <span>Korum {quorum}</span> : null}</div>
      <div className="gold-track"><div style={{ width: `${quorum ? Math.min(100, (presentN / quorum) * 100) : 0}%` }} /></div>
      {!familyId ? <div className="pinfo amber" style={{ marginTop: 16 }}>Akaun anda perlu dipautkan kepada keluarga murid untuk hadir dan mengundi.</div>
        : present ? <div className="pbtn green" style={{ cursor: 'default' }}>✓ Kehadiran keluarga direkod</div>
        : open ? <button className="pbtn gold" disabled={busy} onClick={checkIn}>Daftar kehadiran saya</button>
        : <button className="pbtn dim" disabled>Dibuka pada hari mesyuarat</button>}
    </div>
  )

  const m = motions[idx]
  const motionCard = m ? (
    <div className="pcard motion up" key={m.id}>
      <div className="eyebrow-row">
        <span className="eyebrow">Usul {idx + 1}{mobile ? '' : ` · ${idx + 1} daripada ${motions.length}`}</span>
        <PBadge tone={m.status === 'dibuka' ? 'green' : 'blue'}>{m.status === 'dibuka' ? 'Undian dibuka' : 'Ditutup'}</PBadge>
      </div>
      <h3>{m.title}</h3>
      {m.description && <p>{m.description}</p>}
      {m.status === 'dibuka' && (
        myVotes[m.id] ? <div className="pinfo green">Undian keluarga anda: <b>{myVotes[m.id]}</b></div>
        : !present ? <div className="pinfo amber">Daftar kehadiran dahulu untuk mengundi.</div>
        : <div className="opt-btns">{m.options.map((o) => <button key={o} disabled={busy} onClick={() => vote(m, o)}>{o}</button>)}</div>
      )}
      {m.status === 'ditutup' && results[m.id] && (() => {
        const res = results[m.id]
        const total = res.reduce((a, r) => a + Number(r.votes), 0)
        return (
          <>
            <div className="res-bars">
              {res.map((r, i) => (
                <div key={r.choice}>
                  <div className="row1"><span>{r.choice}</span><span>{r.votes}</span></div>
                  <div className="track"><div style={{ width: total ? `${(Number(r.votes) / total) * 100}%` : 0, background: i === 0 ? '#1d8a4e' : i === 1 ? '#b3352b' : '#9aa0ad' }} /></div>
                </div>
              ))}
            </div>
            <p style={{ margin: '12px 0 0' }}>{total} undian · keputusan muktamad</p>
          </>
        )
      })()}
    </div>
  ) : <div key="empty" className="pcard pempty">Tiada usul lagi.</div>

  const nav = motions.length > 1 && (
    <div className="motion-nav">
      <button className="pbtn sec small" style={{ width: '100%' }} disabled={idx === 0} onClick={() => setIdx(idx - 1)}>‹ {mobile ? 'Sebelum' : 'Usul sebelum'}</button>
      <button className="pbtn sec small" style={{ width: '100%' }} disabled={idx >= motions.length - 1} onClick={() => setIdx(idx + 1)}>{mobile ? 'Seterusnya' : 'Usul seterusnya'} ›</button>
    </div>
  )

  if (mobile) {
    return (
      <>
        {head}
        {meetingCard}
        <div className="sec-head" style={{ marginTop: 22 }}><h2>Usul</h2>{motions.length > 0 && <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>{idx + 1} daripada {motions.length}</span>}</div>
        {motionCard}
        {nav}
      </>
    )
  }
  return (
    <>
      {head}
      <div className="pgrid">{meetingCard}<div>{motionCard}{nav}</div></div>
    </>
  )
}
