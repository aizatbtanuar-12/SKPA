import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { Card, Spinner, useToast } from '../../components/ui'
import { roleLabel } from '../../lib/util'
import { EDITABLE_ROLES, PERMS } from '../../lib/perms'

type Matrix = Record<string, Record<string, boolean>>

/** Tetapan → Akses pengguna (administrator only): which role may change what. */
export default function AccessSettings() {
  const { refresh } = useAuth()
  const toast = useToast()
  const [m, setM] = useState<Matrix | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('role_permissions').select('role,perm,allowed').then(({ data, error }) => {
      if (error) { setErr('Sila jalankan supabase/migrations/010_access.sql dalam Supabase SQL Editor dahulu.'); return }
      const x: Matrix = {}
      ;((data ?? []) as { role: string; perm: string; allowed: boolean }[]).forEach((r) => { (x[r.role] ??= {})[r.perm] = r.allowed })
      setM(x)
    })
  }, [])

  const toggle = async (role: string, perm: string) => {
    if (!m) return
    const next = !m[role]?.[perm]
    const id = `${role}:${perm}`
    setSaving(id)
    setM({ ...m, [role]: { ...m[role], [perm]: next } })
    const { error } = await supabase.from('role_permissions').upsert({ role, perm, allowed: next, updated_at: new Date().toISOString() })
    setSaving(null)
    if (error) { setM({ ...m }); toast(error.message, 'err'); return }
    toast(`${roleLabel[role as keyof typeof roleLabel]}: ${PERMS.find((p) => p.key === perm)?.label} ${next ? 'dibenarkan' : 'ditarik balik'}.`)
    refresh()
  }

  if (err) return <div className="callout">{err}</div>
  if (!m) return <Spinner />

  const groups = [...new Set(PERMS.map((p) => p.group))]
  return (
    <Card title="Akses pengguna" actions={<span className="muted small">Perubahan berkuat kuasa serta-merta</span>}>
      <p className="muted small" style={{ marginTop: 0 }}>
        Tandakan apa yang boleh <b>diubah</b> oleh setiap peranan. Semua AJK (Pengerusi, Bendahari, AJK PIBG) masih boleh <b>melihat</b> rekod.
        Pentadbir sentiasa mempunyai semua akses. Tetapkan peranan setiap pengguna di halaman <b>Pengguna &amp; Kelas</b>.
      </p>
      <div className="dt-scroll">
        <table className="table access-table">
          <thead>
            <tr>
              <th>Akses</th>
              <th className="c">{roleLabel.admin}</th>
              {EDITABLE_ROLES.map((r) => <th key={r} className="c">{roleLabel[r]}</th>)}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => [
              <tr key={g} className="grp"><td colSpan={EDITABLE_ROLES.length + 2}>{g}</td></tr>,
              ...PERMS.filter((p) => p.group === g).map((p) => (
                <tr key={p.key}>
                  <td><b>{p.label}</b><div className="muted small">{p.hint}</div></td>
                  <td className="c"><span className="tick fixed" title="Pentadbir sentiasa dibenarkan">✓</span></td>
                  {EDITABLE_ROLES.map((r) => {
                    const on = Boolean(m[r]?.[p.key])
                    return (
                      <td key={r} className="c">
                        <button type="button" role="switch" aria-checked={on} aria-label={`${roleLabel[r]}: ${p.label}`}
                          className={`tick ${on ? 'on' : ''}`} disabled={saving === `${r}:${p.key}`} onClick={() => toggle(r, p.key)}>
                          {on ? '✓' : ''}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
