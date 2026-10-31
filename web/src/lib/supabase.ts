import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configured = Boolean(url && key)

export const supabase = createClient(url || 'http://localhost', key || 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true },
})

export type Role = 'admin' | 'pibg' | 'panitia' | 'guru' | 'parent'

export interface Profile {
  id: string
  full_name: string
  ic_no: string | null
  phone: string | null
  role: Role
  panitia: string | null
  pdpa_consent_at: string | null
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
