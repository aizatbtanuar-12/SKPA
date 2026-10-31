import type { Role } from './supabase'

export const rm = (n: number | string | null | undefined) =>
  'RM ' + Number(n ?? 0).toLocaleString('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const date = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'

export const dateTime = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'

export const normIC = (v: string) => v.replace(/\D/g, '')
export const maskIC = (v: string | null | undefined) => (v ? '••••••-••-' + v.slice(-4) : '-')
export const fmtIC = (v: string | null | undefined) =>
  v && v.length === 12 ? `${v.slice(0, 6)}-${v.slice(6, 8)}-${v.slice(8)}` : v || '-'
export const validIC = (v: string) => /^\d{12}$/.test(normIC(v))

export const roleLabel: Record<Role, string> = {
  admin: 'Pentadbir',
  pibg: 'AJK PIBG',
  panitia: 'Ketua Panitia',
  guru: 'Guru Kelas',
  parent: 'Ibu Bapa / Penjaga',
}

export const relationLabel: Record<string, string> = { bapa: 'Bapa', ibu: 'Ibu', penjaga: 'Penjaga' }

export const feeStatusLabel: Record<string, string> = { lunas: 'Lunas', menunggu: 'Menunggu semakan', belum: 'Belum bayar' }
export const feeStatusTone: Record<string, Tone> = { lunas: 'green', menunggu: 'amber', belum: 'red' }

export const claimLabel: Record<string, string> = {
  menunggu: 'Menunggu pengesahan guru kelas',
  dipadan: 'Disahkan',
  rekod_baru: 'Disahkan (rekod baru)',
  ditolak: 'Ditolak',
}
export const claimTone: Record<string, Tone> = { menunggu: 'amber', dipadan: 'green', rekod_baru: 'green', ditolak: 'red' }

export const payLabel: Record<string, string> = { dihantar: 'Menunggu semakan', diluluskan: 'Diluluskan', ditolak: 'Ditolak' }
export const payTone: Record<string, Tone> = { dihantar: 'amber', diluluskan: 'green', ditolak: 'red' }

export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'grey'

/** Build a CSV string (Excel-friendly, with BOM) */
export function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const cols = Object.keys(rows[0])
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n')
}

export function download(filename: string, content: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))
