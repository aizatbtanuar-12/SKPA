import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase, check } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { PageHead } from '../../components/Layout'
import { Badge, Card, Empty, Field, Stat, useAction } from '../../components/ui'
import { dateTime, feeStatusLabel, feeStatusTone, payLabel, payTone, rm } from '../../lib/util'
import type { FeeStatus } from '../Dashboard'

export interface Payment {
  id: number; family_id: number; year: number; amount: number; method: string; reference: string | null
  proof_path: string | null; status: string; receipt_no: string | null; submitted_at: string
  review_note: string | null; reviewed_at: string | null
}

/** Shrink phone photos (often 3–8 MB) to ~200–400 KB so the free 1 GB storage lasts for years. PDFs pass through. */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.8))
    return blob && blob.size < file.size ? new File([blob], 'bukti.jpg', { type: 'image/jpeg' }) : file
  } catch {
    return file
  }
}

export default function ParentFees() {
  const { profile, settings, familyId } = useAuth()
  const [fee, setFee] = useState<FeeStatus | null>(null)
  const [pays, setPays] = useState<Payment[]>([])
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const { busy, run } = useAction()

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
        method: 'pindahan', reference: reference.trim() || null, proof_path: path, submitted_by: profile!.id,
      }))
    }, 'Bukti bayaran dihantar. Bendahari akan menyemak dan mengeluarkan resit.')
    if (ok) { setFile(null); setReference(''); load() }
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
              <Field label="Jumlah dibayar (RM)">
                <input required type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label="No. rujukan transaksi (pilihan)">
                <input value={reference} onChange={(e) => setReference(e.target.value)} />
              </Field>
              <Field label="Bukti bayaran (gambar atau PDF, maks 5MB)">
                <input required type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </Field>
              <button className="btn primary" disabled={busy}>{busy ? 'Memuat naik…' : 'Hantar'}</button>
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
