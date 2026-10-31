import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth, useRole } from '../lib/auth'
import { PageHead } from '../components/Layout'
import { Card, Spinner, Stat } from '../components/ui'
import { DataTable } from '../components/DataTable'
import { Seg, Live, shortRM } from '../components/pui'
import { download, levelLabel, rm, toCSV } from '../lib/util'

interface Overview {
  students: number; families: number; guardians: number; parent_accounts: number; pending_claims: number; classes: number
  fee_due: number; fee_collected: number; families_paid: number; donations: number; expenses: number
}
interface ClassRow {
  class_id: number; class_name: string; year_level: number | null; students: number; families: number
  lunas: number; menunggu: number; belum: number; collected: number; parent_accounts: number
}
interface Month { month: number; payments: number; amount: number }
interface Drive { campaign_id: number; title: string; code: string; status: string; target: number | null; collected: number; donors: number; pending: number; end_date: string | null }
interface Txn { kind: 'masuk' | 'keluar'; category: string; amount: number }

type Tab = 'ringkasan' | 'kelas' | 'dana' | 'kewangan'
const MONTHS = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis']
const pc = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

/** Laporan: totals for the committee and teachers (report_* functions, migration 010). No family details. */
export default function Reports() {
  const { settings } = useAuth()
  const { myClasses } = useRole()
  const [year, setYear] = useState(settings?.current_year ?? new Date().getFullYear())
  const [tab, setTab] = useState<Tab>('ringkasan')
  const [ov, setOv] = useState<Overview | null>(null)
  const [cls, setCls] = useState<ClassRow[]>([])
  const [months, setMonths] = useState<Month[]>([])
  const [drives, setDrives] = useState<Drive[]>([])
  const [txns, setTxns] = useState<Txn[]>([])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setOv(null); setErr(null)
    Promise.all([
      supabase.rpc('report_overview', { p_year: year }),
      supabase.rpc('report_fee_by_class', { p_year: year }),
      supabase.rpc('report_fee_monthly', { p_year: year }),
      supabase.rpc('report_campaigns'),
      supabase.from('transactions').select('kind,category,amount').gte('txn_date', `${year}-01-01`).lte('txn_date', `${year}-12-31`),
    ]).then(([o, c, m, d, t]) => {
      const e = o.error ?? c.error ?? m.error ?? d.error
      if (e) { setErr(/report_/.test(e.message) ? 'Sila jalankan supabase/migrations/010_access.sql dalam Supabase SQL Editor dahulu.' : e.message); return }
      setOv((o.data as Overview[])[0]); setCls((c.data as ClassRow[]) ?? []); setMonths((m.data as Month[]) ?? [])
      setDrives((d.data as Drive[]) ?? []); setTxns((t.data as Txn[]) ?? [])
    })
  }, [year])

  const mine = new Set(myClasses.map((c) => c.id))
  const cats = useMemo(() => {
    const m = new Map<string, { masuk: number; keluar: number }>()
    txns.forEach((t) => { const x = m.get(t.category) ?? { masuk: 0, keluar: 0 }; x[t.kind] += Number(t.amount); m.set(t.category, x) })
    return [...m.entries()].map(([category, v]) => ({ category, ...v }))
  }, [txns])
  const years = [0, 1, 2].map((d) => (settings?.current_year ?? year) - d)

  const head = (
    <PageHead title="Laporan" sub="Ringkasan kutipan dan kewangan PIBG. Jumlah sahaja, tanpa butiran keluarga."
      actions={<select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Tahun">{years.map((y) => <option key={y}>{y}</option>)}</select>} />
  )
  if (err) return <>{head}<div className="callout">{err}</div></>
  if (!ov) return <>{head}<Spinner /></>

  const maxMonth = Math.max(1, ...months.map((m) => Number(m.amount)))

  return (
    <>
      {head}
      <Seg value={tab} onChange={setTab} options={[['ringkasan', 'Ringkasan'], ['kelas', 'Yuran ikut kelas'], ['dana', 'Kutipan dana'], ['kewangan', 'Kewangan']]} />

      {tab === 'ringkasan' && (
        <div className="up" key="ringkasan">
          <div className="stats kpis">
            <Stat label="Yuran dikutip" value={shortRM(ov.fee_collected)} sub={`daripada ${shortRM(ov.fee_due)} dijangka`} tone="green" />
            <Stat label="Keluarga lunas" value={`${pc(ov.families_paid, ov.families)}%`} sub={`${ov.families_paid} / ${ov.families} keluarga`} tone="amber" />
            <Stat label="Sumbangan" value={shortRM(ov.donations)} sub="kutipan dana diluluskan" />
            <Stat label="Perbelanjaan" value={shortRM(ov.expenses)} tone="red" />
          </div>
          <div className="stats kpis">
            <Stat label="Murid aktif" value={ov.students} sub={`${ov.classes} kelas`} />
            <Stat label="Keluarga" value={ov.families} sub={`${ov.guardians} ibu bapa / penjaga`} />
            <Stat label="Ibu bapa ada akaun" value={`${pc(ov.parent_accounts, ov.guardians)}%`} sub={`${ov.parent_accounts} / ${ov.guardians}`} />
            <Stat label="Pengesahan menunggu" value={ov.pending_claims} tone={ov.pending_claims ? 'amber' : undefined} />
          </div>
          <Card title={`Kutipan yuran bulanan ${year}`}>
            <div className="month-bars" role="img" aria-label="Kutipan yuran mengikut bulan">
              {months.map((m) => (
                <div key={m.month} className="mb" title={`${MONTHS[m.month - 1]}: ${rm(m.amount)} (${m.payments} bayaran)`}>
                  <Live as="span" className="v">{Number(m.amount) ? shortRM(m.amount).replace('RM ', '') : ''}</Live>
                  <div className="bar"><div style={{ height: `${(Number(m.amount) / maxMonth) * 100}%` }} /></div>
                  <span className="m">{MONTHS[m.month - 1]}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === 'kelas' && (
        <Card key="kelas" title={`Yuran ${year} ikut kelas`} actions={<button className="btn small" onClick={() => download(`laporan-yuran-kelas-${year}.csv`, toCSV(cls.map((c) => ({
          kelas: c.class_name, tahap: levelLabel(c.year_level), murid: c.students, keluarga: c.families, lunas: c.lunas, menunggu: c.menunggu, belum: c.belum,
          peratus_lunas: pc(c.lunas, c.families), dikutip: c.collected, ibu_bapa_ada_akaun: c.parent_accounts,
        }))))}>Muat turun CSV</button>}>
          <DataTable rows={cls} rowKey={(c) => c.class_id} pageSize={15} empty="Tiada data kelas."
            rowClassName={(c) => (mine.has(c.class_id) ? 'mine' : '')}
            cols={[
              { key: 'kelas', label: 'Kelas', sort: (c) => `${c.year_level ?? 9}-${c.class_name}`, render: (c) => <><strong>{c.class_name}</strong>{mine.has(c.class_id) && <span className="pbadge blue" style={{ marginLeft: 6 }}>Kelas anda</span>}</> },
              { key: 'murid', label: 'Murid', num: true, sort: (c) => c.students, render: (c) => c.students },
              { key: 'keluarga', label: 'Keluarga', num: true, sort: (c) => c.families, render: (c) => c.families },
              { key: 'lunas', label: 'Lunas', num: true, sort: (c) => c.lunas, render: (c) => c.lunas },
              { key: 'menunggu', label: 'Menunggu', num: true, sort: (c) => c.menunggu, render: (c) => c.menunggu },
              { key: 'belum', label: 'Belum', num: true, sort: (c) => c.belum, render: (c) => c.belum },
              { key: 'pct', label: '% lunas', sort: (c) => pc(c.lunas, c.families), render: (c) => (
                <div className="pct-cell"><div className="progress"><div style={{ width: `${pc(c.lunas, c.families)}%` }} /></div><span>{pc(c.lunas, c.families)}%</span></div>) },
              { key: 'dikutip', label: 'Dikutip', num: true, sort: (c) => Number(c.collected), render: (c) => rm(c.collected) },
            ]} />
          <p className="muted small">Keluarga yang mempunyai anak di beberapa kelas dikira dalam setiap kelas itu.</p>
        </Card>
      )}

      {tab === 'dana' && (
        <Card key="dana" title="Kutipan dana" actions={<button className="btn small" onClick={() => download('laporan-kutipan-dana.csv', toCSV(drives.map((d) => ({
          kutipan: d.title, kod: d.code, status: d.status, sasaran: d.target ?? '', terkumpul: d.collected, penyumbang: d.donors, menunggu_semakan: d.pending, tarikh_akhir: d.end_date ?? '',
        }))))}>Muat turun CSV</button>}>
          <DataTable rows={drives} rowKey={(d) => d.campaign_id} pageSize={10} empty="Belum ada kutipan dana."
            cols={[
              { key: 'nama', label: 'Kutipan', sort: (d) => d.title, render: (d) => <><strong>{d.title}</strong><div className="muted small mono">{d.code}</div></> },
              { key: 'status', label: 'Status', sort: (d) => d.status, render: (d) => <span className={`pbadge ${d.status === 'aktif' ? 'green' : 'blue'}`}>{d.status === 'aktif' ? 'Sedang dikutip' : 'Ditutup'}</span> },
              { key: 'kumpul', label: 'Terkumpul', num: true, sort: (d) => Number(d.collected), render: (d) => rm(d.collected) },
              { key: 'sasaran', label: 'Sasaran', num: true, sort: (d) => d.target, render: (d) => (d.target ? rm(d.target) : '-') },
              { key: 'pct', label: 'Pencapaian', sort: (d) => (d.target ? Number(d.collected) / Number(d.target) : null), render: (d) => d.target ? (
                <div className="pct-cell"><div className="progress"><div style={{ width: `${Math.min(100, pc(Number(d.collected), Number(d.target)))}%` }} /></div><span>{pc(Number(d.collected), Number(d.target))}%</span></div>) : '-' },
              { key: 'penyumbang', label: 'Penyumbang', num: true, sort: (d) => d.donors, render: (d) => d.donors },
              { key: 'menunggu', label: 'Menunggu semakan', num: true, sort: (d) => d.pending, render: (d) => d.pending },
            ]} />
        </Card>
      )}

      {tab === 'kewangan' && (
        <Card key="kewangan" title={`Kewangan ${year} ikut kategori`} actions={<button className="btn small" onClick={() => download(`laporan-kewangan-${year}.csv`, toCSV(cats.map((c) => ({ kategori: c.category, masuk: c.masuk, keluar: c.keluar }))))}>Muat turun CSV</button>}>
          <div className="stats kpis">
            <Stat label="Yuran" value={shortRM(ov.fee_collected)} tone="green" />
            <Stat label="Sumbangan" value={shortRM(ov.donations)} tone="green" />
            <Stat label="Pendapatan lain" value={shortRM(cats.reduce((a, c) => a + c.masuk, 0))} />
            <Stat label="Perbelanjaan" value={shortRM(ov.expenses)} tone="red" />
          </div>
          <DataTable rows={cats} rowKey={(c) => c.category} pageSize={15} initialSort={{ key: 'keluar', dir: 'desc' }} empty="Tiada transaksi direkodkan."
            cols={[
              { key: 'kat', label: 'Kategori', sort: (c) => c.category, render: (c) => c.category },
              { key: 'masuk', label: 'Masuk', num: true, sort: (c) => c.masuk || null, render: (c) => (c.masuk ? rm(c.masuk) : '') },
              { key: 'keluar', label: 'Keluar', num: true, sort: (c) => c.keluar || null, render: (c) => (c.keluar ? rm(c.keluar) : '') },
            ]} />
          <p className="muted small">Yuran dan sumbangan dikira daripada bayaran yang diluluskan; pendapatan lain dan perbelanjaan daripada transaksi yang direkodkan.</p>
        </Card>
      )}
    </>
  )
}
