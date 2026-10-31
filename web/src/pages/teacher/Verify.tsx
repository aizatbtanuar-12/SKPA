import { useCallback, useEffect, useState } from 'react'
import { supabase, check } from '../../lib/supabase'
import { useRole } from '../../lib/auth'
import { PageHead } from '../../components/Layout'
import { Badge, Card, Field, Modal, useAction } from '../../components/ui'
import { claimLabel, claimTone, date, fmtIC, maskIC, relationLabel } from '../../lib/util'
import { DataTable } from '../../components/DataTable'

interface ClaimRow {
  id: number; child_name: string; child_ic: string | null; class_id: number; relation: string
  status: string; review_note: string | null; created_at: string
  parent: { full_name: string; ic_no: string | null; phone: string | null } | null
  classes: { name: string } | null
}
interface Suggestion { student_id: number; full_name: string; class_name: string; ic_last4: string | null; score: number; reason: string }

export default function Verify() {
  const acc = useRole()
  const { myClasses } = acc
  const isStaff = acc.can('sahkan_murid')
  const [rows, setRows] = useState<ClaimRow[]>([])
  const [filter, setFilter] = useState<'menunggu' | 'semua'>('menunggu')
  const [open, setOpen] = useState<ClaimRow | null>(null)

  const load = useCallback(async () => {
    let q = supabase.from('child_claims')
      .select('*, parent:profiles!child_claims_user_id_fkey(full_name,ic_no,phone), classes(name)')
      .order('created_at', { ascending: filter === 'menunggu' })
    if (filter === 'menunggu') q = q.eq('status', 'menunggu')
    const { data } = await q.limit(300)
    setRows((data as unknown as ClaimRow[]) ?? [])
  }, [filter])

  useEffect(() => { load() }, [load])

  return (
    <>
      <PageHead
        title="Pengesahan Murid"
        sub={isStaff ? 'Semua kelas' : `Kelas anda: ${myClasses.map((c) => c.name).join(', ') || '-'}`}
        actions={
          <div className="seg">
            <button className={filter === 'menunggu' ? 'on' : ''} onClick={() => setFilter('menunggu')}>Menunggu</button>
            <button className={filter === 'semua' ? 'on' : ''} onClick={() => setFilter('semua')}>Semua</button>
          </div>
        }
      />
      <p className="muted">
        Ibu bapa menambah nama anak mereka. Padankan dengan rekod murid sedia ada, atau cipta rekod baru jika murid
        belum ada dalam sistem. Selepas disahkan, anak-anak yang berkongsi No. KP ibu/bapa digabungkan sebagai satu keluarga secara automatik.
      </p>
      <Card>
        <DataTable rows={rows} rowKey={(r) => r.id} pageSize={15} resetKey={filter}
          initialSort={{ key: 'tarikh', dir: filter === 'menunggu' ? 'asc' : 'desc' }}
          empty={filter === 'menunggu' ? 'Tiada permohonan menunggu. 🎉' : 'Tiada rekod.'}
          cols={[
            { key: 'nama', label: 'Nama anak', sort: (r) => r.child_name, render: (r) => <><strong>{r.child_name}</strong>{r.child_ic && <div className="muted small">MyKid {fmtIC(r.child_ic)}</div>}</> },
            { key: 'kelas', label: 'Kelas', sort: (r) => r.classes?.name, render: (r) => r.classes?.name },
            { key: 'ibubapa', label: 'Ibu bapa', sort: (r) => r.parent?.full_name, render: (r) => <>{r.parent?.full_name}<div className="muted small">{relationLabel[r.relation]} · {r.parent?.phone || '-'}</div></> },
            { key: 'tarikh', label: 'Tarikh', sort: (r) => r.created_at, render: (r) => date(r.created_at) },
            { key: 'status', label: 'Status', sort: (r) => claimLabel[r.status], render: (r) => <Badge tone={claimTone[r.status]}>{claimLabel[r.status]}</Badge> },
            { key: 'aksi', label: '', render: (r) => r.status === 'menunggu' && <button className="btn primary small" onClick={() => setOpen(r)}>Semak</button> },
          ]} />
      </Card>
      {open && <ReviewModal claim={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); load() }} />}
    </>
  )
}

function ReviewModal({ claim, onClose, onDone }: { claim: ClaimRow; onClose: () => void; onDone: () => void }) {
  const [sug, setSug] = useState<Suggestion[] | null>(null)
  const [pick, setPick] = useState<string>('')
  const [note, setNote] = useState('')
  const { busy, run } = useAction()

  useEffect(() => {
    supabase.rpc('suggest_matches', { p_claim: claim.id }).then(({ data }) => {
      const s = (data as Suggestion[]) ?? []
      setSug(s)
      setPick(s.length && s[0].score >= 0.6 ? String(s[0].student_id) : 'baru')
    })
  }, [claim.id])

  const approve = () => run(async () => {
    check(await supabase.rpc('approve_claim', {
      p_claim: claim.id, p_student: pick === 'baru' ? null : Number(pick), p_note: note || null,
    }))
    onDone()
  }, pick === 'baru' ? 'Rekod murid baru dicipta dan dipautkan.' : 'Dipadankan dengan rekod sedia ada.')

  const reject = () => run(async () => {
    if (!note.trim()) throw new Error('Sila nyatakan sebab penolakan untuk makluman ibu bapa.')
    check(await supabase.rpc('reject_claim', { p_claim: claim.id, p_note: note }))
    onDone()
  }, 'Permohonan ditolak.')

  return (
    <Modal title={`Sahkan: ${claim.child_name}`} onClose={onClose}>
      <dl className="dl">
        <dt>Kelas dipilih</dt><dd>{claim.classes?.name}</dd>
        <dt>Ibu bapa</dt><dd>{claim.parent?.full_name} ({relationLabel[claim.relation]})</dd>
        <dt>No. KP ibu bapa</dt><dd>{maskIC(claim.parent?.ic_no)}</dd>
        <dt>Telefon</dt><dd>{claim.parent?.phone || '-'}</dd>
      </dl>
      <h3 className="h3">Padankan dengan rekod murid</h3>
      {sug === null ? <p className="muted">Mencari padanan…</p> : (
        <div className="choices">
          {sug.map((s) => (
            <label key={s.student_id} className={`choice ${pick === String(s.student_id) ? 'on' : ''}`}>
              <input type="radio" name="pick" value={s.student_id} checked={pick === String(s.student_id)} onChange={(e) => setPick(e.target.value)} />
              <div>
                <strong>{s.full_name}</strong>
                <span className="muted small"> {s.class_name} · MyKid …{s.ic_last4 || '????'}</span>
                <div className="small">{s.reason} ({Math.round(s.score * 100)}%)</div>
              </div>
            </label>
          ))}
          <label className={`choice ${pick === 'baru' ? 'on' : ''}`}>
            <input type="radio" name="pick" value="baru" checked={pick === 'baru'} onChange={(e) => setPick(e.target.value)} />
            <div><strong>Cipta rekod murid baru</strong><div className="small muted">Murid belum ada dalam senarai kelas.</div></div>
          </label>
        </div>
      )}
      <Field label="Catatan (wajib jika menolak)">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="cth: Nama tiada dalam kelas ini" />
      </Field>
      <div className="row gap end">
        <button className="btn danger" disabled={busy} onClick={reject}>Tolak</button>
        <button className="btn primary" disabled={busy || sug === null} onClick={approve}>Sahkan</button>
      </div>
    </Modal>
  )
}
