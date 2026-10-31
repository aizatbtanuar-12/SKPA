import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, check } from '../../lib/supabase'
import { DataTable } from '../../components/DataTable'
import { useAuth } from '../../lib/auth'
import { PageHead } from '../../components/Layout'
import { Badge, Card, Empty, Field, Modal, Spinner, Stat, useAction, useToast } from '../../components/ui'
import { CampaignForm } from './Campaigns'
import { campaignStatus, loadProgress, pct, transferRemark, type Campaign, type Donation, type Progress } from '../../lib/donations'
import { date, dateTime, download, payLabel, payTone, rm, toCSV } from '../../lib/util'

type Row = Donation & { families: { family_code: string } | null; submitter: { full_name: string; phone: string | null } | null }
interface Usage { kind: string; id: number; family_code: string | null; label: string; status: string }
const PAGE = 20

export default function CampaignManage() {
  const { id } = useParams()
  const { settings } = useAuth()
  const toast = useToast()
  const [c, setC] = useState<Campaign | null | undefined>(undefined)
  const [p, setP] = useState<Progress | undefined>()
  const [rows, setRows] = useState<Row[]>([])
  const [tab, setTab] = useState<'semak' | 'semua' | 'kelas'>('semak')
  const [edit, setEdit] = useState(false)
  const [review, setReview] = useState<Row | null>(null)
  const [record, setRecord] = useState(false)
  const { busy, run } = useAction()

  const load = useCallback(async () => {
    const { data } = await supabase.from('campaigns').select('*').eq('id', Number(id)).maybeSingle()
    setC(data as Campaign | null)
    const [d, all] = await Promise.all([
      supabase.from('donations').select('*, families(family_code), submitter:profiles!donations_submitted_by_fkey(full_name,phone)')
        .eq('campaign_id', Number(id)).order('submitted_at', { ascending: false }).limit(2000),
      loadProgress(),
    ])
    setRows((d.data as unknown as Row[]) ?? [])
    setP(all[Number(id)])
  }, [id])
  useEffect(() => { load() }, [load])

  const pending = rows.filter((r) => r.status === 'dihantar')
  const listed = tab === 'semak' ? pending : rows

  if (c === undefined) return <Spinner />
  if (!c) return <Empty>Kutipan tidak dijumpai.</Empty>

  const setStatus = (status: Campaign['status']) => run(async () => {
    check(await supabase.from('campaigns').update({ status }).eq('id', c.id)); await load()
  }, status === 'aktif' ? 'Kutipan dibuka kepada ibu bapa.' : status === 'ditutup' ? 'Kutipan ditutup.' : 'Kutipan dijadikan draf.')

  const whatsapp = () => {
    const link = `${window.location.origin}/#/sumbangan/${c.id}`
    const text = [
      `*${c.title.toUpperCase()}*`, '',
      c.description ?? '', '',
      c.target_amount ? `Sasaran: ${rm(c.target_amount)}` : '',
      c.suggested_amount ? `Cadangan sumbangan: ${rm(c.suggested_amount)} (sebarang jumlah amat dihargai)` : 'Sebarang jumlah sumbangan amat dihargai.',
      c.end_date ? `Tarikh akhir: ${date(c.end_date)}` : '', '',
      '*Kaedah sumbangan*',
      `Bank: ${settings?.bank_name ?? ''}`, `Nama: ${settings?.bank_holder ?? ''}`, `No. akaun: ${settings?.bank_account ?? ''}`,
      `Rujukan: *${c.code} <kod keluarga>*  (cth: ${transferRemark(c.code, 'K00012')})`, '',
      `Selepas membuat pindahan, sila muat naik bukti di portal untuk mendapatkan resit:`, link, '',
      'Terima kasih atas sokongan semua ibu bapa. — PIBG SK Puncak Alam',
    ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n')
    navigator.clipboard.writeText(text).then(() => toast('Teks WhatsApp disalin. Tampal bersama poster.'), () => toast('Tidak dapat menyalin.', 'err'))
  }

  const exportCSV = () => download(`sumbangan-${c.code}.csv`, toCSV(rows.map((r) => ({
    tarikh: r.submitted_at.slice(0, 10), kod_keluarga: r.families?.family_code ?? '', penyumbang: r.donor_name ?? r.submitter?.full_name ?? '',
    jumlah: r.amount, kaedah: r.method, rujukan: r.reference ?? '', status: payLabel[r.status], no_resit: r.receipt_no ?? '',
  }))))

  const percent = pct(Number(p?.collected ?? 0), c.target_amount)

  return (
    <>
      <PageHead title={c.title}
        sub={<><Badge tone={campaignStatus[c.status][1]}>{campaignStatus[c.status][0]}</Badge> <span className="muted">· kod rujukan</span> <code translate="no">{c.code}</code></>}
        actions={<>
          <Link className="btn ghost" to="/kempen">‹ Semua kutipan</Link>
          <button className="btn" onClick={() => setEdit(true)}>Ubah</button>
          {c.status !== 'aktif' && <button className="btn primary" disabled={busy} onClick={() => setStatus('aktif')}>{c.status === 'draf' ? 'Buka kepada ibu bapa' : 'Buka semula'}</button>}
          {c.status === 'aktif' && <button className="btn" disabled={busy} onClick={() => setStatus('ditutup')}>Tutup kutipan</button>}
        </>} />

      <div className="stats">
        <Stat label="Terkumpul" value={rm(p?.collected ?? 0)} sub={c.target_amount ? `${percent}% daripada ${rm(c.target_amount)}` : undefined} tone="green" />
        <Stat label="Penyumbang" value={p?.donors ?? 0} />
        <Stat label="Menunggu semakan" value={pending.length} tone={pending.length ? 'amber' : undefined} />
        <Stat label="Tarikh akhir" value={c.end_date ? date(c.end_date) : '—'} />
      </div>

      <div className="row gap wrap" style={{ marginBottom: '1rem' }}>
        <button className="btn" onClick={whatsapp} disabled={c.status === 'draf'} title={c.status === 'draf' ? 'Buka kutipan dahulu' : ''}>Salin teks WhatsApp</button>
        <Link className="btn" to={`/sumbangan/${c.id}`}>Lihat halaman ibu bapa</Link>
        <button className="btn" onClick={() => setRecord(true)}>Rekod sumbangan tunai / luar</button>
        <button className="btn ghost" onClick={exportCSV}>Muat turun CSV</button>
      </div>

      <div className="tabs-row">
        <div className="seg">
          <button className={tab === 'semak' ? 'on' : ''} onClick={() => setTab('semak')}>Untuk disemak<span>{pending.length}</span></button>
          <button className={tab === 'semua' ? 'on' : ''} onClick={() => setTab('semua')}>Semua sumbangan<span>{rows.length}</span></button>
          <button className={tab === 'kelas' ? 'on' : ''} onClick={() => setTab('kelas')}>Ikut kelas</button>
        </div>
      </div>

      {tab === 'kelas' ? <ByClass rows={rows} /> : (
        <Card>
          <DataTable rows={listed} rowKey={(r) => r.id} pageSize={PAGE} resetKey={tab}
            initialSort={{ key: 'dihantar', dir: tab === 'semak' ? 'asc' : 'desc' }}
            empty={tab === 'semak' ? 'Tiada sumbangan menunggu semakan.' : 'Belum ada sumbangan.'}
            cols={[
              { key: 'dihantar', label: 'Dihantar', sort: (r) => r.submitted_at, className: 'small', render: (r) => dateTime(r.submitted_at) },
              { key: 'siapa', label: 'Keluarga / penyumbang', sort: (r) => r.families?.family_code ?? r.donor_name ?? r.submitter?.full_name, render: (r) => <><span className="mono">{r.families?.family_code ?? ''}</span> {r.donor_name ?? r.submitter?.full_name}</> },
              { key: 'jumlah', label: 'Jumlah', num: true, sort: (r) => Number(r.amount), render: (r) => rm(r.amount) },
              { key: 'ruj', label: 'Rujukan', sort: (r) => r.reference, className: 'mono small', render: (r) => r.reference || '-' },
              { key: 'status', label: 'Status', sort: (r) => payLabel[r.status], render: (r) => <Badge tone={payTone[r.status]}>{payLabel[r.status]}</Badge> },
              { key: 'aksi', label: '', render: (r) => <>
                {r.status === 'dihantar' && <button className="btn primary small" onClick={() => setReview(r)}>Semak</button>}
                {r.receipt_no && <Link className="link small mono" to={`/resit-sumbangan/${r.id}`}>{r.receipt_no}</Link>}
              </> },
            ]} />
        </Card>
      )}

      {edit && <CampaignForm campaign={c} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); load() }} />}
      {review && <Review d={review} onClose={() => setReview(null)} onDone={() => { setReview(null); load() }} />}
      {record && <RecordDonation campaign={c} onClose={() => setRecord(false)} onDone={() => { setRecord(false); load() }} />}
    </>
  )
}

