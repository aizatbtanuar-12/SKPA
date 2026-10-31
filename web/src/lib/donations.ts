import { supabase } from './supabase'

export interface Campaign {
  id: number
  title: string
  code: string
  description: string | null
  poster_path: string | null
  target_amount: number | null
  suggested_amount: number | null
  start_date: string | null
  end_date: string | null
  status: 'draf' | 'aktif' | 'ditutup'
  created_at: string
}

export interface Progress { campaign_id: number; collected: number; donors: number; pending: number }

export interface Donation {
  id: number
  campaign_id: number
  family_id: number | null
  donor_name: string | null
  amount: number
  method: string
  reference: string | null
  proof_path: string | null
  status: 'dihantar' | 'diluluskan' | 'ditolak'
  receipt_no: string | null
  submitted_at: string
  reviewed_at: string | null
  /** date on the bank receipt (migration 011) */
  paid_on?: string | null
  review_note: string | null
}

export const campaignStatus: Record<string, [string, 'grey' | 'green' | 'blue']> = {
  draf: ['Draf', 'grey'], aktif: ['Sedang dikutip', 'green'], ditutup: ['Ditutup', 'blue'],
}

export const posterUrl = (path: string | null) =>
  path ? supabase.storage.from('poster-kempen').getPublicUrl(path).data.publicUrl : null

export async function loadProgress(): Promise<Record<number, Progress>> {
  const { data } = await supabase.rpc('campaign_progress')
  return Object.fromEntries(((data as Progress[]) ?? []).map((p) => [p.campaign_id, p]))
}

/** The remark parents type in their bank transfer: drive code + family code */
export const transferRemark = (code: string, familyCode?: string | null) => `${code} ${familyCode ?? 'NAMA ANDA'}`

export const pct = (collected: number, target: number | null) =>
  target ? Math.min(100, Math.round((Number(collected) / Number(target)) * 100)) : null

export const daysLeft = (end: string | null) => {
  if (!end) return null
  const d = Math.ceil((new Date(end + 'T23:59:59').getTime() - Date.now()) / 86400000)
  return d
}
