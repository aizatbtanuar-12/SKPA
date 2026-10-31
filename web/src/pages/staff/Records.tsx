import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase, check } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { PageHead } from '../../components/Layout'
import { Badge, Card, Empty, Field, Modal, useAction } from '../../components/ui'
import { fmtIC, normIC, relationLabel, validIC } from '../../lib/util'

interface Guardian { id: number; full_name: string; ic_no: string | null; phone: string | null; user_id: string | null; family_id: number | null }
interface Student {
  id: number; full_name: string; ic_no: string | null; class_id: number | null; status: string; source: string
  family_id: number
  families: { family_code: string } | null
  student_guardians: { relation: string; guardians: Guardian }[]
}

const SELECT = 'id,full_name,ic_no,class_id,status,source,family_id,families(family_code),student_guardians(relation,guardians(id,full_name,ic_no,phone,user_id,family_id))'

export default function Records() {
  const { classes } = useAuth()
  const [q, setQ] = useState('')
  const [cls, setCls] = useState('')
  const [status, setStatus] = useState('aktif')
  const [rows, setRows] = useState<Student[]>([])
  const [edit, setEdit] = useState<Student | 'new' | null>(null)

  const load = useCallback(async () => {
    let query = supabase.from('students').select(SELECT).order('full_name').limit(500)
    if (cls) query = query.eq('class_id', Number(cls))
    if (status) query = query.eq('status', status)
    if (q.trim()) {
      const t = q.trim().replace(/[,()%*]/g, ' ')
      const ic = normIC(t)
      query = ic.length >= 4 ? query.or(`full_name.ilike.%${t}%,ic_no.like.%${ic}%`) : query.ilike('full_name', `%${t}%`)
    }
    const { data } = await query
    setRows((data as unknown as Student[]) ?? [])
  }, [q, cls, status])

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])

  const className = (id: number | null) => classes.find((c) => c.id === id)?.name ?? '-'

  return (
    <>
      <PageHead title="Rekod Murid & Keluarga" sub="Murid dengan No. KP ibu/bapa yang sama digabungkan sebagai satu keluarga secara automatik."
        actions={<button className="btn primary" onClick={() => setEdit('new')}>+ Murid baru</button>} />
      <div className="filters">
        <input placeholder="Cari nama atau No. MyKid…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={cls} onChange={(e) => setCls(e.target.value)}>
          <option value="">Semua kelas</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="aktif">Aktif</option><option value="keluar">Telah keluar</option><option value="">Semua</option>
        </select>
      </div>
      <Card>
        {rows.length ? (
          <table className="table hover">
            <thead><tr><th>Nama murid</th><th>Kelas</th><th>Ibu bapa / penjaga</th><th>Keluarga</th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} onClick={() => setEdit(s)}>
                  <td><strong>{s.full_name}</strong><div className="muted small">{fmtIC(s.ic_no)}</div></td>
                  <td>{className(s.class_id)}{s.status === 'keluar' && <> <Badge tone="grey">Keluar</Badge></>}</td>
                  <td>
                    {s.student_guardians.length ? s.student_guardians.map((g) => (
                      <div key={g.guardians.id} className="small">
                        {g.guardians.full_name} <span className="muted">({relationLabel[g.relation]})</span>
                        {!g.guardians.ic_no && <Badge tone="amber">tiada No. KP</Badge>}
                      </div>
                    )) : <Badge tone="amber">Tiada penjaga</Badge>}
                  </td>
                  <td className="mono">{s.families?.family_code}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty>Tiada rekod. Import senarai murid atau tambah secara manual.</Empty>}
        {rows.length === 500 && <p className="muted small">Menunjukkan 500 rekod pertama. Gunakan carian atau tapisan kelas.</p>}
      </Card>
      {edit && <StudentModal student={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    </>
  )
}

function StudentModal({ student, onClose, onSaved }: { student: Student | null; onClose: () => void; onSaved: () => void }) {
  const { classes, profile } = useAuth()
  const [s, setS] = useState({
    full_name: student?.full_name ?? '', ic_no: student?.ic_no ?? '',
    class_id: student?.class_id ? String(student.class_id) : '', status: student?.status ?? 'aktif',
  })
  const [g, setG] = useState({ full_name: '', ic_no: '', phone: '', relation: 'bapa' })
  const [mergeCode, setMergeCode] = useState('')
  const [siblings, setSiblings] = useState<{ id: number; full_name: string; class_id: number | null }[]>([])
  const { busy, run } = useAction()

  useEffect(() => {
    if (!student) return
    supabase.from('students').select('id,full_name,class_id').eq('family_id', student.family_id).neq('id', student.id)
      .then(({ data }) => setSiblings(data ?? []))
  }, [student])

  const save = (e: FormEvent) => { e.preventDefault(); run(async () => {
    if (!validIC(s.ic_no)) throw new Error('No. MyKid murid wajib diisi (12 digit).')
    const body = { full_name: s.full_name.trim(), ic_no: normIC(s.ic_no), class_id: s.class_id ? Number(s.class_id) : null, status: s.status }
    if (student) check(await supabase.from('students').update(body).eq('id', student.id))
    else check(await supabase.from('students').insert({ ...body, source: 'manual', created_by: profile!.id }))
    onSaved()
  }, 'Disimpan.') }

  const addGuardian = (e: FormEvent) => { e.preventDefault(); run(async () => {
    if (!student) return
    const ic = normIC(g.ic_no)
    if (!validIC(ic)) throw new Error('No. KP ibu bapa / penjaga wajib diisi (12 digit).')
    let gid: number | null = null
    if (ic) {
      const { data } = await supabase.from('guardians').select('id').eq('ic_no', ic).maybeSingle()
      gid = (data as { id: number } | null)?.id ?? null
    }
    if (!gid) {
      const ins = await supabase.from('guardians').insert({ full_name: g.full_name.trim(), ic_no: ic, phone: g.phone.trim() || null }).select('id').single()
      gid = (check(ins) as { id: number }).id
    }
    check(await supabase.from('student_guardians').insert({ student_id: student.id, guardian_id: gid, relation: g.relation }))
    onSaved()
  }, 'Penjaga ditambah. Keluarga dikemas kini.') }

  const unlink = (gid: number) => run(async () => {
    check(await supabase.from('student_guardians').delete().eq('student_id', student!.id).eq('guardian_id', gid))
    onSaved()
  }, 'Pautan penjaga dibuang.')

  const separate = () => run(async () => {
    check(await supabase.rpc('admin_move_student', { p_student: student!.id, p_family: null }))
    onSaved()
  }, 'Murid dipindahkan ke keluarga baru.')

  const merge = () => run(async () => {
    const { data } = await supabase.from('families').select('id').eq('family_code', mergeCode.trim().toUpperCase()).maybeSingle()
    if (!data) throw new Error('Kod keluarga tidak dijumpai.')
    check(await supabase.rpc('admin_merge_families', { p_a: student!.family_id, p_b: (data as { id: number }).id }))
    onSaved()
  }, 'Keluarga digabungkan.')

  return (
    <Modal title={student ? student.full_name : 'Murid baru'} onClose={onClose} wide>
      <form className="form" onSubmit={save}>
        <div className="row gap wrap">
          <Field label="Nama penuh"><input required value={s.full_name} onChange={(e) => setS({ ...s, full_name: e.target.value })} /></Field>
          <Field label="No. MyKid"><input required value={s.ic_no} onChange={(e) => setS({ ...s, ic_no: e.target.value })} inputMode="numeric" /></Field>
          <Field label="Kelas">
            <select value={s.class_id} onChange={(e) => setS({ ...s, class_id: e.target.value })}>
              <option value="">-</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={s.status} onChange={(e) => setS({ ...s, status: e.target.value })}>
              <option value="aktif">Aktif</option><option value="keluar">Telah keluar / pindah</option>
            </select>
          </Field>
        </div>
        <button className="btn primary" disabled={busy}>Simpan</button>
      </form>

      {student && (
        <>
          <h3 className="h3">Ibu bapa / penjaga</h3>
          <ul className="list">
            {student.student_guardians.map((x) => (
              <li key={x.guardians.id}>
                <div>
                  <strong>{x.guardians.full_name}</strong> <span className="muted">({relationLabel[x.relation]})</span>
                  <div className="muted small">KP {fmtIC(x.guardians.ic_no)} · {x.guardians.phone || '-'} {x.guardians.user_id && '· ada akaun portal'}</div>
                </div>
                <button className="btn ghost small" onClick={() => unlink(x.guardians.id)} disabled={busy}>Buang</button>
              </li>
            ))}
          </ul>
          <form className="row gap wrap end" onSubmit={addGuardian}>
            <Field label="Nama"><input required value={g.full_name} onChange={(e) => setG({ ...g, full_name: e.target.value })} /></Field>
            <Field label="No. KP"><input required value={g.ic_no} onChange={(e) => setG({ ...g, ic_no: e.target.value })} inputMode="numeric" /></Field>
            <Field label="Telefon"><input value={g.phone} onChange={(e) => setG({ ...g, phone: e.target.value })} /></Field>
            <Field label="Hubungan">
              <select value={g.relation} onChange={(e) => setG({ ...g, relation: e.target.value })}>
                <option value="bapa">Bapa</option><option value="ibu">Ibu</option><option value="penjaga">Penjaga</option>
              </select>
            </Field>
            <button className="btn" disabled={busy}>+ Tambah</button>
          </form>

          <h3 className="h3">Keluarga {student.families?.family_code}</h3>
          <p className="small">
            {siblings.length
              ? <>Adik-beradik: {siblings.map((x) => `${x.full_name} (${classes.find((c) => c.id === x.class_id)?.name ?? '-'})`).join(', ')}</>
              : 'Tiada adik-beradik lain dalam rekod.'}
          </p>
          <div className="row gap wrap end">
            <Field label="Gabung dengan keluarga lain (kod)" hint="Untuk adik-beradik tanpa No. KP penjaga.">
              <input value={mergeCode} onChange={(e) => setMergeCode(e.target.value)} placeholder="K00012" />
            </Field>
            <button className="btn" disabled={busy || !mergeCode} onClick={merge}>Gabung</button>
            {siblings.length > 0 && <button className="btn ghost" disabled={busy} onClick={separate}>Asingkan murid ini</button>}
          </div>
        </>
      )}
    </Modal>
  )
}
