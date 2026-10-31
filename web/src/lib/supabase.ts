import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configured = Boolean(url && key)

export const supabase = createClient(url || 'http://localhost', key || 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true },
})

export type Role = 'admin' | 'pengerusi' | 'bendahari' | 'pibg' | 'panitia' | 'guru' | 'parent'

export interface Profile {
  id: string
  full_name: string
  ic_no: string | null
  phone: string | null
  role: Role
  panitia: string | null
  pdpa_consent_at: string | null
  // spouse (migration 009)
  relation?: 'bapa' | 'ibu' | 'penjaga' | null
  spouse_name?: string | null
  spouse_ic?: string | null
  spouse_phone?: string | null
  no_spouse?: boolean | null
}

export interface Settings {
  school_name: string
  school_code: string | null
  current_year: number
  fee_per_family: number
  bank_name: string | null
  bank_account: string | null
  bank_holder: string | null
  contact_phone: string | null
  // receipt layout (migration 005); optional so the app still works before it is run
  receipt_org_name?: string | null
  receipt_title?: string | null
  receipt_header?: string | null
  receipt_footer?: string | null
  receipt_show_logo?: boolean | null
  receipt_signatory?: string | null
  receipt_note?: string | null
}

export interface ClassRow {
  id: number
  name: string
  year_level: number | null
  class_teacher_id: string | null
  active: boolean
}

/** Throws a readable Malay/English message from a Supabase error */
export function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}
