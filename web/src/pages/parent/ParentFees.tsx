import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase, check } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useAction, useToast } from '../../components/ui'
import { readReceipt, type ReceiptInfo } from '../../lib/receiptOcr'
import { compressImage } from '../../lib/image'
import { useFamily, levelName } from '../../lib/useFamily'
import { date, feeStatusLabel, payLabel, rm } from '../../lib/util'
import { PageHead, PBadge, PPager, Seg, initials, tintBg, tintInk, useIsMobile, usePaged, useScrollTop, type PTone } from '../../components/pui'

export interface Payment {
  id: number; family_id: number; year: number; amount: number; method: string; reference: string | null
  proof_path: string | null; status: string; receipt_no: string | null; submitted_at: string
  review_note: string | null; reviewed_at: string | null
}

const feeTone: Record<string, PTone> = { lunas: 'green', menunggu: 'amber', belum: 'red' }
const payTone: Record<string, PTone> = { dihantar: 'amber', diluluskan: 'green', ditolak: 'red' }
type Tab = 'status' | 'bayar' | 'sejarah'

export default function ParentFees() {
  const { profile, settings } = useAuth()
  const { familyId, fee, kids, pays, reload } = useFamily()
  const mobile = useIsMobile()
  const loc = useLocation()
  const toast = useToast()
  const initial = (loc.state as { tab?: Tab } | null)?.tab
  const [tab, setTab] = useState<Tab>(initial ?? (mobile ? 'status' : 'bayar'))
  const [step, setStep] = useState(0)
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [ocr, setOcr] = useState<{ state: 'idle' | 'reading' | 'done' | 'failed'; pct: number; info?: ReceiptInfo }>({ state: 'idle', pct: 0 })
  const hist = usePaged(pays, 3)
  const { busy, run } = useAction()
  useScrollTop(tab)

  const status = fee?.status ?? 'belum'
  const balance = fee ? Math.max(0, Number(fee.fee_due) - Number(fee.paid)) : 0

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

  const submit = () => run(async () => {
    if (!file) throw new Error('Sila pilih fail bukti bayaran.')
    if (!reference.trim()) throw new Error('Sila isi no. rujukan transaksi.')
    const upFile = await compressImage(file)
    if (upFile.size > 5 * 1024 * 1024) throw new Error('Saiz fail maksimum 5MB.')
    const ext = upFile.type === 'application/pdf' ? 'pdf' : upFile.type === 'image/jpeg' ? 'jpg' : (upFile.name.split('.').pop()?.toLowerCase() || 'jpg')
    const path = `${profile!.id}/${settings!.current_year}-${Date.now()}.${ext}`
    const up = await supabase.storage.from('bukti-bayaran').upload(path, upFile, { contentType: upFile.type })
    if (up.error) throw new Error('Gagal memuat naik: ' + up.error.message)
    check(await supabase.from('fee_payments').insert({
      family_id: familyId, year: settings!.current_year, amount: Number(amount || balance),
      method: 'pindahan', reference: reference.replace(/\s+/g, '').toUpperCase() || null, proof_path: path, submitted_by: profile!.id,
    }))
    setFile(null); setReference(''); setAmount(''); setOcr({ state: 'idle', pct: 0 }); setStep(0)
    await reload()
  }, 'Bukti bayaran dihantar. Bendahari akan menyemak dan mengeluarkan resit.')

  const copy = async (label: string, text: string) => {
    try { await navigator.clipboard.writeText(text); toast(`${label} disalin`) } catch { toast('Tidak dapat menyalin.', 'err') }
  }

  if (!familyId) {
    return (
      <>
        <PageHead title="Yuran PIBG" sub="Sekali bagi setiap keluarga, tak kira bilangan anak." />
        <div className="pcard">
          <h2>Akaun anda belum dipautkan kepada keluarga murid</h2>
          <p className="muted">Tambah anak anda dahulu. Selepas guru kelas mengesahkan, status yuran keluarga akan dipaparkan di sini.</p>
          <Link className="pbtn" to="/anak" state={{ tab: 'tambah' }}>Tambah anak →</Link>
        </div>
      </>
    )
  }
  if (!fee) return <div className="pempty">Memuatkan…</div>

  // ---------- panels ----------
  const famCard = (
    <div className="pnavy famcard">
      <div className="deco-disc" style={{ right: -30, bottom: -50, width: 150, height: 150, background: 'var(--accent)' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="lbl">Kod keluarga</span><PBadge tone={feeTone[status]}>{feeStatusLabel[status]}</PBadge>
      </div>
      <div className="famcode" translate="no">{fee.family_code}</div>
      <div className="note">Guna kod ini sebagai rujukan pindahan bank</div>
      <div className="fee-tiles">
        <div><span>Yuran</span><b>{rm(fee.fee_due)}</b></div>
        <div><span>Dibayar</span><b>{rm(fee.paid)}</b></div>
        <div className="light"><span style={{ color: 'var(--muted)', opacity: 1 }}>Baki</span><b style={{ color: balance > 0 ? '#b3352b' : '#1d8a4e' }}>{rm(balance)}</b></div>
      </div>
    </div>
  )

  const kidsList = (
    <div className={mobile ? '' : 'pcard'} style={{ marginTop: mobile ? 18 : 16 }}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>Dikira untuk {kids.length} orang anak</div>
      <div className="pstack" style={{ gap: 8 }}>
        {kids.map((k, i) => (
          <div key={k.id} className="child-row" style={mobile ? undefined : { border: 0, padding: '4px 0' }}>
            <span className="initials" style={{ background: tintBg(i + 1, 0.92), color: tintInk(i + 1) }}>{initials(k.full_name)}</span>
            <div><b translate="no">{k.full_name}</b><span>{[levelName(k.year), k.className].filter(Boolean).join(' · ')}</span></div>
          </div>
        ))}
      </div>
    </div>
  )

  const statusPanel = (
    <div className="up">
      {famCard}
      {kidsList}
      {status === 'belum' && <button className="pbtn" style={{ marginTop: 16 }} onClick={() => setTab('bayar')}>Teruskan ke bayaran →</button>}
    </div>
  )

  const readyForNext = step !== 1 || (file && ocr.state !== 'reading')
  const steps = ['Pindah', 'Bukti', 'Hantar']
  const bankRows: [string, string, boolean, boolean][] = [
    ['Bank', settings?.bank_name || '-', false, false],
    ['No. akaun', settings?.bank_account || '-', true, false],
    ['Nama akaun', settings?.bank_holder || '-', false, false],
    ['Rujukan (wajib)', fee.family_code, true, true],
  ]

  const payPanel = status !== 'belum' ? (
    <div className="pcard confirm up">
      <div className="tick" aria-hidden="true">✓</div>
      <h3>{status === 'menunggu' ? 'Bukti bayaran dihantar!' : `Yuran ${fee.year} telah lunas`}</h3>
      <p>{status === 'menunggu'
        ? 'Bendahari akan menyemak bukti anda dan mengeluarkan resit dalam 1–3 hari.'
        : 'Terima kasih. Resit rasmi boleh dilihat dalam sejarah bayaran.'}</p>
      <button className="pbtn sec" onClick={() => setTab('sejarah')}>Lihat sejarah bayaran</button>
    </div>
  ) : (
    <div className="pcard up">
      <div className="stepbar">{steps.map((s, i) => <div key={s} className={i <= step ? 'done' : ''}>{s}</div>)}</div>
      <div className="eyebrow">Langkah {step + 1} / 3</div>

      {step === 0 && (
        <div className="up" key="s0">
          <div className="step-title">Pindah ke akaun PIBG</div>
          <div className="bank-rows">
            {bankRows.map(([label, value, mono, key]) => (
              <div key={label} className={`bank-row ${key ? 'key' : ''}`}>
                <div><span>{label}</span><b className={mono ? 'mono' : ''} translate={mono ? 'no' : undefined}>{value}</b></div>
                <button type="button" className="copy-btn" onClick={() => copy(label.replace(' (wajib)', ''), value)}>Salin</button>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 13, margin: '12px 0 0' }}>Jumlah perlu dibayar: <b style={{ color: 'var(--ink)' }}>{rm(balance)}</b>. Bayaran tunai boleh dibuat di kaunter PIBG.</p>
        </div>
      )}

      {step === 1 && (
        <div className="up" key="s1">
          <div className="step-title">Muat naik bukti bayaran</div>
          <label className="dropzone">
            <span className="ico" aria-hidden="true">⇪</span>
            <b>{file ? file.name : 'Pilih gambar resit'}</b>
            <span>{file ? 'Ketik untuk tukar fail' : 'Tangkapan skrin resit bank atau PDF, maks 5MB'}</span>
            <input type="file" accept="image/*,application/pdf" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
          </label>
          {ocr.state === 'reading' && (
            <div className="pinfo blue" style={{ marginTop: 12 }}>
              Membaca resit… {ocr.pct}%
              <div className="track" style={{ height: 5, marginTop: 8 }}><div style={{ width: `${ocr.pct}%` }} /></div>
            </div>
          )}
          {ocr.state === 'done' && ocr.info && (
            <div className="pstack" style={{ marginTop: 12, gap: 8 }}>
              <div className="pinfo green">
                {ocr.info.reference || ocr.info.amount ? '✓ Maklumat dibaca daripada resit.' : 'Tidak dapat membaca no. rujukan. Sila taip pada langkah seterusnya.'}
                {ocr.info.familyCode === fee.family_code && <> Kod keluarga {fee.family_code} dijumpai. ✓</>}
              </div>
              {ocr.info.familyCode && ocr.info.familyCode !== fee.family_code && (
                <div className="pinfo red">Kod keluarga pada resit ({ocr.info.familyCode}) berbeza daripada kod keluarga anda ({fee.family_code}). Pastikan anda memuat naik resit yang betul.</div>
              )}
              {ocr.info.amount != null && ocr.info.amount < balance && (
                <div className="pinfo red">Jumlah pada resit ({rm(ocr.info.amount)}) kurang daripada baki yuran ({rm(balance)}).</div>
              )}
            </div>
          )}
          {ocr.state === 'failed' && <div className="pinfo amber" style={{ marginTop: 12 }}>Bacaan automatik tidak berjaya. Sila isi secara manual pada langkah seterusnya.</div>}
        </div>
      )}

      {step === 2 && (
        <div className="up" key="s2">
          <div className="step-title">Semak &amp; hantar</div>
          <label className="pfield"><span>Jumlah dibayar (RM)</span>
            <input type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label className="pfield"><span>No. rujukan transaksi</span>
            <input className="mono" value={reference} onChange={(e) => setReference(e.target.value)} />
            <small>Huruf O dan nombor 0 kadangkala tertukar — sila semak.</small></label>
        </div>
      )}

      <div className="step-foot">
        <button className="pbtn sec" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>Kembali</button>
        {step < 2
          ? <button className="pbtn" disabled={!readyForNext} onClick={() => { if (step === 1 && !amount) setAmount(String(balance)); setStep(step + 1) }}>Seterusnya →</button>
          : <button className="pbtn" disabled={busy || !file} onClick={submit}>{busy ? 'Menghantar…' : 'Hantar bukti'}</button>}
      </div>
    </div>
  )

  const historyPanel = (
    <div className="up">
      {pays.length ? (
        <div className="pstack">
          {hist.slice.map((p) => (
            <div key={p.id} className="hist-row">
              <span className="year-tile">{p.year}</span>
              <div><div className="amt">{rm(p.amount)}</div><div className="when">{date(p.submitted_at)}</div></div>
              <div className="right">
                <PBadge tone={payTone[p.status]}>{payLabel[p.status]}</PBadge>
                {p.receipt_no && <Link to={`/resit/${p.id}`} className="mono" translate="no">{p.receipt_no}</Link>}
                {p.status === 'ditolak' && p.review_note && <span className="muted" style={{ fontSize: 12, maxWidth: 180 }}>{p.review_note}</span>}
              </div>
            </div>
          ))}
        </div>
      ) : <div className="pcard pempty">Belum ada bayaran.</div>}
      <PPager page={hist.page} pages={hist.pages} onChange={hist.setPage} variant={mobile ? 'dots' : 'text'} />
    </div>
  )

  if (mobile) {
    return (
      <>
        <PageHead title="Yuran PIBG" sub="Sekali bagi setiap keluarga, tak kira bilangan anak." />
        <Seg value={tab} onChange={setTab} options={[['status', 'Status'], ['bayar', 'Bayar'], ['sejarah', 'Sejarah']]} />
        {tab === 'status' ? statusPanel : tab === 'bayar' ? payPanel : historyPanel}
      </>
    )
  }

  const deskTab = tab === 'sejarah' ? 'sejarah' : 'bayar'
  return (
    <>
      <PageHead title={`Yuran PIBG ${fee.year}`} sub="Yuran dikenakan sekali bagi setiap keluarga, tidak mengira bilangan anak." />
      <div className="pgrid">
        <div>{famCard}{kidsList}</div>
        <div>
          <Seg value={deskTab} onChange={setTab} options={[['bayar', 'Bayar yuran'], ['sejarah', 'Sejarah bayaran']]} />
          {deskTab === 'bayar' ? payPanel : historyPanel}
        </div>
      </div>
    </>
  )
}
