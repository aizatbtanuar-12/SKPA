import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase, check } from '../lib/supabase'
import { useAuth, useRole } from '../lib/auth'
import { PageHead } from '../components/Layout'
import { Badge, Card, Empty, Field, Modal, Stat, useAction } from '../components/ui'
import { dateTime, type Tone } from '../lib/util'

interface Meeting { id: number; title: string; meeting_date: string | null; venue: string | null; status: string; quorum: number }
interface Motion { id: number; meeting_id: number; title: string; description: string | null; options: string[]; status: string; sort: number }
interface Result { choice: string; votes: number }

const stLabel: Record<string, [string, Tone]> = { draf: ['Draf', 'grey'], dibuka: ['Dibuka', 'green'], ditutup: ['Ditutup', 'blue'] }

export default function Agm() {
  const { familyId } = useAuth()
  const r = useRole()
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [sel, setSel] = useState<number | null>(null)
  const [motions, setMotions] = useState<Motion[]>([])
  const [results, setResults] = useState<Record<number, Result[]>>({})
  const [myVotes, setMyVotes] = useState<Record<number, string>>({})
  const [present, setPresent] = useState(false)
  const [stats, setStats] = useState<{ families_present: number; quorum: number } | null>(null)
  const [newMeeting, setNewMeeting] = useState(false)
  const [newMotion, setNewMotion] = useState(false)
  const [code, setCode] = useState('')
  const { busy, run } = useAction()

  const loadMeetings = useCallback(async () => {
    const { data } = await supabase.from('agm_meetings').select('*').order('meeting_date', { ascending: false, nullsFirst: true })
    const list = (data as Meeting[]) ?? []
    setMeetings(list)
    setSel((s) => s ?? list[0]?.id ?? null)
  }, [])
  useEffect(() => { loadMeetings() }, [loadMeetings])

  const meeting = meetings.find((m) => m.id === sel) ?? null

  const loadDetail = useCallback(async () => {
    if (!sel) return
    const { data } = await supabase.from('agm_motions').select('*').eq('meeting_id', sel).order('sort').order('id')
    const mots = (data as Motion[]) ?? []
    setMotions(mots)
    const res: Record<number, Result[]> = {}
    await Promise.all(mots.filter((m) => r.can('agm') ? m.status !== 'draf' : m.status === 'ditutup').map(async (m) => {
      const { data: rr } = await supabase.rpc('motion_results', { p_motion: m.id })
      res[m.id] = (rr as Result[]) ?? []
    }))
    setResults(res)
    if (familyId) {
      const [att, v] = await Promise.all([
        supabase.from('agm_attendance').select('meeting_id').eq('meeting_id', sel).eq('family_id', familyId).maybeSingle(),
        supabase.from('agm_votes').select('motion_id,choice').eq('family_id', familyId),
      ])
      setPresent(Boolean(att.data))
      setMyVotes(Object.fromEntries(((v.data ?? []) as { motion_id: number; choice: string }[]).map((x) => [x.motion_id, x.choice])))
    }
    const { data: st } = await supabase.rpc('agm_stats', { p_meeting: sel })
    setStats((st as { families_present: number; quorum: number }[] | null)?.[0] ?? null)
  }, [sel, familyId, r.can('agm')])

  useEffect(() => { loadDetail() }, [loadDetail])
  // live refresh while the meeting is open
  useEffect(() => {
    if (meeting?.status !== 'dibuka') return
    const t = setInterval(loadDetail, 8000)
    return () => clearInterval(t)
  }, [meeting?.status, loadDetail])

  const setMeetingStatus = (status: string) => run(async () => {
    check(await supabase.from('agm_meetings').update({ status }).eq('id', sel!)); loadMeetings()
  })
  const setMotionStatus = (id: number, status: string) => run(async () => {
    check(await supabase.from('agm_motions').update({ status }).eq('id', id)); loadDetail()
  })
  const checkIn = () => run(async () => { check(await supabase.rpc('agm_check_in', { p_meeting: sel })); loadDetail() }, 'Kehadiran direkod.')
  const vote = (m: Motion, choice: string) => run(async () => {
    check(await supabase.rpc('cast_vote', { p_motion: m.id, p_choice: choice })); loadDetail()
  }, 'Undian anda telah direkod.')
  const counterCheckIn = (e: FormEvent) => { e.preventDefault(); run(async () => {
    const { data } = await supabase.from('families').select('id').eq('family_code', code.trim().toUpperCase()).maybeSingle()
    if (!data) throw new Error('Kod keluarga tidak dijumpai.')
    check(await supabase.rpc('agm_check_in', { p_meeting: sel, p_family: (data as { id: number }).id }))
    setCode(''); loadDetail()
  }, 'Kehadiran keluarga direkod.') }

  return (
    <>
      <PageHead title="Mesyuarat Agung PIBG" sub="Kehadiran dan undian dikira satu bagi setiap keluarga."
        actions={
          <>
            {meetings.length > 1 && (
              <select value={sel ?? ''} onChange={(e) => setSel(Number(e.target.value))}>
                {meetings.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
            )}
            {r.can('agm') && <button className="btn primary" onClick={() => setNewMeeting(true)}>+ Mesyuarat</button>}
          </>
        } />

      {!meeting ? <Empty>Belum ada mesyuarat dijadualkan.</Empty> : (
        <>
          <Card title={meeting.title} actions={<Badge tone={stLabel[meeting.status][1]}>{stLabel[meeting.status][0]}</Badge>}>
            <p className="small">{dateTime(meeting.meeting_date)}{meeting.venue ? ` · ${meeting.venue}` : ''}</p>
            {stats && (
              <div className="stats tight">
                <Stat label="Keluarga hadir" value={stats.families_present} />
                <Stat label="Korum" value={stats.quorum || '-'}
                  tone={stats.quorum ? (stats.families_present >= stats.quorum ? 'green' : 'amber') : undefined}
                  sub={stats.quorum ? (stats.families_present >= stats.quorum ? 'Korum dicapai' : 'Belum cukup korum') : undefined} />
              </div>
            )}
            {r.hasFamily && (
              !familyId ? <p className="muted">Akaun anda perlu dipautkan kepada keluarga murid untuk hadir dan mengundi.</p>
              : present ? <div className="alert ok">Kehadiran keluarga anda telah direkod.</div>
              : meeting.status === 'dibuka' ? <button className="btn primary" disabled={busy} onClick={checkIn}>Daftar kehadiran saya</button>
              : <p className="muted">Pendaftaran kehadiran akan dibuka pada hari mesyuarat.</p>
            )}
            {r.can('agm') && (
              <div className="row gap wrap">
                {meeting.status !== 'dibuka' && <button className="btn" onClick={() => setMeetingStatus('dibuka')}>Buka kehadiran</button>}
                {meeting.status === 'dibuka' && <button className="btn" onClick={() => setMeetingStatus('ditutup')}>Tutup mesyuarat</button>}
                <form className="row gap" onSubmit={counterCheckIn}>
                  <input placeholder="Kod keluarga (kaunter)" value={code} onChange={(e) => setCode(e.target.value)} />
                  <button className="btn" disabled={busy || !code}>Daftar hadir</button>
                </form>
              </div>
            )}
          </Card>

          <Card title="Usul" actions={r.can('agm') && <button className="btn" onClick={() => setNewMotion(true)}>+ Usul</button>}>
            {motions.filter((m) => r.can('agm') || m.status !== 'draf').length ? (
              <div className="motions">
                {motions.filter((m) => r.can('agm') || m.status !== 'draf').map((m, i) => {
                  const res = results[m.id]
                  const total = res?.reduce((a, x) => a + Number(x.votes), 0) ?? 0
                  return (
                    <div key={m.id} className="motion">
                      <div className="row between">
                        <strong>Usul {i + 1}: {m.title}</strong>
                        <Badge tone={stLabel[m.status][1]}>{stLabel[m.status][0]}</Badge>
                      </div>
                      {m.description && <p className="small">{m.description}</p>}

                      {r.hasFamily && m.status === 'dibuka' && (
                        myVotes[m.id] ? <div className="alert ok">Undian keluarga anda: <b>{myVotes[m.id]}</b></div>
                        : !present ? <p className="muted small">Daftar kehadiran dahulu untuk mengundi.</p>
                        : <div className="row gap wrap">{m.options.map((o) => (
                            <button key={o} className="btn" disabled={busy} onClick={() => vote(m, o)}>{o}</button>
                          ))}</div>
                      )}

                      {res && (
                        <div className="bars">
                          {res.map((x) => (
                            <div key={x.choice} className="bar-row">
                              <span>{x.choice}</span>
                              <div className="bar"><div style={{ width: total ? `${(Number(x.votes) / total) * 100}%` : 0 }} /></div>
                              <b>{x.votes}</b>
                            </div>
                          ))}
                          <span className="muted small">{total} undian{m.status === 'dibuka' ? ' (langsung)' : ''}</span>
                        </div>
                      )}

                      {r.can('agm') && (
                        <div className="row gap">
                          {m.status === 'draf' && <button className="btn small" onClick={() => setMotionStatus(m.id, 'dibuka')}>Buka undian</button>}
                          {m.status === 'dibuka' && <button className="btn small" onClick={() => setMotionStatus(m.id, 'ditutup')}>Tutup & umum keputusan</button>}
                          {m.status === 'draf' && <button className="btn ghost small danger-text" onClick={() => run(async () => {
                            check(await supabase.from('agm_motions').delete().eq('id', m.id)); loadDetail()
                          })}>Padam</button>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : <Empty>Tiada usul lagi.</Empty>}
          </Card>
        </>
      )}

      {newMeeting && <MeetingModal onClose={() => setNewMeeting(false)} onDone={(id) => { setNewMeeting(false); setSel(id); loadMeetings() }} />}
      {newMotion && sel && <MotionModal meetingId={sel} count={motions.length} onClose={() => setNewMotion(false)} onDone={() => { setNewMotion(false); loadDetail() }} />}
    </>
  )
}

function MeetingModal({ onClose, onDone }: { onClose: () => void; onDone: (id: number) => void }) {
  const [f, setF] = useState({ title: '', meeting_date: '', venue: 'Dewan SK Puncak Alam', quorum: '' })
  const { busy, run } = useAction()
  const submit = (e: FormEvent) => { e.preventDefault(); run(async () => {
    const res = await supabase.from('agm_meetings').insert({
      title: f.title, venue: f.venue, quorum: Number(f.quorum || 0),
      meeting_date: f.meeting_date ? new Date(f.meeting_date).toISOString() : null,
    }).select('id').single()
    onDone((check(res) as { id: number }).id)
  }, 'Mesyuarat dicipta.') }
  return (
    <Modal title="Mesyuarat baru" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Tajuk"><input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="cth: Mesyuarat Agung PIBG Kali Ke-15" /></Field>
        <div className="row gap">
          <Field label="Tarikh & masa"><input type="datetime-local" value={f.meeting_date} onChange={(e) => setF({ ...f, meeting_date: e.target.value })} /></Field>
          <Field label="Korum (bil. keluarga)" hint="Rujuk perlembagaan PIBG."><input type="number" min="0" value={f.quorum} onChange={(e) => setF({ ...f, quorum: e.target.value })} /></Field>
        </div>
        <Field label="Tempat"><input value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} /></Field>
        <button className="btn primary" disabled={busy}>Cipta</button>
      </form>
    </Modal>
  )
}

function MotionModal({ meetingId, count, onClose, onDone }: { meetingId: number; count: number; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ title: '', description: '', options: 'Setuju, Tidak Setuju, Berkecuali' })
  const { busy, run } = useAction()
  const submit = (e: FormEvent) => { e.preventDefault(); run(async () => {
    const options = f.options.split(',').map((o) => o.trim()).filter(Boolean)
    if (options.length < 2) throw new Error('Sekurang-kurangnya dua pilihan.')
    check(await supabase.from('agm_motions').insert({ meeting_id: meetingId, title: f.title, description: f.description || null, options, sort: count + 1 }))
    onDone()
  }, 'Usul ditambah.') }
  return (
    <Modal title="Usul baru" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Usul"><input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="cth: Meluluskan penyata kewangan 2025" /></Field>
        <Field label="Keterangan"><textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Pilihan (dipisah dengan koma)" hint="Untuk pemilihan AJK, senaraikan nama calon."><input value={f.options} onChange={(e) => setF({ ...f, options: e.target.value })} /></Field>
        <button className="btn primary" disabled={busy}>Tambah</button>
      </form>
    </Modal>
  )
}
