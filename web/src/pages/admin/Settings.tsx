import { useState, type FormEvent } from 'react'
import { supabase, check } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { PageHead } from '../../components/Layout'
import { Card, Field, useAction } from '../../components/ui'

export default function Settings() {
  const { settings, refresh } = useAuth()
  const [f, setF] = useState({
    school_name: settings?.school_name ?? '', school_code: settings?.school_code ?? '',
    current_year: String(settings?.current_year ?? new Date().getFullYear()),
    fee_per_family: String(settings?.fee_per_family ?? 50),
    bank_name: settings?.bank_name ?? '', bank_account: settings?.bank_account ?? '',
    bank_holder: settings?.bank_holder ?? '', contact_phone: settings?.contact_phone ?? '',
  })
  const { busy, run } = useAction()
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })

  const save = (e: FormEvent) => { e.preventDefault(); run(async () => {
    check(await supabase.from('school_settings').update({
      ...f, current_year: Number(f.current_year), fee_per_family: Number(f.fee_per_family), updated_at: new Date().toISOString(),
    }).eq('id', 1))
    await refresh()
  }, 'Tetapan disimpan.') }

  return (
    <>
      <PageHead title="Tetapan" />
      <form onSubmit={save}>
        <Card title="Sekolah & yuran">
          <div className="row gap wrap">
            <Field label="Nama sekolah"><input required value={f.school_name} onChange={set('school_name')} /></Field>
            <Field label="Kod sekolah"><input value={f.school_code} onChange={set('school_code')} /></Field>
          </div>
          <div className="row gap wrap">
            <Field label="Tahun semasa" hint="Tukar pada awal sesi baru: status yuran semua keluarga bermula semula.">
              <input type="number" required value={f.current_year} onChange={set('current_year')} />
            </Field>
            <Field label="Yuran sekeluarga (RM)"><input type="number" step="0.01" min="0" required value={f.fee_per_family} onChange={set('fee_per_family')} /></Field>
          </div>
        </Card>
        <Card title="Akaun bank PIBG (dipaparkan kepada ibu bapa)">
          <div className="row gap wrap">
            <Field label="Bank"><input value={f.bank_name} onChange={set('bank_name')} /></Field>
            <Field label="No. akaun"><input value={f.bank_account} onChange={set('bank_account')} /></Field>
          </div>
          <div className="row gap wrap">
            <Field label="Nama pemegang akaun"><input value={f.bank_holder} onChange={set('bank_holder')} /></Field>
            <Field label="Telefon PIBG"><input value={f.contact_phone} onChange={set('contact_phone')} /></Field>
          </div>
        </Card>
        <button className="btn primary" disabled={busy}>Simpan tetapan</button>
      </form>
    </>
  )
}
