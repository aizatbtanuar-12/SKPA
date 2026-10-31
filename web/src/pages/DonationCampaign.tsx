import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, check } from '../lib/supabase'
import { useAuth, useRole } from '../lib/auth'
import { PageHead } from '../components/Layout'
import { Badge, Card, Empty, Field, Spinner, Stat, useAction, useToast } from '../components/ui'
import { readReceipt, type ReceiptInfo } from '../lib/receiptOcr'
import { compressImage } from '../lib/image'
import { campaignStatus, daysLeft, loadProgress, pct, posterUrl, transferRemark, type Campaign, type Donation, type Progress } from '../lib/donations'
import { date, dateTime, payLabel, payTone, rm } from '../lib/util'

export default function DonationCampaign() {
  const { id } = useParams()
  const { profile, settings, familyId } = useAuth()
  const { isStaff } = useRole()
  const toast = useToast()
  const [c, setC] = useState<Campaign | null | undefined>(undefined)
  const [p, setP] = useState<Progress | undefined>()
  const [familyCode, setFamilyCode] = useState<string | null>(null)
  const [mine, setMine] = useState<Donation[]>([])
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [ocr, setOcr] = useState<{ state: 'idle' | 'reading' | 'done' | 'failed'; pct: number; info?: ReceiptInfo }>({ state: 'idle', pct: 0 })
  const { busy, run } = useAction()

  const load = useCallback(async () => {
    const { data } = await supabase.from('campaigns').select('*').eq('id', Number(id)).maybeSingle()
    const camp = data as Campaign | null
    setC(camp)
    if (!camp) return
    setAmount((a) => a || (camp.suggested_amount ? String(camp.suggested_amount) : ''))
    loadProgress().then((all) => setP(all[camp.id]))
    let q = supabase.from('donations').select('*').eq('campaign_id', camp.id).order('submitted_at', { ascending: false })
    q = familyId ? q.or(`submitted_by.eq.${profile!.id},family_id.eq.${familyId}`) : q.eq('submitted_by', profile!.id)
    const d = await q
    setMine((d.data as Donation[]) ?? [])
  }, [id, familyId, profile])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!familyId) return
    supabase.from('families').select('family_code').eq('id', familyId).maybeSingle()
      .then(({ data }) => setFamilyCode((data as { family_code: string } | null)?.family_code ?? null))
  }, [familyId])

  if (c === undefined) return <Spinner />
  if (!c) return <Empty>Kutipan dana tidak dijumpai.</Empty>

  const remark = transferRemark(c.code, familyCode)
  const percent = pct(Number(p?.collected ?? 0), c.target_amount)
  const left = c.status === 'aktif' ? daysLeft(c.end_date) : null
  const poster = posterUrl(c.poster_path)
  const codeOnReceipt = ocr.info ? ocr.info.text.toUpperCase().replace(/\s+/g, '').includes(c.code) : null

  async function onPick(f: File | null) {
    setFile(f)
    setOcr({ state: 'idle', pct: 0 })
    if (!f || !f.type.startsWith('image/')) return
    setOcr({ state: 'reading', pct: 0 })
    try {
      const info = await readReceipt(f, (n) => setOcr((o) => (o.state === 'reading' ? { ...o, pct: n } : o)))
      setOcr({ state: 'done', pct: 100, info })
      if (info.reference) setReference(info.reference)
      if (info.amount) setAmount(String(info.amount))
    } catch {
      setOcr({ state: 'failed', pct: 0 })
    }
  }

  const submit = (e: FormEvent) => { e.preventDefault(); run(async () => {
    if (!file) throw new Error('Sila pilih fail bukti bayaran.')
    if (!(Number(amount) > 0)) throw new Error('Sila masukkan jumlah sumbangan.')
    const upFile = await compressImage(file)
    if (upFile.size > 5 * 1024 * 1024) throw new Error('Saiz fail maksimum 5MB.')
    const ext = upFile.type === 'application/pdf' ? 'pdf' : upFile.type === 'image/jpeg' ? 'jpg' : (upFile.name.split('.').pop()?.toLowerCase() || 'jpg')
    const path = `${profile!.id}/sumbangan-${c.code}-${Date.now()}.${ext}`
    const up = await supabase.storage.from('bukti-bayaran').upload(path, upFile, { contentType: upFile.type })
    if (up.error) throw new Error('Gagal memuat naik: ' + up.error.message)
    check(await supabase.from('donations').insert({
      campaign_id: c.id, family_id: familyId, amount: Number(amount), method: 'pindahan',
      reference: reference.replace(/\s+/g, '').toUpperCase() || null, proof_path: path, submitted_by: profile!.id,
    }))
    setFile(null); setReference(''); setOcr({ state: 'idle', pct: 0 })
    await load()
  }, 'Terima kasih! Bukti sumbangan dihantar. Bendahari akan menyemak dan mengeluarkan resit.') }

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast('Disalin.') } catch { toast('Tidak dapat menyalin.', 'err') }
  }

  return (
    <>
      <PageHead title={c.title} sub={<><Badge tone={campaignStatus[c.status][1]}>{campaignStatus[c.status][0]}</Badge>{c.end_date && <span className="muted"> · hingga {date(c.end_date)}</span>}</>}
        actions={<>
          <Link className="btn ghost" to="/sumbangan">‹ Semua sumbangan</Link>
          {isStaff && <Link className="btn" to={`/kempen/${c.id}`}>Urus kutipan ini</Link>}
        </>} />

      <div className="stats kpis">
        <Stat label="Terkumpul" value={rm(p?.collected ?? 0)} sub={c.target_amount ? `sasaran ${rm(c.target_amount)}` : undefined} tone="green" />
        <Stat label="Penyumbang" value={p?.donors ?? 0} sub="keluarga / individu" />
        {percent != null && <Stat label="Pencapaian" value={`${percent}%`} sub={<span className="progress thin" style={{ display: 'block', marginTop: 6 }}><span style={{ display: 'block', height: '100%', width: `${percent}%` }} /></span>} tone="amber" />}
        {left != null && left >= 0 && <Stat label="Baki masa" value={`${left} hari`} sub={c.end_date ? `hingga ${date(c.end_date)}` : undefined} />}
      </div>

      <div className={`campaign-layout ${poster ? '' : 'no-poster'}`}>
        <div className="campaign-side">
          {poster && <img src={poster} alt={`Poster ${c.title}`} className="campaign-hero" />}
          {c.description && <Card><p className="pre" style={{ margin: 0 }}>{c.description}</p></Card>}
        </div>
        <div className="campaign-main">
          {c.status === 'aktif' ? (
            <>
          <Card title="1. Pindahkan sumbangan">
            <dl className="dl">
              <dt>Bank</dt><dd>{settings?.bank_name || '-'}</dd>
              <dt>No. akaun</dt><dd className="mono">{settings?.bank_account || '-'}</dd>
              <dt>Nama akaun</dt><dd>{settings?.bank_holder || '-'}</dd>
              {c.suggested_amount && <><dt>Cadangan</dt><dd>{rm(c.suggested_amount)} (sebarang jumlah dialu-alukan)</dd></>}
            </dl>
            <div className="remark-box">
              <span className="small">Tulis ini sebagai <b>rujukan / catatan</b> pindahan anda:</span>
              <div className="row gap">
                <code className="remark" translate="no">{remark}</code>
                <button type="button" className="btn small" onClick={() => copy(remark)}>Salin</button>
              </div>
              {!familyCode && <span className="muted small">Gantikan NAMA ANDA dengan nama anda.</span>}
            </div>
          </Card>
          <Card title="2. Muat naik bukti">
            <form className="form" onSubmit={submit}>
              <Field label="Bukti pindahan (gambar atau PDF, maks 5MB)" hint="No. rujukan dan jumlah akan dibaca secara automatik.">
                <input required type="file" accept="image/*,application/pdf" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
              </Field>
              {ocr.state === 'reading' && (
                <div className="ocr-box"><span className="small">Membaca resit… {ocr.pct}%</span><div className="progress thin"><div style={{ width: `${ocr.pct}%` }} /></div></div>
              )}
              {ocr.state === 'done' && ocr.info && (
                <div className="ocr-box">
                  {ocr.info.reference || ocr.info.amount
                    ? <span className="small">✓ Maklumat dibaca daripada resit. <b>Sila semak dan betulkan jika perlu.</b></span>
                    : <span className="small">Tidak dapat membaca no. rujukan. Sila taip secara manual.</span>}
                  {codeOnReceipt
                    ? <span className="small">Kod {c.code} dijumpai pada resit. ✓</span>
                    : <div className="alert err small">Kod {c.code} tidak dijumpai pada resit. Pastikan ini resit untuk {c.title}; bendahari akan menyemaknya.</div>}
                </div>
              )}
              {ocr.state === 'failed' && <p className="muted small">Bacaan automatik tidak berjaya. Sila isi secara manual.</p>}
              <div className="row gap wrap">
                <Field label="Jumlah (RM)"><input required type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
                <Field label="No. rujukan transaksi"><input required className="mono" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
              </div>
              <button className="btn primary" disabled={busy || ocr.state === 'reading'}>{busy ? 'Menghantar…' : 'Hantar sumbangan'}</button>
            </form>
          </Card>
            </>
          ) : (
            <div className="callout"><strong>Kutipan ini {c.status === 'ditutup' ? 'telah ditutup' : 'belum dibuka'}.</strong><p>Terima kasih kepada semua penyumbang.</p></div>
          )}
        </div>
      </div>

      <Card title="Sumbangan saya">
        {mine.length ? (
          <table className="table">
            <thead><tr><th>Tarikh</th><th className="num">Jumlah</th><th>Status</th><th>Resit</th></tr></thead>
            <tbody>
              {mine.map((d) => (
                <tr key={d.id}>
                  <td>{dateTime(d.submitted_at)}</td>
                  <td className="num">{rm(d.amount)}</td>
                  <td><Badge tone={payTone[d.status]}>{payLabel[d.status]}</Badge>{d.status === 'ditolak' && d.review_note && <div className="muted small">{d.review_note}</div>}</td>
                  <td>{d.receipt_no ? <Link className="link mono small" to={`/resit-sumbangan/${d.id}`}>{d.receipt_no}</Link> : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty>Anda belum menyumbang untuk kutipan ini.</Empty>}
      </Card>
    </>
  )
}
