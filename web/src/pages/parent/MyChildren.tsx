import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase, check } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { PageHead } from '../../components/Layout'
import { Badge, Card, Empty, Field, useAction } from '../../components/ui'
import { claimLabel, claimTone, date, maskIC, normIC, relationLabel } from '../../lib/util'

interface Claim {
  id: number; child_name: string; class_id: number; relation: string; status: string
  review_note: string | null; created_at: string
}
interface Child { id: number; full_name: string; ic_no: string | null; classes: { name: string } | null }
interface Guardian { id: number; full_name: string; phone: string | null }

export default function MyChildren() {
  const { profile, classes, familyId, refresh } = useAuth()
  const [claims, setClaims] = useState<Claim[]>([])
  const [kids, setKids] = useState<Child[]>([])
  const [guardians, setGuardians] = useState<Guardian[]>([])
  const [f, setF] = useState({ child_name: '', child_ic: '', class_id: '', relation: 'bapa' })
  const { busy, run } = useAction()

  const load = useCallback(async () => {
    const c = await supabase.from('child_claims').select('*').eq('user_id', profile!.id).order('created_at', { ascending: false })
    setClaims((c.data as Claim[]) ?? [])
    if (familyId) {
      const [s, g] = await Promise.all([
        supabase.from('students').select('id,full_name,ic_no,classes(name)').eq('family_id', familyId).eq('status', 'aktif').order('full_name'),
        supabase.from('guardians').select('id,full_name,phone').eq('family_id', familyId),
      ])
      setKids((s.data as unknown as Child[]) ?? [])
      setGuardians((g.data as Guardian[]) ?? [])
    }
  }, [profile, familyId])

  useEffect(() => { load() }, [load])

  // the first approval links the account to a family; pick that up
  useEffect(() => {
    if (!familyId && claims.some((c) => c.status === 'dipadan' || c.status === 'rekod_baru')) refresh()
  }, [claims, familyId, refresh])

  async function add(e: FormEvent) {
    e.preventDefault()
    const ok = await run(async () => {
      if (!profile?.ic_no) throw new Error('Sila lengkapkan No. Kad Pengenalan anda di halaman Profil dahulu.')
      check(await supabase.from('child_claims').insert({
        user_id: profile.id, child_name: f.child_name.trim(), child_ic: normIC(f.child_ic) || null,
        class_id: Number(f.class_id), relation: f.relation,
      }))
    }, 'Dihantar kepada guru kelas untuk pengesahan.')
    if (ok) { setF({ ...f, child_name: '', child_ic: '' }); load() }
  }

  const cancel = (id: number) => run(async () => {
    check(await supabase.from('child_claims').delete().eq('id', id))
    load()
  }, 'Permohonan dibatalkan.')

  const className = (id: number) => classes.find((c) => c.id === id)?.name ?? '-'

  return (
    <>
      <PageHead title="Anak Saya" sub="Anak-anak yang berkongsi No. KP ibu/bapa yang sama dikira sebagai satu keluarga untuk yuran PIBG." />

      <div className="grid2">
        <Card title="Anak yang telah disahkan">
          {kids.length ? (
            <ul className="list">
              {kids.map((k) => (
                <li key={k.id}>
                  <div><strong>{k.full_name}</strong><div className="muted small">MyKid {maskIC(k.ic_no)}</div></div>
                  <Badge tone="blue">{k.classes?.name ?? '-'}</Badge>
                </li>
              ))}
            </ul>
          ) : <Empty>Belum ada. Tambah anak anda di sebelah dan tunggu pengesahan guru kelas.</Empty>}
          {guardians.length > 0 && (
            <p className="muted small">Penjaga berdaftar: {guardians.map((g) => g.full_name).join(', ')}</p>
          )}
        </Card>

        <Card title="Tambah anak">
          <form onSubmit={add} className="form">
            <Field label="Nama penuh anak">
              <input required value={f.child_name} onChange={(e) => setF({ ...f, child_name: e.target.value })} />
            </Field>
            <div className="row gap">
              <Field label="Kelas">
                <select required value={f.class_id} onChange={(e) => setF({ ...f, class_id: e.target.value })}>
                  <option value="">Pilih kelas</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Hubungan">
                <select value={f.relation} onChange={(e) => setF({ ...f, relation: e.target.value })}>
                  <option value="bapa">Bapa</option><option value="ibu">Ibu</option><option value="penjaga">Penjaga</option>
                </select>
              </Field>
            </div>
            <Field label="No. MyKid anak (pilihan)" hint="Membantu guru memadankan rekod dengan tepat.">
              <input value={f.child_ic} inputMode="numeric" onChange={(e) => setF({ ...f, child_ic: e.target.value })} />
            </Field>
            <button className="btn primary" disabled={busy}>Hantar untuk pengesahan</button>
          </form>
        </Card>
      </div>

      <Card title="Status permohonan">
        {claims.length ? (
          <table className="table">
            <thead><tr><th>Nama</th><th>Kelas</th><th>Hubungan</th><th>Tarikh</th><th>Status</th><th /></tr></thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.id}>
                  <td>{c.child_name}</td>
                  <td>{className(c.class_id)}</td>
                  <td>{relationLabel[c.relation]}</td>
                  <td>{date(c.created_at)}</td>
                  <td>
                    <Badge tone={claimTone[c.status]}>{claimLabel[c.status]}</Badge>
                    {c.review_note && <div className="muted small">{c.review_note}</div>}
                  </td>
                  <td>{c.status === 'menunggu' && <button className="btn ghost small" onClick={() => cancel(c.id)}>Batal</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty>Tiada permohonan.</Empty>}
      </Card>
    </>
  )
}