function Review({ d, onClose, onDone }: { d: Row; onClose: () => void; onDone: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [usage, setUsage] = useState<Usage[]>([])
  const [note, setNote] = useState('')
  const { busy, run } = useAction()

  useEffect(() => {
    if (d.proof_path) supabase.storage.from('bukti-bayaran').createSignedUrl(d.proof_path, 600).then(({ data }) => setUrl(data?.signedUrl ?? null))
    if (d.reference) supabase.rpc('reference_usage', { p_reference: d.reference, p_exclude_kind: 'sumbangan', p_exclude_id: d.id })
      .then(({ data }) => setUsage((data as Usage[]) ?? []))
  }, [d])
  const isPdf = d.proof_path?.toLowerCase().endsWith('.pdf')

  return (
    <Modal title={`Sumbangan ${d.families?.family_code ?? ''} · ${rm(d.amount)}`} onClose={onClose} wide>
      <div className="proof">
        {!d.proof_path ? <Empty>Tiada bukti dimuat naik.</Empty> : !url ? <p className="muted">Memuatkan bukti…</p>
          : isPdf ? <a className="btn" href={url} target="_blank" rel="noreferrer">Buka PDF bukti</a>
          : <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Bukti sumbangan" /></a>}
      </div>
      <p className="small">No. rujukan: <b className="mono">{d.reference || '-'}</b> · Oleh {d.submitter?.full_name ?? '-'} · {dateTime(d.submitted_at)}</p>
      <p className="muted small">Pastikan jumlah dan rujukan sepadan dengan penyata bank PIBG sebelum meluluskan.</p>
      {usage.length > 0 && (
        <div className="alert err small">
          ⚠ No. rujukan ini telah digunakan untuk: {usage.map((u) => `${u.label} ${u.family_code ?? ''} (${payLabel[u.status]?.toLowerCase() ?? u.status})`).join(', ')}. Kemungkinan resit yang sama dimuat naik dua kali.
        </div>
      )}
      <Field label="Catatan (wajib jika menolak)"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="row gap end">
        <button className="btn danger" disabled={busy} onClick={() => run(async () => {
          if (!note.trim()) throw new Error('Sila nyatakan sebab penolakan.')
          check(await supabase.rpc('reject_donation', { p_donation: d.id, p_note: note })); onDone()
        }, 'Sumbangan ditolak.')}>Tolak</button>
        <button className="btn primary" disabled={busy} onClick={() => run(async () => {
          check(await supabase.rpc('approve_donation', { p_donation: d.id, p_note: note || null })); onDone()
        }, 'Diluluskan. Resit sumbangan dijana.')}>Luluskan &amp; jana resit</button>
      </div>
    </Modal>
  )
}

function RecordDonation({ campaign, onClose, onDone }: { campaign: Campaign; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ familyCode: '', donor: '', amount: campaign.suggested_amount ? String(campaign.suggested_amount) : '', method: 'tunai', ref: '' })
  const [receipt, setReceipt] = useState<string | null>(null)
  const { busy, run } = useAction()

  const submit = (e: FormEvent) => { e.preventDefault(); run(async () => {
    let family: number | null = null
    if (f.familyCode.trim()) {
      const { data } = await supabase.from('families').select('id').eq('family_code', f.familyCode.trim().toUpperCase()).maybeSingle()
      if (!data) throw new Error('Kod keluarga tidak dijumpai.')
      family = (data as { id: number }).id
    }
    const no = check(await supabase.rpc('record_donation', {
      p_campaign: campaign.id, p_amount: Number(f.amount), p_family: family,
      p_donor_name: f.donor.trim() || null, p_method: f.method, p_reference: f.ref.trim() || null,
    }))
    setReceipt(no as string)
  }) }

  return (
    <Modal title={`Rekod sumbangan · ${campaign.code}`} onClose={receipt ? onDone : onClose}>
      {receipt ? (
        <>
          <div className="alert ok">Sumbangan direkod. No. resit: <b className="mono">{receipt}</b></div>
          <button className="btn primary" onClick={onDone}>Selesai</button>
        </>
      ) : (
        <form className="form" onSubmit={submit}>
          <p className="muted small">Untuk sumbangan tunai di kaunter, atau daripada penyumbang luar (alumni, syarikat, orang awam). Isi kod keluarga atau nama penyumbang.</p>
          <div className="row gap wrap">
            <Field label="Kod keluarga (jika ibu bapa)"><input className="mono" value={f.familyCode} onChange={(e) => setF({ ...f, familyCode: e.target.value })} placeholder="K00012" /></Field>
            <Field label="Nama penyumbang"><input value={f.donor} onChange={(e) => setF({ ...f, donor: e.target.value })} placeholder="cth: Alumni SKPA 2010" /></Field>
          </div>
          <div className="row gap wrap">
            <Field label="Jumlah (RM)"><input required type="number" min="1" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
            <Field label="Kaedah">
              <select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
                <option value="tunai">Tunai</option><option value="pindahan">Pindahan bank</option><option value="lain">Lain-lain</option>
              </select>
            </Field>
          </div>
          <Field label="Rujukan / catatan"><input value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} /></Field>
          <button className="btn primary" disabled={busy}>Rekod &amp; jana resit</button>
        </form>
      )}
    </Modal>
  )
}

