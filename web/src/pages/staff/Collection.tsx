import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase, check } from '../../lib/supabase'
import { useAuth, useRole } from '../../lib/auth'
import { PageHead } from '../../components/Layout'
import { Badge, Card, Field, Modal, Stat, useAction } from '../../components/ui'
import { download, feeStatusLabel, feeStatusTone, rm, toCSV } from '../../lib/util'
import type { FeeStatus } from '../Dashboard'
import { DataTable } from '../../components/DataTable'

export default function Collection() {
  const { settings, classes } = useAuth()
  const canReview = useRole().can('semak_bayaran')
  const [rows, setRows] = useState<FeeStatus[]>([])
  const [filter, setFilter] = useState<'' | 'lunas' | 'menunggu' | 'belum'>('')
  const [cls, setCls] = useState('')
  const [q, setQ] = useState('')
  const [pay, setPay] = useState<FeeStatus | null>(null)
  const [classFam, setClassFam] = useState<Set<number> | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('family_fee_status').select('*').order('family_code')
    setRows((data as FeeStatus[]) ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!cls) { setClassFam(null); return }
    supabase.from('students').select('family_id').eq('class_id', Number(cls)).eq('status', 'aktif')
      .then(({ data }) => setClassFam(new Set((data ?? []).map((d: { family_id: number }) => d.family_id))))
  }, [cls])

  const shown = useMemo(() => rows.filter((r) =>
    (!filter || r.status === filter) &&
    (!classFam || classFam.has(r.family_id)) &&
    (!q || `${r.family_code} ${r.children} ${r.guardians}`.toLowerCase().includes(q.toLowerCase()))
  ), [rows, filter, classFam, q])

  const tot = useMemo(() => ({
    fam: rows.length,
    lunas: rows.filter((r) => r.status === 'lunas').length,
    collected: rows.reduce((a, r) => a + Number(r.paid), 0),
    expected: rows.length * Number(settings?.fee_per_family ?? 0),
    kids: rows.reduce((a, r) => a + Number(r.active_children), 0),
  }), [rows, settings])

  const exportCSV = () => download(`yuran-pibg-${settings?.current_year}${filter ? '-' + filter : ''}.csv`, toCSV(shown.map((r) => ({
    kod_keluarga: r.family_code, penjaga: r.guardians, telefon: r.phone ?? '', anak: r.children,
    bil_anak: r.active_children, yuran: r.fee_due, dibayar: r.paid, status: feeStatusLabel[r.status],
  }))))

  return (
    <>
      <PageHead title={`Kutipan Yuran ${settings?.current_year ?? ''}`} sub={`${rm(settings?.fee_per_family)} sekeluarga`}
        actions={<button className="btn ghost" onClick={exportCSV}>Muat turun CSV</button>} />
      <div className="stats">
        <Stat label="Keluarga" value={tot.fam} sub={`${tot.kids} murid`} />
        <Stat label="Lunas" value={`${tot.lunas} / ${tot.fam}`} tone="green" />
        <Stat label="Dikutip" value={rm(tot.collected)} sub={`daripada ${rm(tot.expected)}`} />
        <Stat label="Jimat ibu bapa (adik-beradik)" value={rm((tot.kids - tot.fam) * Number(settings?.fee_per_family ?? 0))}
          sub="berbanding yuran per murid" />
      </div>
      <div className="filters">
        <input placeholder="Cari kod, nama anak atau penjaga…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={cls} onChange={(e) => setCls(e.target.value)}>
          <option value="">Semua kelas</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="seg">
          {(['', 'belum', 'menunggu', 'lunas'] as const).map((k) => (
            <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{k ? feeStatusLabel[k] : 'Semua'}</button>
          ))}
        </div>
      </div>
      <Card>
        <DataTable rows={shown} rowKey={(r) => r.family_id} pageSize={15} resetKey={`${filter}|${cls}|${q}`}
          initialSort={{ key: 'kod', dir: 'asc' }} empty="Tiada keluarga."
          cols={[
            { key: 'kod', label: 'Kod', sort: (r) => r.family_code, className: 'mono', render: (r) => r.family_code },
            { key: 'anak', label: 'Anak', sort: (r) => r.children, className: 'small', render: (r) => r.children },
            { key: 'penjaga', label: 'Penjaga', sort: (r) => r.guardians, className: 'small', render: (r) => <>{r.guardians}<div className="muted">{r.phone}</div></> },
            { key: 'dibayar', label: 'Dibayar', num: true, sort: (r) => Number(r.paid), render: (r) => rm(r.paid) },
            { key: 'status', label: 'Status', sort: (r) => feeStatusLabel[r.status], render: (r) => <Badge tone={feeStatusTone[r.status]}>{feeStatusLabel[r.status]}</Badge> },
            { key: 'aksi', label: '', render: (r) => <div className="row-actions">
              {canReview && r.status === 'menunggu' && <Link to="/semakan-bayaran" className="btn ghost small">Semak</Link>}
              {r.status !== 'lunas' && <button className="btn small" onClick={() => setPay(r)}>Rekod bayaran</button>}
            </div> },
          ]} />
      </Card>
      {pay && <RecordPayment fam={pay} onClose={() => setPay(null)} onDone={() => { setPay(null); load() }} />}
    </>
  )
}

function RecordPayment({ fam, onClose, onDone }: { fam: FeeStatus; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(String(Math.max(0, fam.fee_due - fam.paid)))
  const [method, setMethod] = useState('tunai')
  const [ref, setRef] = useState('')
  const [receipt, setReceipt] = useState<string | null>(null)
  const { busy, run } = useAction()

  const submit = (e: FormEvent) => { e.preventDefault(); run(async () => {
    const no = check(await supabase.rpc('record_payment', { p_family: fam.family_id, p_amount: Number(amount), p_method: method, p_reference: ref || null }))
    setReceipt(no as string)
  }) }

  return (
    <Modal title={`Rekod bayaran: ${fam.family_code}`} onClose={receipt ? onDone : onClose}>
      <p className="small">{fam.children}<br /><span className="muted">{fam.guardians}</span></p>
      {receipt ? (
        <>
          <div className="alert ok">Bayaran direkod. No. resit: <b className="mono">{receipt}</b></div>
          <button className="btn primary" onClick={onDone}>Selesai</button>
        </>
      ) : (
        <form className="form" onSubmit={submit}>
          <div className="row gap">
            <Field label="Jumlah (RM)"><input required type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field label="Kaedah">
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="tunai">Tunai</option><option value="pindahan">Pindahan bank</option><option value="lain">Lain-lain</option>
              </select>
            </Field>
          </div>
          <Field label="Rujukan / catatan"><input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="cth: Kaunter hari pendaftaran" /></Field>
          <button className="btn primary" disabled={busy}>Rekod & jana resit</button>
        </form>
      )}
    </Modal>
  )
}
