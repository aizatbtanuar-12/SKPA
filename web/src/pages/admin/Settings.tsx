import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { PageHead } from '../../components/Layout'
import { Card, Field, useAction } from '../../components/ui'
import ReceiptDoc, { SAMPLE_RECEIPT } from '../../components/ReceiptDoc'

export default function Settings() {
  const { settings, refresh } = useAuth()
  const [f, setF] = useState({
    school_name: settings?.school_name ?? '', school_code: settings?.school_code ?? '',
    current_year: String(settings?.current_year ?? new Date().getFullYear()),
    fee_per_family: String(settings?.fee_per_family ?? 50),
    bank_name: settings?.bank_name ?? '', bank_account: settings?.bank_account ?? '',
    bank_holder: settings?.bank_holder ?? '', contact_phone: settings?.contact_phone ?? '',
  })
  const [r, setR] = useState({
    receipt_org_name: settings?.receipt_org_name ?? 'Persatuan Ibu Bapa dan Guru',
    receipt_title: settings?.receipt_title ?? 'RESIT RASMI YURAN PIBG',
    receipt_header: settings?.receipt_header ?? '',
    receipt_note: settings?.receipt_note ?? '',
    receipt_signatory: settings?.receipt_signatory ?? '',
    receipt_footer: settings?.receipt_footer ?? 'Resit ini dijana oleh komputer dan tidak memerlukan tandatangan.',
    receipt_show_logo: settings?.receipt_show_logo ?? true,
  })
  const { busy, run } = useAction()
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  const setRc = (k: keyof typeof r) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setR({ ...r, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value })

  const save = async (body: Record<string, unknown>) => {
    const { error } = await supabase.from('school_settings').update({ ...body, updated_at: new Date().toISOString() }).eq('id', 1)
    if (error) {
      if (/receipt_/.test(error.message)) throw new Error('Sila jalankan supabase/migrations/005_receipt_format.sql dalam Supabase SQL Editor dahulu.')
      throw new Error(error.message)
    }
    await refresh()
  }

  const saveMain = (e: FormEvent) => { e.preventDefault(); run(() => save({
    ...f, current_year: Number(f.current_year), fee_per_family: Number(f.fee_per_family),
  }), 'Tetapan disimpan.') }

  const saveReceipt = (e: FormEvent) => { e.preventDefault(); run(() => save({
    ...r,
    receipt_header: r.receipt_header.trim() || null, receipt_note: r.receipt_note.trim() || null,
    receipt_signatory: r.receipt_signatory.trim() || null, receipt_footer: r.receipt_footer.trim() || null,
  }), 'Format resit disimpan.') }

  return (
    <>
      <PageHead title="Tetapan" />
      <form onSubmit={saveMain}>
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
          <button className="btn primary" disabled={busy}>Simpan tetapan</button>
        </Card>
      </form>

      <Card title="Format resit">
        <div className="receipt-editor">
          <form className="form" onSubmit={saveReceipt}>
            <Field label="Nama persatuan"><input value={r.receipt_org_name} onChange={setRc('receipt_org_name')} /></Field>
            <Field label="Tajuk resit"><input value={r.receipt_title} onChange={setRc('receipt_title')} /></Field>
            <Field label="Kepala resit (satu baris setiap satu)" hint="cth: alamat sekolah, no. telefon, e-mel PIBG, no. pendaftaran">
              <textarea rows={3} value={r.receipt_header} onChange={setRc('receipt_header')}
                placeholder={'Jalan Puncak Alam 2/1, 42300 Bandar Puncak Alam, Selangor\nTel: 03-1234 5678 · pibg.skpa@gmail.com'} />
            </Field>
            <Field label="Nota (pilihan)" hint="Dipaparkan di bawah jumlah, cth: Terima kasih atas sokongan anda.">
              <input value={r.receipt_note} onChange={setRc('receipt_note')} />
            </Field>
            <Field label="Ruang tandatangan (pilihan)" hint="Isi jawatan untuk memaparkan garisan tandatangan, cth: Bendahari PIBG. Kosongkan jika tidak perlu.">
              <input value={r.receipt_signatory} onChange={setRc('receipt_signatory')} />
            </Field>
            <Field label="Kaki resit">
              <textarea rows={2} value={r.receipt_footer} onChange={setRc('receipt_footer')} />
            </Field>
            <label className="check" style={{ color: 'var(--ink)' }}>
              <input type="checkbox" checked={r.receipt_show_logo} onChange={setRc('receipt_show_logo')} />
              <span>Paparkan logo PIBG</span>
            </label>
            <button className="btn primary" disabled={busy}>Simpan format resit</button>
          </form>
          <div>
            <span className="muted small">Pratonton (contoh data)</span>
            <div className="receipt-preview">
              <ReceiptDoc s={{ ...settings, school_name: f.school_name, school_code: f.school_code, ...r }} d={SAMPLE_RECEIPT} />
            </div>
          </div>
        </div>
      </Card>
    </>
  )
}
