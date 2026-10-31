import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { maskIC, normIC, relationLabel, validIC } from '../lib/util'
import { Card, Field, useAction, useToast } from './ui'

/** The other parent of the children. Saved on the profile and attached to the family (save_spouse, migration 009). */
export default function SpouseCard({ onSaved }: { onSaved?: () => void }) {
  const { profile, refresh } = useAuth()
  const toast = useToast()
  const { busy, run } = useAction()
  const [edit, setEdit] = useState(false)
  const [f, setF] = useState({ relation: 'bapa', name: '', ic: '', phone: '', none: false })

  useEffect(() => {
    if (!profile) return
    setF({
      relation: profile.relation ?? 'bapa', name: profile.spouse_name ?? '', ic: profile.spouse_ic ?? '',
      phone: profile.spouse_phone ?? '', none: Boolean(profile.no_spouse),
    })
    setEdit(!profile.spouse_ic && !profile.no_spouse)
  }, [profile])

  const save = (e: FormEvent) => { e.preventDefault(); run(async () => {
    if (!f.none) {
      if (!f.name.trim()) throw new Error('Sila isi nama pasangan.')
      if (!validIC(f.ic)) throw new Error('No. KP pasangan mesti 12 digit.')
    }
    const { data, error } = await supabase.rpc('save_spouse', {
      p_name: f.name.trim(), p_ic: normIC(f.ic), p_phone: f.phone.trim(), p_relation: f.relation, p_none: f.none,
    })
    if (error) throw new Error(/save_spouse/.test(error.message) ? 'Sila jalankan supabase/migrations/009_family_rules.sql dahulu.' : error.message)
    if (data) toast(String(data), 'err')
    await refresh()
    onSaved?.()
    setEdit(false)
  }, 'Maklumat pasangan disimpan.') }

  const spouseWord = f.relation === 'bapa' ? 'Isteri' : f.relation === 'ibu' ? 'Suami' : 'Pasangan'

  return (
    <Card title="Pasangan (ibu / bapa kedua)" actions={!edit && <button className="btn small" onClick={() => setEdit(true)}>Ubah</button>}>
      {!edit ? (
        profile?.no_spouse ? <p className="muted" style={{ margin: 0 }}>Tiada pasangan didaftarkan (ibu / bapa tunggal atau penjaga).</p> : (
          <dl className="dl" style={{ margin: 0 }}>
            <dt>Saya</dt><dd>{relationLabel[profile?.relation ?? 'penjaga']}</dd>
            <dt>{spouseWord}</dt><dd translate="no">{profile?.spouse_name}</dd>
            <dt>No. KP</dt><dd className="mono">{maskIC(profile?.spouse_ic ?? null)}</dd>
            {profile?.spouse_phone && <><dt>Telefon</dt><dd>{profile.spouse_phone}</dd></>}
          </dl>
        )
      ) : (
        <form className="form" onSubmit={save}>
          <p className="small muted" style={{ marginTop: 0 }}>Kedua-dua ibu dan bapa dipautkan kepada anak-anak sebagai satu keluarga. Pasangan anda boleh mendaftar akaun sendiri dengan No. KP ini.</p>
          <Field label="Saya ialah">
            <select value={f.relation} onChange={(e) => setF({ ...f, relation: e.target.value })}>
              <option value="bapa">Bapa</option><option value="ibu">Ibu</option><option value="penjaga">Penjaga</option>
            </select>
          </Field>
          {!f.none && (
            <>
              <Field label={`Nama penuh ${spouseWord.toLowerCase()}`}><input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
              <div className="row gap wrap">
                <Field label="No. Kad Pengenalan"><input required inputMode="numeric" value={f.ic} onChange={(e) => setF({ ...f, ic: e.target.value })} placeholder="820202-10-2222" /></Field>
                <Field label="Telefon (pilihan)"><input inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
              </div>
            </>
          )}
          <label className="check">
            <input type="checkbox" checked={f.none} onChange={(e) => setF({ ...f, none: e.target.checked })} />
            <span>Tiada pasangan untuk didaftarkan</span>
          </label>
          <div className="row gap">
            <button className="btn primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
            {(profile?.spouse_ic || profile?.no_spouse) && <button type="button" className="btn ghost" onClick={() => setEdit(false)}>Batal</button>}
          </div>
        </form>
      )}
    </Card>
  )
}
