import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase, check } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { PageHead } from '../../components/Layout'
import { Badge, Card, Empty, Field, Stat, useAction } from '../../components/ui'
import { readReceipt, type ReceiptInfo } from '../../lib/receiptOcr'
import { compressImage } from '../../lib/image'
import { dateTime, feeStatusLabel, feeStatusTone, payLabel, payTone, rm } from '../../lib/util'
import type { FeeStatus } from '../Dashboard'

export interface Payment {
  id: number; family_id: number; year: number; amount: number; method: string; reference: string | null
  proof_path: string | null; status: string; receipt_no: string | null; submitted_at: string
  review_note: string | null; reviewed_at: string | null
}

export default function ParentFees() {
  const { profile, settings, familyId } = useAuth()
  const [fee, setFee] = useState<FeeStatus | null>(null)
  const [pays, setPays] = useState<Payment[]>([])
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [ocr, setOcr] = useState<{ state: 'idle' | 'reading' | 'done' | 'failed'; pct: number; info?: ReceiptInfo }>({ state: 'idle', pct: 0 })
  const { busy, run } = useAction()

  // Read the receipt image on the device and pre-fill reference + amount for the parent to confirm
  async function onPick(f: File | null) {
    setFile(f)
    setOcr({ state: 'idle', pct: 0 })
    if (!f || !f.type.startsWith('image/')) return
    setOcr({ state: 'reading', pct: 0 })
    try {
      const info = await readReceipt(f, (pct) => setOcr((o) => (o.state === 'reading' ? { ...o, pct } : o)))
      setOcr({ state: 'done', pct: 100, info })
      if (info.reference) setReference(info.reference)
      if (info.amount) setAmount(String(info.amount))
    } catch {
      setOcr({ state: 'failed', pct: 0 })
    }
  }

  const load = useCallback(async () => {
    if (!familyId) return
    const [s, p] = await Promise.all([
      supabase.from('family_fee_status').select('*').eq('family_id', familyId).maybeSingle(),
      supabase.from('fee_payments').select('*').eq('family_id', familyId).order('submitted_at', { ascending: false }),
    ])
    const st = s.data as FeeStatus | null
    setFee(st)
    setPays((p.data as Payment[]) ?? [])
    if (st) setAmount(String(Math.max(0, st.fee_due - st.paid) || st.fee_due))
  }, [familyId])

  useEffect(() => { load() }, [load])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const ok = await run(async () => {
      if (!file) throw new Error('Sila pilih fail bukti bayaran.')
      const upFile = await compressImage(file)
      if (upFile.size > 5 * 1024 * 1024) throw new Error('Saiz fail maksimum 5MB.')
      const ext = upFile.type === 'application/pdf' ? 'pdf' : upFile.type === 'image/jpeg' ? 'jpg' : (upFile.name.split('.').pop()?.toLowerCase() || 'jpg')
      const path = `${profile!.id}/${settings!.current_year}-${Date.now()}.${ext}`
      const up = await supabase.storage.from('bukti-bayaran').upload(path, upFile, { contentType: upFile.type })
      if (up.error) throw new Error('Gagal memuat naik: ' + up.error.message)
      check(await supabase.from('fee_payments').insert({
        family_id: familyId, year: settings!.current_year, amount: Number(amount),
        method: 'pindahan', reference: reference.replace(/\s+/g, '').toUpperCase() || null, proof_path: path, submitted_by: profile!.id,
      }))
    }, 'Bukti bayaran dihantar. Bendahari akan menyemak dan mengeluarkan resit.')
    if (ok) { setFile(null); setReference(''); setOcr({ state: 'idle', pct: 0 }); load() }
  }

  if (!familyId) {
    return (
      <>
        <PageHead title="Yuran PIBG" />
        <div className="callout">
          <strong>Akaun anda belum dipautkan kepada keluarga murid.</strong>
          <p>Tambah anak anda dahulu. Selepas guru kelas mengesahkan, status yuran keluarga akan dipaparkan di sini.</p>
          <Link className="btn primary" to="/anak">Tambah anak</Link>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHead title={`Yuran PIBG ${settings?.current_year ?? ''}`} sub="Yuran dikenakan sekali bagi setiap keluarga, tidak mengira bilangan anak." />
      {fee && (
        <Card title={`Keluarga ${fee.family_code}`} actions={<Badge tone={feeStatusTone[fee.status]}>{feeStatusLabel[fee.status]}</Badge>}>
          <div className="stats">
            <Stat label="Yuran sekeluarga" value={rm(fee.fee_due)} sub={`${fee.active_children} orang anak`} />
            <Stat label="Telah dibayar" value={rm(fee.paid)} />
            <Stat label="Baki" value={rm(Math.max(0, fee.fee_due - fee.paid))} tone={fee.status === 'lunas' ? 'green' : 'red'} />
          </div>
          <p className="muted small">{fee.children}</p>
        </Card>
      )}

      {fee && fee.status !== 'lunas' && (
        <div className="grid2">
          <Card title="1. Bayar ke akaun PIBG">
            <dl className="dl">
              <dt>Bank</dt><dd>{settings?.bank_name || '-'}</dd>
              <dt>No. akaun</dt><dd className="mono">{settings?.bank_account || '-'}</dd>
              <dt>Nama akaun</dt><dd>{settings?.bank_holder || '-'}</dd>
              <dt>Rujukan</dt><dd className="mono">{fee.family_code}</dd>
            </dl>
            <p className="muted small">Sila tulis kod keluarga <b>{fee.family_code}</b> sebagai rujukan pindahan. Bayaran tunai boleh dibuat di kaunter PIBG.</p>
          </Card>
          <Card title="2. Muat naik bukti bayaran">
            <form className="form" onSubmit={submit}>
              <Field label="Bukti bayaran (gambar atau PDF, maks 5MB)" hint="Tangkapan skrin resit bank. No. rujukan dan jumlah akan dibaca secara automatik.">
                <input required type="file" accept="image/*,application/pdf" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
              </Field>
              {ocr.state === 'reading' && (
                <div className="ocr-box">
                  <span className="small">Membaca resit… {ocr.pct}%</span>
                  <div className="progress thin"><div style={{ width: `${ocr.pct}%` }} /></div>
                </div>
              )}
              {ocr.state === 'done' && ocr.info && (
                <div className="ocr-box">
                  {ocr.info.reference || ocr.info.amount
                    ? <span className="small">✓ Maklumat dibaca daripada resit. <b>Sila semak dan betulkan jika perlu</b> (huruf O dan nombor 0 kadangkala tertukar).</span>
                    : <span className="small">Tidak dapat membaca no. rujukan daripada gambar ini. Sila taip secara manual.</span>}
                  {ocr.info.familyCode && fee && ocr.info.familyCode !== fee.family_code && (
                    <div className="alert err small">Kod keluarga pada resit ({ocr.info.familyCode}) berbeza daripada kod keluarga anda ({fee.family_code}). Pastikan anda memuat naik resit yang betul.</div>
                  )}
                  {ocr.info.familyCode && fee && ocr.info.familyCode === fee.family_code && (
                    <span className="small"> Kod keluarga {fee.family_code} dijumpai pada resit. ✓</span>
                  )}
                  {ocr.info.amount != null && fee && ocr.info.amount < Math.max(0, fee.fee_due - fee.paid) && (
                    <div className="alert err small">Jumlah pada resit ({rm(ocr.info.amount)}) kurang daripada baki yuran ({rm(Math.max(0, fee.fee_due - fee.paid))}).</div>
                  )}
                </div>
              )}
              {ocr.state === 'failed' && <p className="muted small">Bacaan automatik tidak berjaya. Sila isi no. rujukan secara manual.</p>}
              <div className="row gap wrap">
                <Field label="Jumlah dibayar (RM)">
                  <input required type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </Field>
                <Field label="No. rujukan transaksi">
                  <input required value={reference} onChange={(e) => setReference(e.target.value)} placeholder={ocr.state === 'reading' ? 'Membaca…' : ''} className="mono" />
                </Field>
              </div>
              <button className="btn primary" disabled={busy || ocr.state === 'reading'}>{busy ? 'Memuat naik…' : 'Hantar'}</button>
            </form>
          </Card>
        </div>
      )}

      <Card title="Sejarah bayaran">
        {pays.length ? (
          <table className="table">
            <thead><tr><th>Tarikh</th><th>Tahun</th><th>Jumlah</th><th>Status</th><th>Resit</th></tr></thead>
            <tbody>
              {pays.map((p) => (
                <tr key={p.id}>
                  <td>{dateTime(p.submitted_at)}</td>
                  <td>{p.year}</td>
                  <td>{rm(p.amount)}</td>
                  <td>
                    <Badge tone={payTone[p.status]}>{payLabel[p.status]}</Badge>
                    {p.review_note && p.status === 'ditolak' && <div className="muted small">{p.review_note}</div>}
                  </td>
                  <td>{p.receipt_no ? <Link to={`/resit/${p.id}`} className="link">{p.receipt_no}</Link> : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty>Belum ada bayaran.</Empty>}
      </Card>
    </>
  )
}
