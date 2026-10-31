import { useState, type FormEvent } from 'react'
import { supabase, check } from '../lib/supabase'
import { useAuth, useRole } from '../lib/auth'
import SpouseCard from '../components/SpouseCard'
import LangSwitch from '../components/LangSwitch'
import { PageHead } from '../components/Layout'
import { Card, Field, useAction } from '../components/ui'
import { normIC, roleLabel, validIC } from '../lib/util'

export default function Profile() {
  const { profile, session, refresh } = useAuth()
  const [f, setF] = useState({ full_name: profile?.full_name ?? '', phone: profile?.phone ?? '', ic_no: profile?.ic_no ?? '' })
  const [pw, setPw] = useState('')
  const { hasFamily } = useRole()
  const { busy, run } = useAction()

  const save = (e: FormEvent) => { e.preventDefault(); run(async () => {
    if (!validIC(f.ic_no)) throw new Error('No. Kad Pengenalan wajib diisi (12 digit).')
    check(await supabase.from('profiles').update({ full_name: f.full_name.trim(), phone: f.phone.trim(), ic_no: normIC(f.ic_no) || null }).eq('id', profile!.id))
    await refresh()
  }, 'Profil dikemas kini.') }

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
            <Field label="No. Kad Pengenalan" hint="Selepas disahkan oleh guru kelas, pindaan perlu melalui pentadbir.">
              <input required value={f.ic_no} onChange={(e) => setF({ ...f, ic_no: e.target.value })} inputMode="numeric" />
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
    </>
  )
}
