import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useRole } from '../../lib/auth'
import { PageHead } from '../../components/Layout'
import { Badge, Card, Empty, Stat } from '../../components/ui'
import { feeStatusLabel, feeStatusTone, maskIC, toCSV, download } from '../../lib/util'
import type { FeeStatus } from '../Dashboard'

interface Row {
  id: number; full_name: string; ic_no: string | null; family_id: number; class_id: number
  student_guardians: { relation: string; guardians: { full_name: string; phone: string | null; user_id: string | null } }[]
}

export default function MyClass() {
  const { myClasses } = useRole()
  const [classId, setClassId] = useState<number | null>(myClasses[0]?.id ?? null)
  const [rows, setRows] = useState<Row[]>([])
  const [fees, setFees] = useState<Record<number, FeeStatus>>({})

  useEffect(() => {
    if (!classId) return
    supabase.from('students')
      .select('id,full_name,ic_no,family_id,class_id,student_guardians(relation,guardians(full_name,phone,user_id))')
      .eq('class_id', classId).eq('status', 'aktif').order('full_name')
      .then(async ({ data }) => {
        const list = (data as unknown as Row[]) ?? []
        setRows(list)
        const ids = [...new Set(list.map((r) => r.family_id))]
        if (ids.length) {
          const { data: f } = await supabase.from('family_fee_status').select('*').in('family_id', ids)
          setFees(Object.fromEntries(((f as FeeStatus[]) ?? []).map((x) => [x.family_id, x])))
        } else setFees({})
      })
  }, [classId])

  const summary = useMemo(() => {
    const s = { lunas: 0, menunggu: 0, belum: 0, akaun: 0 }
    rows.forEach((r) => {
      const st = fees[r.family_id]?.status
      if (st) s[st]++
      if (r.student_guardians.some((g) => g.guardians?.user_id)) s.akaun++
    })
    return s
  }, [rows, fees])

  const exportCSV = () => {
    const cls = myClasses.find((c) => c.id === classId)?.name ?? 'kelas'
    download(`${cls}-murid.csv`, toCSV(rows.map((r) => ({
      nama: r.full_name,
      penjaga: r.student_guardians.map((g) => g.guardians?.full_name).join(' / '),
      telefon: r.student_guardians.map((g) => g.guardians?.phone).filter(Boolean).join(' / '),
      kod_keluarga: fees[r.family_id]?.family_code ?? '',
      yuran: feeStatusLabel[fees[r.family_id]?.status ?? 'belum'],
      akaun_portal: r.student_guardians.some((g) => g.guardians?.user_id) ? 'Ya' : 'Tidak',
    }))))
  }

  if (!myClasses.length) return <Empty>Anda belum ditetapkan sebagai guru kelas. Hubungi pentadbir.</Empty>

  return (
    <>
      <PageHead title="Kelas Saya" actions={
        <>
          {myClasses.length > 1 && (
            <select value={classId ?? ''} onChange={(e) => setClassId(Number(e.target.value))}>
              {myClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <button className="btn ghost" onClick={exportCSV}>Muat turun CSV</button>
        </>
      } />
      <div className="stats">
        <Stat label="Murid" value={rows.length} />
        <Stat label="Ibu bapa ada akaun portal" value={`${summary.akaun} / ${rows.length}`} />
        <Stat label="Yuran lunas" value={summary.lunas} tone="green" />
        <Stat label="Belum bayar" value={summary.belum} tone={summary.belum ? 'red' : undefined} />
      </div>
      <Card>
        {rows.length ? (
          <table className="table">
            <thead><tr><th>#</th><th>Nama murid</th><th>Ibu bapa / penjaga</th><th>Keluarga</th><th>Yuran</th></tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const f = fees[r.family_id]
                return (
                  <tr key={r.id}>
                    <td>{i + 1}</td>
                    <td><strong>{r.full_name}</strong><div className="muted small">{maskIC(r.ic_no)}</div></td>
                    <td>
                      {r.student_guardians.map((g, k) => (
                        <div key={k} className="small">
                          {g.guardians?.full_name} {g.guardians?.phone && <span className="muted">· {g.guardians.phone}</span>}
                          {g.guardians?.user_id && <span title="Ada akaun portal"> ✓</span>}
                        </div>
                      ))}
                    </td>
                    <td>
                      <span className="mono">{f?.family_code}</span>
                      {f && f.active_children > 1 && <div className="muted small">{f.active_children} beradik</div>}
                    </td>
                    <td>{f && <Badge tone={feeStatusTone[f.status]}>{feeStatusLabel[f.status]}</Badge>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : <Empty>Tiada murid dalam kelas ini lagi.</Empty>}
      </Card>
    </>
  )
}
