import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase, check } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useAction } from '../../components/ui'
import { claimLabel, date, maskIC, normIC, relationLabel, validIC } from '../../lib/util'
import SpouseCard from '../../components/SpouseCard'
import { PageHead, PBadge, Seg, initials, useIsMobile, useScrollTop, type PTone } from '../../components/pui'

interface Claim { id: number; child_name: string; class_id: number; relation: string; status: string; review_note: string | null; created_at: string }
interface Child { id: number; full_name: string; ic_no: string | null; classes: { name: string } | null }
interface Guardian { id: number; full_name: string; phone: string | null }
type Tab = 'anak' | 'tambah' | 'permohonan'

const claimTone: Record<string, PTone> = { menunggu: 'amber', dipadan: 'green', rekod_baru: 'green', ditolak: 'red' }
const KID_TINT = [{ bg: 'oklch(0.92 0.06 255)', solid: '#1f4e9c' }, { bg: 'oklch(0.92 0.06 25)', solid: '#b3352b' }]

export default function MyChildren() {
  const { profile, classes, familyId, refresh } = useAuth()
  const mobile = useIsMobile()
  const loc = useLocation()
  const [tab, setTab] = useState<Tab>((loc.state as { tab?: Tab } | null)?.tab ?? 'anak')
  const [claims, setClaims] = useState<Claim[]>([])
  const [kids, setKids] = useState<Child[]>([])
  const [guardians, setGuardians] = useState<Guardian[]>([])
  const [loaded, setLoaded] = useState(false)
  const [f, setF] = useState({ child_name: '', child_ic: '', class_id: '', relation: profile?.relation ?? 'bapa' })
  useEffect(() => { if (profile?.relation) setF((x) => ({ ...x, relation: profile.relation! })) }, [profile?.relation])
  const { busy, run } = useAction()
  useScrollTop(tab)

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
    setLoaded(true)
  }, [profile, familyId])
  useEffect(() => { load() }, [load])

  // the first approval links the account to a family; pick that up
  useEffect(() => {
    if (!familyId && claims.some((c) => c.status === 'dipadan' || c.status === 'rekod_baru')) refresh()
  }, [claims, familyId, refresh])

  const add = (e: FormEvent) => { e.preventDefault(); run(async () => {
    if (!profile?.ic_no) throw new Error('Sila lengkapkan No. Kad Pengenalan anda di halaman Profil dahulu.')
    if (!validIC(f.child_ic)) throw new Error('No. MyKid anak wajib diisi (12 digit).')
    check(await supabase.from('child_claims').insert({
      user_id: profile.id, child_name: f.child_name.trim(), child_ic: normIC(f.child_ic),
      class_id: Number(f.class_id), relation: f.relation,
    }))
    setF({ ...f, child_name: '', child_ic: '' })
    await load()
    setTab('permohonan')
  }, 'Dihantar kepada guru kelas untuk pengesahan.') }

  const cancel = (id: number) => run(async () => {
    check(await supabase.from('child_claims').delete().eq('id', id)); await load()
  }, 'Permohonan dibatalkan.')

  const className = (id: number) => classes.find((c) => c.id === id)?.name ?? '-'

  const kidsPanel = (
    <div className="up">
      {!loaded ? <div key="loading" className="pcard pempty">Memuatkan…</div> : kids.length ? (
        <div key="list" className="pstack">
          {kids.map((k, i) => {
            const t = KID_TINT[i % 2]
            return (
              <div key={k.id} className="kid-card" style={{ background: t.bg }}>
                <span className="initials" style={{ background: t.solid }}>{initials(k.full_name)}</span>
                <div style={{ minWidth: 0 }}>
                  <b translate="no">{k.full_name}</b>
                  {k.ic_no && <div className="k">MyKid {maskIC(k.ic_no)}</div>}
                  {mobile && <span className="cls" translate="no">{k.classes?.name ?? '-'}</span>}
                </div>
                {!mobile && <span className="cls" translate="no">{k.classes?.name ?? '-'}</span>}
              </div>
            )
          })}
        </div>
      ) : (
        <div key="empty" className="pcard pempty">
          Belum ada anak yang disahkan. Tambah anak anda dan tunggu pengesahan guru kelas.
          {mobile && <button className="pbtn" style={{ marginTop: 14 }} onClick={() => setTab('tambah')}>Tambah anak</button>}
        </div>
      )}
      {guardians.length > 0 && <p className="muted" style={{ fontSize: 12, margin: '12px 4px 0' }}>Ibu bapa / penjaga dalam keluarga ini: <span translate="no">{guardians.map((g) => g.full_name).join(', ')}</span></p>}
      <div style={{ marginTop: 16 }}><SpouseCard onSaved={load} /></div>
    </div>
  )

  const form = (
    <form className="pcard up" onSubmit={add}>
      {!mobile && <div className="pcard-head"><h2>Tambah anak</h2></div>}
      <label className="pfield"><span>Nama penuh anak</span>
        <input required value={f.child_name} onChange={(e) => setF({ ...f, child_name: e.target.value })} placeholder="cth: Nur Iman binti Ahmad" /></label>
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: mobile ? 0 : 12 }}>
        <label className="pfield"><span>Kelas</span>
          <select required value={f.class_id} onChange={(e) => setF({ ...f, class_id: e.target.value })}>
            <option value="">Pilih kelas</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
        <label className="pfield"><span>No. MyKid anak</span>
          <input required value={f.child_ic} inputMode="numeric" placeholder="150505-10-1234" onChange={(e) => setF({ ...f, child_ic: e.target.value })} />
          <small>Wajib. Seorang murid hanya boleh didaftarkan di bawah satu keluarga.</small></label>
      </div>
      <div className="pfield"><span>Hubungan</span>
        <div className="toggle3" role="radiogroup" aria-label="Hubungan">
          {(['bapa', 'ibu', 'penjaga'] as const).map((r) => (
            <button key={r} type="button" role="radio" aria-checked={f.relation === r} className={f.relation === r ? 'on' : ''}
              onClick={() => setF({ ...f, relation: r })}>{relationLabel[r]}</button>
          ))}
        </div>
      </div>
      <button className="pbtn" disabled={busy}>Hantar untuk pengesahan</button>
    </form>
  )

  const claimsPanel = (
    <div className="up">
      {claims.length ? (
        <div className="pstack" style={{ gap: 8 }}>
          {claims.map((c) => (
            <div key={c.id} className="claim-card">
              <div style={{ minWidth: 0 }}>
                <b translate="no">{c.child_name}</b>
                <span className="m">{className(c.class_id)} · {relationLabel[c.relation]} · {date(c.created_at)}</span>
                {c.status === 'ditolak' && c.review_note && <div className="m" style={{ color: '#b3352b' }}>{c.review_note}</div>}
              </div>
              <div className="r">
                <PBadge tone={claimTone[c.status]}>{mobile && c.status === 'menunggu' ? 'Menunggu guru' : claimLabel[c.status].replace(' pengesahan guru kelas', '')}</PBadge>
                {c.status === 'menunggu' && <button onClick={() => cancel(c.id)} disabled={busy}>Batal</button>}
              </div>
            </div>
          ))}
        </div>
      ) : <div key="empty" className="pcard pempty">Tiada permohonan.</div>}
    </div>
  )

  if (mobile) {
    return (
      <>
        <Link to="/" className="back-link">‹ Utama</Link>
        <PageHead title="Anak Saya" sub="Anak yang berkongsi No. KP ibu/bapa dikira satu keluarga." />
        <Seg value={tab} onChange={setTab} options={[['anak', 'Anak'], ['tambah', 'Tambah'], ['permohonan', 'Permohonan']]} />
        {tab === 'anak' ? kidsPanel : tab === 'tambah' ? form : claimsPanel}
      </>
    )
  }
  return (
    <>
      <PageHead title="Anak Saya" sub="Anak-anak yang berkongsi No. KP ibu/bapa yang sama dikira sebagai satu keluarga untuk yuran PIBG." />
      <div className="pgrid">
        <div>
          {kidsPanel}
          <div className="sec-head" style={{ marginTop: 22 }}><h2>Status permohonan</h2></div>
          {claimsPanel}
        </div>
        {form}
      </div>
    </>
  )
}
