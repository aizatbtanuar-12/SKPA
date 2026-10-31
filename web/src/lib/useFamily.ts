import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'
import type { FeeStatus } from '../pages/Dashboard'
import type { Payment } from '../pages/parent/ParentFees'

export interface Kid { id: number; full_name: string; ic_no: string | null; className: string; year: number | null }

/** The signed-in parent's family: fee status, children, payments. Same queries as before the redesign. */
export function useFamily() {
  const { familyId } = useAuth()
  const [fee, setFee] = useState<FeeStatus | null>(null)
  const [kids, setKids] = useState<Kid[]>([])
  const [pays, setPays] = useState<Payment[]>([])
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async () => {
    if (!familyId) { setLoaded(true); return }
    const [s, k, p] = await Promise.all([
      supabase.from('family_fee_status').select('*').eq('family_id', familyId).maybeSingle(),
      supabase.from('students').select('id,full_name,ic_no,classes(name,year_level)').eq('family_id', familyId).eq('status', 'aktif'),
      supabase.from('fee_payments').select('*').eq('family_id', familyId).order('submitted_at', { ascending: false }),
    ])
    setFee(s.data as FeeStatus | null)
    type Row = { id: number; full_name: string; ic_no: string | null; classes: { name: string; year_level: number | null } | null }
    setKids((((k.data as unknown) as Row[]) ?? [])
      .map((r) => ({ id: r.id, full_name: r.full_name, ic_no: r.ic_no, className: r.classes?.name ?? '-', year: r.classes?.year_level ?? null }))
      .sort((a, b) => (a.year ?? 99) - (b.year ?? 99) || a.full_name.localeCompare(b.full_name)))
    setPays((p.data as Payment[]) ?? [])
    setLoaded(true)
  }, [familyId])

  useEffect(() => { reload() }, [reload])
  const latestReceipt = pays.find((x) => x.status === 'diluluskan' && x.year === fee?.year && x.receipt_no) ?? null
  return { familyId, fee, kids, pays, loaded, reload, latestReceipt }
}

export const levelName = (y: number | null) => (y === 0 ? 'Prasekolah' : y === 7 ? 'PPKI' : y ? `Tahun ${y}` : '')
