import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase, check } from '../lib/supabase'
import { useAuth, useRole } from '../lib/auth'
import { PageHead } from '../components/Layout'
import { Badge, Card, Empty, Field, Modal, Stat, useAction } from '../components/ui'
import { date, rm, type Tone } from '../lib/util'
import type { FundSummary } from './Dashboard'

interface Program {
  id: number; title: string; description: string | null; start_date: string | null; end_date: string | null
  budget: number; status: string; panitia: string | null; created_by: string | null
}
interface Txn { id: number; txn_date: string; kind: 'masuk' | 'keluar'; category: string; amount: number; description: string | null; program_id: number | null }

const progLabel: Record<string, [string, Tone]> = {
  dirancang: ['Dirancang', 'blue'], berjalan: ['Sedang berjalan', 'amber'], selesai: ['Selesai', 'green'], dibatalkan: ['Dibatalkan', 'grey'],
}
const CATS = ['Program murid', 'Hadiah & sumbangan', 'Kemudahan sekolah', 'Pentadbiran', 'Sumbangan diterima', 'Jualan / derma', 'Lain-lain']

export default function Funds() {
  const { settings, profile } = useAuth()
  const r = useRole()
  const [year, setYear] = useState(settings?.current_year ?? new Date().getFullYear())
  const [fund, setFund] = useState<FundSummary | null>(null)
  const [progs, setProgs] = useState<Program[]>([])
  const [txns, setTxns] = useState<Txn[]>([])
  const [editProg, setEditProg] = useState<Program | 'new' | null>(null)
  const [addTxn, setAddTxn] = useState(false)

  const load = useCallback(async () => {
    const [f, p, t] = await Promise.all([
      supabase.rpc('fund_summary', { p_year: year }),
      supabase.from('programs').select('*').order('start_date', { ascending: false, nullsFirst: true }),
      supabase.from('transactions').select('*').gte('txn_date', `${year}-01-01`).lte('txn_date', `${year}-12-31`).order('txn_date', { ascending: false }),
    ])
    setFund((f.data as FundSummary[] | null)?.[0] ?? null)
    setProgs((p.data as Program[]) ?? [])
    setTxns((t.data as Txn[]) ?? [])
  }, [year])
  useEffect(() => { load() }, [load])

  const spentBy = useMemo(() => {
    const m: Record<number, number> = {}
    txns.forEach((t) => { if (t.kind === 'keluar' && t.program_id) m[t.program_id] = (m[t.program_id] ?? 0) + Number(t.amount) })
    return m
  }, [txns])

  const byCat = useMemo(() => {
    const m: Record<string, number> = {}
    txns.filter((t) => t.kind === 'keluar').forEach((t) => { m[t.category] = (m[t.category] ?? 0) + Number(t.amount) })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [txns])
  const maxCat = byCat[0]?.[1] ?? 1

  const canProg = r.isStaff || r.role === 'panitia'

  return (
    <>
      <PageHead title="Dana & Program PIBG" sub="Ketelusan penggunaan dana PIBG untuk semua ibu bapa."
        actions={
          <>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {[0, 1, 2].map((d) => { const y = (settings?.current_year ?? year) - d; return <option key={y} value={y}>{y}</option> })}
            </select>
            {r.isStaff && <button className="btn" onClick={() => setAddTxn(true)}>+ Transaksi</button>}
            {canProg && <button className="btn primary" onClick={() => setEditProg('new')}>+ Program</button>}
          </>
        } />
      {fund && (
        <div className="stats">
          <Stat label="Yuran dikutip" value={rm(fund.yuran_collected)} sub={`${fund.families_paid} daripada ${fund.families_total} keluarga`} />
          <Stat label="Sumbangan (kutipan dana)" value={rm(fund.donations)} />
          <Stat label="Pendapatan lain" value={rm(fund.other_income)} />
          <Stat label="Perbelanjaan" value={rm(fund.expenses)} />
          <Stat label="Lebihan / kurangan tahun ini" value={rm(fund.balance)} tone={Number(fund.balance) < 0 ? 'red' : 'green'} />
        </div>
      )}

      <div className="grid2">
        <Card title="Perbelanjaan mengikut kategori">
          {byCat.length ? (
            <div className="bars">
              {byCat.map(([k, v]) => (
                <div key={k} className="bar-row">
                  <span>{k}</span>
                  <div className="bar"><div style={{ width: `${(v / maxCat) * 100}%` }} /></div>
                  <b>{rm(v)}</b>
                </div>
              ))}
            </div>
          ) : <Empty>Belum ada perbelanjaan direkodkan.</Empty>}
        </Card>

        <Card title="Program">
          {progs.length ? (
            <ul className="list">
              {progs.map((p) => {
                const spent = spentBy[p.id] ?? 0
                return (
                  <li key={p.id} className="prog" onClick={() => (r.isStaff || p.created_by === profile?.id) && setEditProg(p)}>
                    <div>
                      <strong>{p.title}</strong> <Badge tone={progLabel[p.status][1]}>{progLabel[p.status][0]}</Badge>
                      <div className="muted small">
                        {date(p.start_date)}{p.panitia ? ` · ${p.panitia}` : ''} · Bajet {rm(p.budget)} · Dibelanjakan {rm(spent)}
                      </div>
                      {p.description && <div className="small">{p.description}</div>}
                      {Number(p.budget) > 0 && (
                        <div className="progress thin"><div style={{ width: `${Math.min(100, (spent / Number(p.budget)) * 100)}%` }} /></div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : <Empty>Belum ada program.</Empty>}
        </Card>
      </div>

      <Card title={`Transaksi ${year}`}>
        {txns.length ? (
          <table className="table">
            <thead><tr><th>Tarikh</th><th>Kategori</th><th>Butiran</th><th>Program</th><th className="num">Masuk</th><th className="num">Keluar</th></tr></thead>
            <tbody>
              {txns.map((t) => (
                <tr key={t.id}>
                  <td>{date(t.txn_date)}</td>
                  <td>{t.category}</td>
                  <td>{t.description}</td>
                  <td className="small">{progs.find((p) => p.id === t.program_id)?.title ?? ''}</td>
                  <td className="num">{t.kind === 'masuk' ? rm(t.amount) : ''}</td>
                  <td className="num">{t.kind === 'keluar' ? rm(t.amount) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty>Tiada transaksi selain kutipan yuran.</Empty>}
        <p className="muted small">Kutipan yuran PIBG dikira secara automatik daripada bayaran yang diluluskan.</p>
      </Card>

      {editProg && <ProgramModal prog={editProg === 'new' ? null : editProg} onClose={() => setEditProg(null)} onDone={() => { setEditProg(null); load() }} />}
      {addTxn && <TxnModal progs={progs} onClose={() => setAddTxn(false)} onDone={() => { setAddTxn(false); load() }} />}
    </>
  )
}

function ProgramModal({ prog, onClose, onDone }: { prog: Program | null; onClose: () => void; onDone: () => void }) {
  const { profile } = useAuth()
  const r = useRole()
  const [f, setF] = useState({
    title: prog?.title ?? '', description: prog?.description ?? '', start_date: prog?.start_date ?? '',
    end_date: prog?.end_date ?? '', budget: String(prog?.budget ?? ''), status: prog?.status ?? 'dirancang',
    panitia: prog?.panitia ?? profile?.panitia ?? '',
  })
  const { busy, run } = useAction()
  const submit = (e: FormEvent) => { e.preventDefault(); run(async () => {
    const body = { ...f, budget: Number(f.budget || 0), start_date: f.start_date || null, end_date: f.end_date || null }
    if (prog) check(await supabase.from('programs').update(body).eq('id', prog.id))
    else check(await supabase.from('programs').insert({ ...body, status: r.isStaff ? f.status : 'dirancang', created_by: profile!.id }))
    onDone()
  }, 'Program disimpan.') }
  return (
    <Modal title={prog ? 'Kemas kini program' : 'Program baru'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Nama program"><input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Penerangan"><textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="row gap">
          <Field label="Mula"><input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></Field>
          <Field label="Tamat"><input type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></Field>
        </div>
        <div className="row gap">
          <Field label="Bajet (RM)"><input type="number" min="0" step="0.01" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} /></Field>
          <Field label="Panitia / unit"><input value={f.panitia} onChange={(e) => setF({ ...f, panitia: e.target.value })} /></Field>
        </div>
        {r.isStaff && (
          <Field label="Status">
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              {Object.entries(progLabel).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
        )}
        <button className="btn primary" disabled={busy}>Simpan</button>
      </form>
    </Modal>
  )
}

function TxnModal({ progs, onClose, onDone }: { progs: Program[]; onClose: () => void; onDone: () => void }) {
  const { profile } = useAuth()
  const [f, setF] = useState({ txn_date: new Date().toISOString().slice(0, 10), kind: 'keluar', category: CATS[0], amount: '', description: '', program_id: '' })
  const { busy, run } = useAction()
  const submit = (e: FormEvent) => { e.preventDefault(); run(async () => {
    check(await supabase.from('transactions').insert({
      ...f, amount: Number(f.amount), program_id: f.program_id ? Number(f.program_id) : null, created_by: profile!.id,
    }))
    onDone()
  }, 'Transaksi direkod.') }
  return (
    <Modal title="Transaksi baru" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="row gap">
          <Field label="Tarikh"><input type="date" required value={f.txn_date} onChange={(e) => setF({ ...f, txn_date: e.target.value })} /></Field>
          <Field label="Jenis">
            <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
              <option value="keluar">Perbelanjaan</option><option value="masuk">Pendapatan</option>
            </select>
          </Field>
        </div>
        <div className="row gap">
          <Field label="Kategori">
            <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
          </Field>
          <Field label="Jumlah (RM)"><input type="number" min="0.01" step="0.01" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        </div>
        <Field label="Butiran"><input required value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Program berkaitan (pilihan)">
          <select value={f.program_id} onChange={(e) => setF({ ...f, program_id: e.target.value })}>
            <option value="">-</option>{progs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </Field>
        <button className="btn primary" disabled={busy}>Simpan</button>
      </form>
    </Modal>
  )
}
