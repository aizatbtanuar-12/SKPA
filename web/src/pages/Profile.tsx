import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase, check } from '../lib/supabase'
import { useAuth, useRole } from '../lib/auth'
import SpouseCard from '../components/SpouseCard'
import LangSwitch from '../components/LangSwitch'
import { PageHead } from '../components/Layout'
import { Card, Field, useAction } from '../components/ui'
import { download, normIC, roleLabel, todayISO, validIC } from '../lib/util'

export default function Profile() {
  const { profile, session, refresh, signOut } = useAuth()
  const [f, setF] = useState({ full_name: profile?.full_name ?? '', phone: profile?.phone ?? '', ic_no: profile?.ic_no ?? '' })
  const [pw, setPw] = useState('')
  const { hasFamily } = useRole()
  // verified parents can't change their own IC (migration 013); before 013 is run, fall back to being linked to a family
  const { familyId } = useAuth()
  const [locked, setLocked] = useState(false)
  useEffect(() => {
    supabase.rpc('my_ic_locked').then(({ data, error }) => setLocked(error ? Boolean(familyId) : Boolean(data)))
  }, [familyId])
  const { busy, run } = useAction()

  const save = (e: FormEvent) => { e.preventDefault(); run(async () => {
    if (!locked && !validIC(f.ic_no)) throw new Error('No. Kad Pengenalan wajib diisi (12 digit).')
    check(await supabase.from('profiles').update({ full_name: f.full_name.trim(), phone: f.phone.trim(), ...(locked ? {} : { ic_no: normIC(f.ic_no) || null }) }).eq('id', profile!.id))
    await refresh()
  }, 'Profil dikemas kini.') }

  // PDPA right of access: everything the portal holds about me and my family, as a JSON file
  const exportData = () => run(async () => {
    const { data, error } = await supabase.rpc('my_data_export')
    if (error) throw new Error(error.message)
    download(`data-saya-pibg-${todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json')
  }, 'Data anda telah dimuat turun.')

  const changePw = (e: FormEvent) => { e.preventDefault(); run(async () => {
    if (pw.length < 8) throw new Error('Kata laluan sekurang-kurangnya 8 aksara.')
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) throw error
    setPw('')
  }, 'Kata laluan ditukar.') }

  return (
    <>
      <PageHead title="Profil Saya" sub={`${session?.user.email} · ${roleLabel[profile?.role ?? 'parent']}`} />
      <div className="grid2">
        <Card title="Maklumat peribadi">
          <form className="form" onSubmit={save}>
            <Field label="Nama penuh"><input required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
            <Field label="No. Kad Pengenalan" hint={locked ? 'Telah disahkan. Hubungi pentadbir untuk pindaan.' : 'Selepas disahkan oleh guru kelas, pindaan perlu melalui pentadbir.'}>
              <input required value={f.ic_no} onChange={(e) => setF({ ...f, ic_no: e.target.value })} inputMode="numeric"
                readOnly={locked} aria-readonly={locked} className={locked ? 'locked' : undefined} />
            </Field>
            <Field label="Telefon"><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <button className="btn primary" disabled={busy}>Simpan</button>
          </form>
        </Card>
        <Card title="Tukar kata laluan">
          <form className="form" onSubmit={changePw}>
            <Field label="Kata laluan baru"><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
            <button className="btn" disabled={busy || !pw}>Tukar</button>
          </form>
        </Card>
      </div>
      <div className="grid2">
        <Card title="Bahasa paparan">
          <p className="muted small" style={{ marginTop: 0 }}>Bahasa aplikasi untuk akaun anda, di semua peranti.</p>
          <LangSwitch />
        </Card>
        {hasFamily && <SpouseCard />}
      </div>
      <div className="grid2">
        <Card title="Data & privasi">
          <p className="muted small" style={{ marginTop: 0 }}>Muat turun salinan semua maklumat yang disimpan oleh portal tentang anda dan keluarga anda.</p>
          <div className="row gap wrap">
            <button type="button" className="btn" onClick={exportData} disabled={busy}>Muat turun data saya</button>
            <Link to="/privasi" className="btn ghost">Notis privasi</Link>
          </div>
          <p className="muted small">Untuk menarik balik persetujuan atau memadam akaun, hubungi pentadbir PIBG.</p>
        </Card>
      </div>
      <div className="signout-row">
        <button type="button" className="btn danger" onClick={() => { if (window.confirm('Log keluar daripada Portal PIBG?')) signOut() }}>Log keluar</button>
      </div>
    </>
  )
}
