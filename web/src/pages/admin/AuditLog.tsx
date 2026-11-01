import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Spinner } from '../../components/ui'
import { DataTable, type Col } from '../../components/DataTable'
import { dateTime } from '../../lib/util'

interface Entry { id: number; at: string; actor: string | null; action: string; target: string | null; detail: Record<string, unknown> | null }

const actionLabel: Record<string, string> = {
  peranan_ditukar: 'Peranan ditukar',
  no_kp_ditukar: 'No. KP ditukar',
  no_kp_dilihat: 'No. KP penuh dilihat',
  akses_ditukar: 'Akses peranan ditukar',
  penjaga_dipautkan: 'Penjaga dipautkan',
  data_dimuat_turun: 'Data peribadi dimuat turun',
}

const detailText = (e: Entry) => {
  const d = e.detail ?? {}
  if (e.action === 'peranan_ditukar') return `${d.nama ?? ''}: ${d.dari} → ${d.kepada}`
  if (e.action === 'no_kp_ditukar') return `${d.nama ?? ''}: …${d.akhir_lama ?? '-'} → …${d.akhir_baru ?? '-'}`
  if (e.action === 'akses_ditukar') return `${e.target}: ${d.dibenarkan ? 'dibenarkan' : 'ditarik balik'}`
  if (e.action === 'data_dimuat_turun') return ''
  const [kind, id] = (e.target ?? '').split(':')
  const k = ({ student: 'Murid', guardian: 'Penjaga', profile: 'Pengguna' } as Record<string, string>)[kind]
  return k && id ? `${k} #${id}` : e.target ?? ''
}

/** Tetapan → Log audit (administrator only): who did what with personal data. */
export default function AuditLog() {
  const [rows, setRows] = useState<Entry[] | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('audit_log').select('id,at,actor,action,target,detail').order('at', { ascending: false }).limit(1000)
      .then(async ({ data, error }) => {
        if (error) { setErr('Sila jalankan supabase/migrations/014_privacy.sql dalam Supabase SQL Editor dahulu.'); return }
        const list = (data ?? []) as Entry[]
        const ids = [...new Set(list.map((e) => e.actor).filter(Boolean))] as string[]
        if (ids.length) {
          const { data: ps } = await supabase.from('profiles').select('id,full_name').in('id', ids)
          setNames(Object.fromEntries(((ps ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name])))
        }
        setRows(list)
      })
  }, [])

  if (err) return <div className="callout">{err}</div>
  if (!rows) return <Spinner />
  const cols: Col<Entry>[] = [
    { key: 'at', label: 'Masa', sort: (e) => e.at, render: (e) => dateTime(e.at) },
    { key: 'actor', label: 'Oleh', sort: (e) => names[e.actor ?? ''] ?? '', render: (e) => (e.actor ? names[e.actor] ?? 'Pengguna' : 'Sistem') },
    { key: 'action', label: 'Tindakan', sort: (e) => e.action, render: (e) => actionLabel[e.action] ?? e.action },
    { key: 'detail', label: 'Butiran', render: (e) => <span className="no-i18n">{detailText(e)}</span> },
  ]
  return (
    <div className="card">
      <p className="muted small" style={{ marginTop: 0 }}>Rekod tindakan sensitif ke atas data peribadi: pertukaran peranan dan akses, pertukaran atau paparan No. KP penuh, dan muat turun data. Log ini tidak boleh diubah atau dipadam dari aplikasi.</p>
      <DataTable rows={rows} cols={cols} rowKey={(e) => e.id} initialSort={{ key: 'at', dir: 'desc' }} empty="Tiada rekod lagi." storeKey="audit" />
    </div>
  )
}
