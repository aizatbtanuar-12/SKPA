import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, check } from '../../lib/supabase'
import { PageHead } from '../../components/Layout'
import { Badge, Card, Empty, Field, Modal, useAction } from '../../components/ui'
import { dateTime, payLabel, payTone, rm } from '../../lib/util'
import type { Payment } from '../parent/ParentFees'

type Row = Payment & { families: { family_code: string } | null; submitter: { full_name: string; phone: string | null } | null }

export default function PaymentReview() {
  const [rows, setRows] = useState<Row[]>([])
  const [status, setStatus] = useState('dihantar')
  const [open, setOpen] = useState<Row | null>(null)

  const load = useCallback(async () => {
    let q = supabase.from('fee_payments')
      .select('*, families(family_code), submitter:profiles!fee_payments_submitted_by_fkey(full_name,phone)')
      .order('submitted_at', { ascending: status === 'dihantar' }).limit(300)
    if (status) q = q.eq('status', status)
    const { data } = await q
    setRows((data as unknown as Row[]) ?? [])
  }, [status])
  useEffect(() => { load() }, [load])

  return (
    <>
      <PageHead title="Semakan Bayaran" sub="Semak bukti bayaran yang dimuat naik oleh ibu bapa, kemudian luluskan untuk menjana resit."
        actions={
          <div className="seg">
            {['dihantar', 'diluluskan', 'ditolak', ''].map((s) => (
              <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{s ? payLabel[s] : 'Semua'}</button>
            ))}
          </div>
        } />
      <Card>
        {rows.length ? (
          <table className="table">
            <thead><tr><th>Dihantar</th><th>Keluarga</th><th>Oleh</th><th>Jumlah</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{dateTime(r.submitted_at)}</td>
                  <td className="mono">{r.families?.family_code}</td>
                  <td>{r.submitter?.full_name}<div className="muted small">{r.submitter?.phone}</div></td>
                  <td>{rm(r.amount)}{r.reference && <div className="muted small">{r.reference}</div>}</td>
                  <td><Badge tone={payTone[r.status]}>{payLabel[r.status]}</Badge></td>
                  <td>
                    {r.status === 'dihantar' && <button className="btn primary small" onClick={() => setOpen(r)}>Semak</button>}
                    {r.receipt_no && <Link className="link small" to={`/resit/${r.id}`}>{r.receipt_no}</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty>Tiada bayaran {status ? payLabel[status].toLowerCase() : ''}.</Empty>}
      </Card>
      {open && <Review p={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); load() }} />}
    </>
  )
}

function Review({ p, onClose, onDone }: { p: Row; onClose: () => void; onDone: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [dupes, setDupes] = useState<{ id: number; status: string; families: { family_code: string } | null }[]>([])
  const { busy, run } = useAction()

  // Same bank reference already used on another payment? (re-used / shared receipt)
  useEffect(() => {
    const ref = p.reference?.replace(/\s+/g, '').toUpperCase()
    if (!ref || ref.length < 6) return
    supabase.from('fee_payments').select('id,status,families(family_code)').eq('reference', ref).neq('id', p.id)
      .then(({ data }) => setDupes((data as unknown as typeof dupes) ?? []))
  }, [p.id, p.reference])

  useEffect(() => {
    if (!p.proof_path) return
    supabase.storage.from('bukti-bayaran').createSignedUrl(p.proof_path, 600).then(({ data }) => setUrl(data?.signedUrl ?? null))
  }, [p.proof_path])

  const isPdf = p.proof_path?.toLowerCase().endsWith('.pdf')

  return (
    <Modal title={`Bayaran ${p.families?.family_code} · ${rm(p.amount)}`} onClose={onClose} wide>
      <div className="proof">
        {!p.proof_path ? <Empty>Tiada bukti dimuat naik.</Empty>
          : !url ? <p className="muted">Memuatkan bukti…</p>
          : isPdf ? <a className="btn" href={url} target="_blank" rel="noreferrer">Buka PDF bukti bayaran</a>
          : <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Bukti bayaran" /></a>}
      </div>
      <p className="small">No. rujukan: <b className="mono">{p.reference || '-'}</b> · Dihantar {dateTime(p.submitted_at)}</p>
      <p className="muted small">Pastikan no. rujukan dan jumlah sepadan dengan penyata bank PIBG sebelum meluluskan.</p>
      {dupes.length > 0 && (
        <div className="alert err small">
          ⚠ No. rujukan ini telah digunakan untuk {dupes.length} bayaran lain:{' '}
          {dupes.map((d) => `${d.families?.family_code ?? '?'} (${payLabel[d.status].toLowerCase()})`).join(', ')}.
          Kemungkinan resit yang sama dimuat naik dua kali.
        </div>
      )}
      <Field label="Catatan (wajib jika menolak)">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="cth: Jumlah tidak sepadan dengan penyata bank" />
      </Field>
      <div className="row gap end">
        <button className="btn danger" disabled={busy} onClick={() => run(async () => {
          if (!note.trim()) throw new Error('Sila nyatakan sebab penolakan.')
          check(await supabase.rpc('reject_payment', { p_payment: p.id, p_note: note }))
          onDone()
        }, 'Bayaran ditolak.')}>Tolak</button>
        <button className="btn primary" disabled={busy} onClick={() => run(async () => {
          const no = check(await supabase.rpc('approve_payment', { p_payment: p.id, p_note: note || null }))
          onDone()
          return no
        }, 'Diluluskan. Resit dijana.')}>Luluskan & jana resit</button>
      </div>
    </Modal>
  )
}