/** Participation per class: families with a child in the class who donated (approved) */
function ByClass({ rows }: { rows: Row[] }) {
  const { classes } = useAuth()
  const [students, setStudents] = useState<{ family_id: number; class_id: number | null }[] | null>(null)
  useEffect(() => {
    supabase.from('students').select('family_id,class_id').eq('status', 'aktif').limit(5000)
      .then(({ data }) => setStudents((data as { family_id: number; class_id: number | null }[]) ?? []))
  }, [])

  const table = useMemo(() => {
    if (!students) return []
    const paid = new Map<number, number>()
    rows.filter((r) => r.status === 'diluluskan' && r.family_id).forEach((r) => paid.set(r.family_id!, (paid.get(r.family_id!) ?? 0) + Number(r.amount)))
    return classes.map((c) => {
      const fams = new Set(students.filter((s) => s.class_id === c.id).map((s) => s.family_id))
      const donated = [...fams].filter((f) => paid.has(f))
      return { name: c.name, total: fams.size, donated: donated.length, amount: donated.reduce((a, f) => a + (paid.get(f) ?? 0), 0) }
    }).filter((r) => r.total > 0).sort((a, b) => b.donated / b.total - a.donated / a.total)
  }, [students, rows, classes])

  if (!students) return <Spinner />
  return (
    <Card>
      <DataTable rows={table} rowKey={(r) => r.name} pageSize={15} initialSort={{ key: 'sertai', dir: 'desc' }} empty="Tiada data kelas."
        cols={[
          { key: 'kelas', label: 'Kelas', sort: (r) => r.name, render: (r) => <strong>{r.name}</strong> },
          { key: 'keluarga', label: 'Keluarga menyumbang', sort: (r) => r.donated, render: (r) => `${r.donated} / ${r.total}` },
          { key: 'sertai', label: 'Penyertaan', sort: (r) => r.donated / r.total, render: (r) => { const pc = Math.round((r.donated / r.total) * 100); return <div style={{ minWidth: 160 }}><div className="progress"><div style={{ width: `${pc}%` }} /></div><span className="small muted">{pc}%</span></div> } },
          { key: 'jumlah', label: 'Jumlah keluarga kelas ini', num: true, sort: (r) => r.amount, render: (r) => rm(r.amount) },
        ]} />
      <p className="muted small">Keluarga yang mempunyai anak di beberapa kelas dikira dalam setiap kelas itu. Hanya sumbangan yang diluluskan dikira.</p>
    </Card>
  )
}
