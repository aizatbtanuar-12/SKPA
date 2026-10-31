import { useMemo, useState } from 'react'
import Papa from 'papaparse'
import { supabase, check } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { PageHead } from '../../components/Layout'
import { Card, useAction } from '../../components/ui'
import { download } from '../../lib/util'
import { DataTable } from '../../components/DataTable'

const FIELDS = [
  'nama_murid', 'ic_murid', 'kelas',
  'nama_bapa', 'ic_bapa', 'tel_bapa',
  'nama_ibu', 'ic_ibu', 'tel_ibu',
  'nama_penjaga', 'ic_penjaga', 'tel_penjaga',
] as const
type FieldKey = typeof FIELDS[number]

// Accept common header spellings from APDM / school spreadsheets
const ALIASES: Record<FieldKey, string[]> = {
  nama_murid: ['nama murid', 'nama', 'nama pelajar', 'student name'],
  ic_murid: ['ic murid', 'mykid', 'no mykid', 'no kp murid', 'no. mykid', 'kp murid', 'no sijil lahir'],
  kelas: ['kelas', 'class', 'nama kelas'],
  nama_bapa: ['nama bapa', 'bapa', 'father name'],
  ic_bapa: ['ic bapa', 'no kp bapa', 'kp bapa', 'no. kp bapa', 'mykad bapa'],
  tel_bapa: ['tel bapa', 'telefon bapa', 'no tel bapa', 'hp bapa'],
  nama_ibu: ['nama ibu', 'ibu', 'mother name'],
  ic_ibu: ['ic ibu', 'no kp ibu', 'kp ibu', 'no. kp ibu', 'mykad ibu'],
  tel_ibu: ['tel ibu', 'telefon ibu', 'no tel ibu', 'hp ibu'],
  nama_penjaga: ['nama penjaga', 'penjaga', 'guardian name'],
  ic_penjaga: ['ic penjaga', 'no kp penjaga', 'kp penjaga'],
  tel_penjaga: ['tel penjaga', 'telefon penjaga', 'no tel penjaga'],
}
const clean = (h: string) => h.toLowerCase().replace(/[._\-/]+/g, ' ').replace(/\s+/g, ' ').trim()

function guess(headers: string[]): Record<FieldKey, string> {
  const m = {} as Record<FieldKey, string>
  for (const f of FIELDS) {
    const hit = headers.find((h) => clean(h) === f.replace('_', ' ') || ALIASES[f].includes(clean(h)))
    m[f] = hit ?? ''
  }
  return m
}

interface Result { baru: number; dikemaskini: number; dilangkau: number; amaran: string[] }

export default function Import() {
  const { refresh } = useAuth()
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const numbered = useMemo(() => rows.map((r, i) => ({ ...r, __i: String(i + 1) })), [rows])
  const [headers, setHeaders] = useState<string[]>([])
  const [map, setMap] = useState<Record<FieldKey, string> | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [progress, setProgress] = useState(0)
  const { busy, run } = useAction()

  const onFile = (file: File) => {
    setResult(null)
    Papa.parse<Record<string, string>>(file, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        const h = res.meta.fields ?? []
        setHeaders(h); setRows(res.data); setMap(guess(h))
      },
    })
  }

  const template = () => download('templat-import-murid.csv',
    '﻿' + FIELDS.join(',') + '\n' +
    'Adam bin Ali,150505-10-0001,4 Amanah,Ali bin Abu,800101-10-1111,012-1111111,Siti binti Omar,820202-10-2222,013-2222222,,,\n' +
    'Aisyah binti Ali,170707-10-0002,2 Bestari,Ali bin Abu,800101-10-1111,012-1111111,Siti binti Omar,820202-10-2222,013-2222222,,,\n')

  const doImport = () => run(async () => {
    if (!map?.nama_murid || !map.kelas) throw new Error('Lajur "nama_murid" dan "kelas" wajib dipadankan.')
    const payload = rows.map((r) => Object.fromEntries(FIELDS.map((f) => [f, map[f] ? (r[map[f]] ?? '').trim() : ''])))
    const total: Result = { baru: 0, dikemaskini: 0, dilangkau: 0, amaran: [] }
    const size = 200
    for (let i = 0; i < payload.length; i += size) {
      const r = check(await supabase.rpc('import_students', { p_rows: payload.slice(i, i + size) })) as Result
      total.baru += r.baru; total.dikemaskini += r.dikemaskini; total.dilangkau += r.dilangkau
      total.amaran.push(...r.amaran.map((w) => w.replace(/^Baris (\d+)/, (_, n) => `Baris ${Number(n) + i + 1}`)))
      setProgress(Math.min(100, Math.round(((i + size) / payload.length) * 100)))
    }
    setResult(total)
    await refresh()
  }, 'Import selesai.')

  return (
    <>
      <PageHead title="Import Data Murid" sub="Muat naik senarai murid dan ibu bapa dari Excel (simpan sebagai CSV). Rekod sedia ada dikemas kini, tidak diduplikasi."
        actions={<button className="btn ghost" onClick={template}>Muat turun templat</button>} />
      <Card title="1. Pilih fail CSV">
        <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <p className="muted small">Dalam Excel: Fail → Simpan Sebagai → <b>CSV UTF-8</b>. No. KP boleh dengan atau tanpa sengkang. <b>No. MyKid murid dan sekurang-kurangnya satu No. KP ibu / bapa / penjaga wajib diisi</b>; baris tanpanya akan dilangkau.
          Kelas yang belum wujud akan dicipta secara automatik.</p>
      </Card>

      {map && (
        <Card title={`2. Padankan lajur (${rows.length} baris dijumpai)`}>
          <div className="map-grid">
            {FIELDS.map((f) => (
              <label key={f} className="field">
                <span>{f}{(f === 'nama_murid' || f === 'kelas') && ' *'}</span>
                <select value={map[f]} onChange={(e) => setMap({ ...map, [f]: e.target.value })}>
                  <option value="">(tiada)</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
          <h3 className="h3">Pratonton</h3>
          <DataTable rows={numbered} rowKey={(r) => r.__i} pageSize={10} resetKey={rows}
            cols={[
              { key: '__i', label: '#', sort: (r) => Number(r.__i), className: 'muted small', render: (r) => r.__i },
              ...FIELDS.filter((f) => map[f]).map((f) => ({ key: f, label: f, sort: (r: Record<string, string>) => r[map[f]], render: (r: Record<string, string>) => r[map[f]] })),
            ]} />
          <button className="btn primary" disabled={busy || !rows.length} onClick={doImport}>
            {busy ? `Mengimport… ${progress}%` : `Import ${rows.length} murid`}
          </button>
        </Card>
      )}

      {result && (
        <Card title="Keputusan">
          <div className="alert ok">
            {result.baru} murid baru · {result.dikemaskini} dikemas kini · {result.dilangkau} dilangkau
          </div>
          {result.amaran.length > 0 && (
            <>
              <p className="small"><b>{result.amaran.length} amaran.</b> Baris tanpa No. KP dilangkau, dan murid yang sudah berdaftar di bawah keluarga lain tidak dipautkan semula.
                Betulkan di halaman Rekod jika perlu.</p>
              <ul className="warn-list">{result.amaran.slice(0, 100).map((w, i) => <li key={i}>{w}</li>)}</ul>
            </>
          )}
        </Card>
      )}
    </>
  )
}
